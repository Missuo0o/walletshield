import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { encodeFunctionData, decodeFunctionResult, erc20Abi, parseAbi, decodeEventLog, keccak256, toHex } from 'viem';
import type { SecurityConfig } from './config.js';
import type { Evidence, Operation, SecurityRequest } from './types.js';
import { evidence } from './evidence.js';
import {swapExperiment,reverseSwapCalldata} from './swap-experiments.js';
import {captureForkProtocolState,forkProtocolEvidence} from './fork-protocol-state.js';
import {swapFundingBinding} from './swap-trust.js';
import {captureForkAuthorityState,forkAuthorityEvidence} from './fork-authority-state.js';
import {executionLimitations} from './transaction-fields.js';
import {isolatedForkTraceEvidence,TRACE_LIMITS,type ForkTraceContext} from './trace.js';
type Rpc=(method:string,params?:unknown[])=>Promise<any>;
export type ForkSession=ForkTraceContext&{rpc:Rpc;close:()=>Promise<void>};
export type ForkFactory=(config:SecurityConfig,chainId:number)=>Promise<ForkSession>;
const nftAbi=parseAbi(['function ownerOf(uint256) view returns (address)','function balanceOf(address,uint256) view returns(uint256)','function getApproved(uint256) view returns(address)','function isApprovedForAll(address,address) view returns(bool)','event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)','event TransferBatch(address indexed operator,address indexed from,address indexed to,uint256[] ids,uint256[] values)']);
const eq=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
const isAddress=(s:unknown):s is `0x${string}`=>typeof s==='string'&&/^0x[\da-f]{40}$/i.test(s);
const rawRpc=(url:string,signal:AbortSignal,responseBytes=8000000):Rpc=>async(method,params=[])=>{
  const r=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  if(!r.ok)throw Error('RPC unavailable');
  const reader=r.body?.getReader();if(!reader)throw Error('RPC response unavailable');const parts:Uint8Array[]=[];let size=0;
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>responseBytes){await reader.cancel();throw Error('RPC response too large');}parts.push(part.value);}
  const b=JSON.parse(Buffer.concat(parts).toString('utf8'));if(b.jsonrpc!=='2.0'||b.id!==1||b.error||b.result===undefined)throw Error('RPC operation failed');return b.result;
};
function observedGasCost(receipt:any):bigint|null {
  return typeof receipt.gasUsed==='string'&&/^0x[\da-f]+$/i.test(receipt.gasUsed)&&typeof receipt.effectiveGasPrice==='string'&&/^0x[\da-f]+$/i.test(receipt.effectiveGasPrice)?BigInt(receipt.gasUsed)*BigInt(receipt.effectiveGasPrice):null;
}
async function forkProxy(upstream:string,signal:AbortSignal){
  const route=`/${randomUUID()}`;
  const reads=new Set(['eth_chainId','net_version','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getBalance','eth_getCode','eth_getStorageAt','eth_getTransactionCount','eth_getProof','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getLogs','eth_feeHistory','eth_gasPrice','eth_maxPriorityFeePerGas']);
  let active=0;
  const server=createHttpServer(async(request,response)=>{
    let accepted=false;const deadline=setTimeout(()=>request.destroy(),4000);
    try{
      if(request.method!=='POST'||request.url!==route||!request.headers['content-type']?.startsWith('application/json'))throw Error('Invalid proxy request');
      if(active>=16)throw Error('Fork read concurrency limit');active++;accepted=true;
      const chunks:Buffer[]=[];let length=0;
      for await(const chunk of request){length+=chunk.length;if(length>250000)throw Error('Proxy request too large');chunks.push(Buffer.from(chunk));}
      const body=Buffer.concat(chunks).toString('utf8'),parsed=JSON.parse(body),calls=Array.isArray(parsed)?parsed:[parsed];
      if(!calls.length||calls.length>128||calls.some(call=>!call||!reads.has(call.method)||call.jsonrpc!=='2.0'))throw Error('Only fork reads allowed');
      const result=await fetch(upstream,{method:'POST',headers:{'Content-Type':'application/json'},body,redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(3500)])});
      if(!result.ok)throw Error('Upstream read failed');
      const reader=result.body?.getReader();if(!reader)throw Error('Empty fork response');
      const parts:Buffer[]=[];let size=0;
      for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>8000000){await reader.cancel();throw Error('Proxy response too large');}parts.push(Buffer.from(part.value));}
      response.writeHead(200,{'Content-Type':'application/json'});response.end(Buffer.concat(parts));
    }catch{if(!response.headersSent)response.writeHead(502,{'Content-Type':'application/json'});response.end('{"error":"Fork read unavailable"}');}
    finally{clearTimeout(deadline);if(accepted)active--;}
  });
  server.headersTimeout=4000;server.requestTimeout=4000;
  try{await new Promise<void>((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});}
  catch{server.close();throw Error('Fork proxy unavailable');}
  const address=server.address();if(!address||typeof address==='string'){server.close();throw Error('Fork proxy unavailable');}
  return {url:`http://127.0.0.1:${address.port}${route}`,close:async()=>{server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}};
}
export const openFork:ForkFactory=async(config,chainId)=>{
  const upstream=config.rpc[chainId];if(!upstream)throw Error('Network not configured');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  const upstreamRpc=rawRpc(upstream,controller.signal);
  let base:any;let port:number;let proxy:Awaited<ReturnType<typeof forkProxy>>|undefined;
  try {
    if(Number(BigInt(await upstreamRpc('eth_chainId')))!==chainId)throw Error('Wrong network');
    base=await upstreamRpc('eth_getBlockByNumber',['latest',false]);
    // A fork is bound to one complete base header. Two missing hashes must
    // never compare equal and become an apparently verified snapshot.
    if(!base||typeof base.number!=='string'||!/^0x[\da-f]{1,64}$/i.test(base.number)||typeof base.hash!=='string'||!/^0x[\da-f]{64}$/i.test(base.hash)||typeof base.timestamp!=='string'||!/^0x[\da-f]{1,64}$/i.test(base.timestamp))throw Error('Incomplete fork base header');
    proxy=await forkProxy(upstream,controller.signal);
    const listener=createServer();await new Promise<void>((ok,bad)=>{listener.once('error',bad);listener.listen(0,'127.0.0.1',ok);});
    const address=listener.address();if(!address||typeof address==='string')throw Error('Port unavailable');port=address.port;
    await new Promise<void>(ok=>listener.close(()=>ok()));
  } catch {clearTimeout(timer);controller.abort();await proxy?.close();throw Error('Fork preparation failed');}
  // Child stdout/stderr never surface RPC URLs, keys or generated test secrets.
  // Every state-changing RPC below targets only this child on loopback.
  // The child sees only a temporary loopback endpoint. RPC URL paths commonly
  // contain credentials, so the configured upstream must never enter argv.
  const child=spawn(process.execPath,[resolve('node_modules/@foundry-rs/anvil/bin.mjs'),'--host','127.0.0.1','--port',String(port),'--chain-id',String(chainId),'--fork-url',proxy!.url,'--fork-block-number',String(BigInt(base.number)),'--accounts','0','--silent','--no-storage-caching'],{stdio:'ignore',env:{PATH:process.env.PATH,TMPDIR:process.env.TMPDIR,TARGET_TOOL:'anvil',RUST_LOG:'error'}});
  let exited=false;child.once('exit',()=>{exited=true;});child.once('error',()=>{exited=true;});
  const abort=()=>child.kill('SIGTERM');controller.signal.addEventListener('abort',abort,{once:true});
  const rpc=rawRpc(`http://127.0.0.1:${port}`,controller.signal);
  const close=async()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);controller.abort();await proxy?.close();if(exited)return;await new Promise<void>(ok=>{const force=setTimeout(()=>{child.kill('SIGKILL');ok();},800);child.once('exit',()=>{clearTimeout(force);ok();});child.kill('SIGTERM');});};
  try {
    let ready=false;
    for(let i=0;i<60&&!exited&&!controller.signal.aborted;i++){
      try {if(Number(BigInt(await rpc('eth_chainId')))!==chainId)throw Error('Wrong child');const block=await rpc('eth_getBlockByNumber',[base.number,false]);if(typeof block?.hash!=='string'||block.hash.toLowerCase()!==base.hash.toLowerCase())throw Error('Fork mismatch');ready=true;break;}catch{await new Promise(ok=>setTimeout(ok,60));}
    }
    if(!ready)throw Error('Fork unavailable');
    const traceMethods=new Set(['eth_chainId','eth_getBlockByNumber','debug_traceCall']);
    const traceRpc=async(method:string,params:unknown[],signal:AbortSignal)=>{
      if(!traceMethods.has(method))throw Error('Read-only fork trace method required');
      return rawRpc(`http://127.0.0.1:${port}`,AbortSignal.any([controller.signal,signal]),TRACE_LIMITS.responseBytes)(method,params);
    };
    const verifyTraceSource=async(signal:AbortSignal)=>{
      const read=rawRpc(upstream,AbortSignal.any([controller.signal,signal,AbortSignal.timeout(TRACE_LIMITS.requestMs)]),TRACE_LIMITS.responseBytes);
      const [observedChain,header]=await Promise.all([read('eth_chainId'),read('eth_getBlockByNumber',[base.number,false])]);
      return typeof observedChain==='string'&&/^0x[\da-f]{1,64}$/i.test(observedChain)&&BigInt(observedChain)===BigInt(chainId)&&typeof header?.number==='string'&&/^0x[\da-f]{1,64}$/i.test(header.number)&&BigInt(header.number)===BigInt(base.number)&&typeof header.hash==='string'&&header.hash.toLowerCase()===base.hash.toLowerCase()&&typeof header.timestamp==='string'&&/^0x[\da-f]{1,64}$/i.test(header.timestamp)&&BigInt(header.timestamp)===BigInt(base.timestamp);
    };
    return {rpc,chainId,blockNumber:String(BigInt(base.number)),blockHash:base.hash,...(typeof base.timestamp==='string'&&/^0x[\da-f]+$/i.test(base.timestamp)?{blockTimestampSeconds:String(BigInt(base.timestamp))}:{}),traceRpc,verifyTraceSource,close};
  }catch{await close();throw Error('Isolated fork unavailable');}
};
function forkSnapshot(fork:ForkSession){return {chainId:fork.chainId,blockNumber:fork.blockNumber,blockHash:fork.blockHash,...(fork.blockTimestampSeconds!==undefined?{blockTimestampSeconds:fork.blockTimestampSeconds}:{})};}
type Asset={kind:'erc20'|'erc721'|'erc1155';contract:`0x${string}`;tokenId?:string};
const transferTopic=keccak256(toHex('Transfer(address,address,uint256)'));
export const SIMULATION_LIMITS={receiptLogs:256,discoveredAssets:32,erc1155IdsPerEvent:64,traceDepth:20,traceCalls:128} as const;
export const FORK_SNAPSHOT_LIMITS={verificationMs:2200} as const;
/** A fork lazily fetches upstream state while executing. Trace-time binding
 * alone cannot establish that the source stayed canonical for the later
 * execution, asset reads and derived reverse-swap experiment. */
async function finalizeForkSnapshot(fork:ForkSession,chainId:number,checks:Evidence[]){
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  if(fork.chainId!==chainId||!/^\d+$/.test(fork.blockNumber)||!/^0x[\da-f]{64}$/i.test(fork.blockHash)||!fork.blockTimestampSeconds||!/^\d+$/.test(fork.blockTimestampSeconds)||!fork.verifyTraceSource)throw Error('Incomplete source binding');
  const signal=AbortSignal.timeout(FORK_SNAPSHOT_LIMITS.verificationMs);
  const verified=await Promise.race([Promise.resolve().then(()=>fork.verifyTraceSource!(signal)),new Promise<false>(resolve=>{timer=setTimeout(()=>resolve(false),FORK_SNAPSHOT_LIMITS.verificationMs);})]);
  if(verified!==true)throw Error('Source snapshot changed');
  for(const check of checks)if(check.source==='isolated-fork'&&(check.data?.blockHash===fork.blockHash||check.data?.baseBlockHash===fork.blockHash))check.data={...check.data,sourceSnapshotConsistency:'verified_after_execution'};
 }catch{
  // No successful execution, asset delta, protocol comparison or sell result
  // from this private fork may survive under an unverified source hash.
  checks.splice(0,checks.length,evidence('asset_simulation','unknown','Isolated fork source snapshot could not be verified','The source chain or base header changed, was incomplete, timed out, or could not be rechecked after execution. All observations from this fork were discarded; no execution, asset, permission or sellability conclusion is retained. No upstream transaction was sent.','isolated-fork',{chainId,requestedBlockNumber:fork.blockNumber,sourceSnapshotConsistent:false}),evidence('fork_source_snapshot','unknown','Fork observations discarded after source verification failed','The complete fork group, including any earlier call trace and reverse-swap experiment, requires a canonical source header after the related work. Missing or inconsistent state is not a safety pass.','isolated-fork',{chainId,requestedBlockNumber:fork.blockNumber,sourceSnapshotConsistent:false}));
 }finally{if(timer!==undefined)clearTimeout(timer);}
}
function discoverAssets(logs:unknown){
  const assets:Asset[]=[],entries=Array.isArray(logs)?logs:[];let identifierEventsTruncated=0;
  for(const log of entries.slice(0,SIMULATION_LIMITS.receiptLogs)){
    if(!log||typeof log!=='object')continue;
    if(!isAddress(log.address)||!Array.isArray(log.topics))continue;
    // Event names and topic counts alone do not make malformed log bytes an
    // asset observation. A bad event must not discard other execution facts.
    if(log.topics[0]===transferTopic&&log.topics.every((topic:unknown)=>typeof topic==='string'&&/^0x[\da-f]{64}$/i.test(topic))){if(log.topics.length===3&&typeof log.data==='string'&&/^0x[\da-f]{64}$/i.test(log.data))assets.push({kind:'erc20',contract:log.address});else if(log.topics.length===4&&log.data==='0x')assets.push({kind:'erc721',contract:log.address,tokenId:String(BigInt(log.topics[3]))});}
    try {const parsed=decodeEventLog({abi:nftAbi,data:log.data,topics:log.topics});if(parsed.eventName==='TransferSingle')assets.push({kind:'erc1155',contract:log.address,tokenId:String(parsed.args.id)});if(parsed.eventName==='TransferBatch'){if(parsed.args.ids.length>SIMULATION_LIMITS.erc1155IdsPerEvent)identifierEventsTruncated++;for(const id of parsed.args.ids.slice(0,SIMULATION_LIMITS.erc1155IdsPerEvent))assets.push({kind:'erc1155',contract:log.address,tokenId:String(id)});}}catch{/* Other events are not assets. */}
  }
  const unique=[...new Map(assets.map(a=>[JSON.stringify(a),a])).values()];
  return {assets:unique.slice(0,SIMULATION_LIMITS.discoveredAssets),inventory:{receiptLogCount:Array.isArray(logs)?logs.length:null,inspectedLogCount:Math.min(entries.length,SIMULATION_LIMITS.receiptLogs),logsTruncated:entries.length>SIMULATION_LIMITS.receiptLogs,identifierEventsTruncated,discoveredUniqueAssets:unique.length,assetsTruncated:unique.length>SIMULATION_LIMITS.discoveredAssets,receiptLogsAvailable:Array.isArray(logs)}};
}
export function assetsFromLogs(logs:any[]):Asset[]{return discoverAssets(logs).assets;}
async function readAsset(rpc:Rpc,asset:Asset,owner:string):Promise<string|null>{
  try {
    const data=asset.kind==='erc20'?encodeFunctionData({abi:erc20Abi,functionName:'balanceOf',args:[owner as `0x${string}`]}):asset.kind==='erc721'?encodeFunctionData({abi:nftAbi,functionName:'ownerOf',args:[BigInt(asset.tokenId!)]}):encodeFunctionData({abi:nftAbi,functionName:'balanceOf',args:[owner as `0x${string}`,BigInt(asset.tokenId!)]});
    const result=await rpc('eth_call',[{to:asset.contract,data},'latest']);
    // Decode the complete ABI value. In particular, empty / truncated ownerOf
    // output must stay unknown rather than becoming an apparent new owner.
    const decoded=decodeFunctionResult({abi:asset.kind==='erc20'?erc20Abi:nftAbi,functionName:asset.kind==='erc721'?'ownerOf':'balanceOf',data:result});
    return String(decoded);
  }catch{return null;}
}
async function send(rpc:Rpc,tx:{from:string;to?:string|null;data:string;value?:string;gas?:string;gasPrice?:string;maxFeePerGas?:string;maxPriorityFeePerGas?:string;nonce?:string;type?:string}){
  await rpc('anvil_impersonateAccount',[tx.from]);
  const executionFields=Object.fromEntries((['gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce','type'] as const).filter(key=>tx[key]!==undefined).map(key=>[key,tx[key]]));
  const hash=await rpc('eth_sendTransaction',[{from:tx.from,...(tx.to?{to:tx.to}:{}),data:tx.data,value:tx.value??'0x0',gas:tx.gas??'0xb71b00',...executionFields}]);
  let receipt;
  for(let i=0;i<30;i++){receipt=await rpc('eth_getTransactionReceipt',[hash]);if(receipt)break;await new Promise(ok=>setTimeout(ok,50));}
  if(!receipt||receipt.status!=='0x1')throw Error('Simulated execution reverted');return {hash,receipt};
}
function traceSummary(root:any){
  const calls:{type:string;from?:string;to?:string;value?:string;selector?:string;error?:string}[]=[],gaps=new Set<string>();
  const walk=(node:any,depth:number)=>{
    if(!node||typeof node!=='object'||typeof node.type!=='string'){gaps.add('malformed_trace_node');return;}
    if(depth>SIMULATION_LIMITS.traceDepth){gaps.add('trace_depth_limit');return;}
    if(calls.length>=SIMULATION_LIMITS.traceCalls){gaps.add('trace_call_limit');return;}
    calls.push({type:node.type.slice(0,32),...(isAddress(node.from)?{from:node.from}:{}),...(isAddress(node.to)?{to:node.to}:{}),...(typeof node.value==='string'?{value:node.value}:{}),...(typeof node.input==='string'?{selector:node.input.slice(0,10)}:{}),...(node.error?{error:String(node.error).slice(0,120)}:{})});
    if(node.calls!==undefined&&!Array.isArray(node.calls)){gaps.add('malformed_trace_children');return;}
    const children=node.calls??[];if(children.length>SIMULATION_LIMITS.traceCalls)gaps.add('trace_call_limit');
    for(const call of children.slice(0,SIMULATION_LIMITS.traceCalls))walk(call,depth+1);
  };walk(root,0);return {calls,gaps:[...gaps]};
}
export async function simulateRequest(request:SecurityRequest,op:Operation,config:SecurityConfig,factory:ForkFactory=openFork):Promise<Evidence[]>{
  if(request.kind!=='transaction')return [];
  const unsupported=executionLimitations(request.transaction);
  if(unsupported.length)return [evidence('asset_simulation','unknown','Special transaction envelope cannot be simulated completely','Delegation, blob, or other unsupported execution fields are not silently removed to execute a substitute transaction.','coverage',{unsupportedFields:unsupported})];
  if(!config.forkEnabled)return [evidence('asset_simulation','unknown','Isolated fork simulation is disabled','This request has not been executed on an isolated chain fork.','configuration')];
  let fork:ForkSession|undefined,output:Evidence[]|undefined;let retainedProtocol:Evidence[]=[];let retainedTrace:Evidence[]=[];let retainedExecution:Evidence|undefined;
  try {
    fork=await factory(config,request.chainId);const rpc=fork.rpc;
    retainedTrace=await isolatedForkTraceEvidence(request,fork);
    const snapshot=await rpc('evm_snapshot');
    const baseTag=`0x${BigInt(fork.blockNumber).toString(16)}`;
    const [protocolBefore,authorityBefore]=await Promise.all([captureForkProtocolState(rpc,request,op,'before',forkSnapshot(fork),baseTag).catch(()=>null),captureForkAuthorityState(rpc,request,op,'before',forkSnapshot(fork),baseTag).catch(()=>null)]);
    retainedProtocol=[...forkProtocolEvidence(protocolBefore,null),...forkAuthorityEvidence(authorityBefore,null)];
    const beforeNative=BigInt(await rpc('eth_getBalance',[request.transaction.from,'latest']));
    let executed;
    try{executed=await send(rpc,request.transaction);}catch{return output=[...retainedTrace,...retainedProtocol,evidence('simulation_execution','unknown','Fork execution incomplete','The request reverted, had insufficient gas, or the fork was unavailable. This alone does not establish a honeypot.','isolated-fork',{...forkSnapshot(fork)})];}
    const {hash,receipt}=executed;
    retainedExecution=evidence('simulation_execution','pass','Original transaction executed on the isolated fork','The original transaction has a successful receipt on the temporary fork. Some balance, protocol-state or trace observations may still be unavailable; no upstream transaction was sent.','isolated-fork',{...forkSnapshot(fork),status:'success',executionBlockNumber:typeof receipt.blockNumber==='string'?String(BigInt(receipt.blockNumber)):null});
    const afterTag=typeof receipt.blockNumber==='string'?receipt.blockNumber:'latest';
    const [protocolAfter,authorityAfter]=await Promise.all([captureForkProtocolState(rpc,request,op,'after',forkSnapshot(fork),afterTag).catch(()=>null),captureForkAuthorityState(rpc,request,op,'after',forkSnapshot(fork),afterTag).catch(()=>null)]);
    retainedProtocol=[...forkProtocolEvidence(protocolBefore,protocolAfter),...forkAuthorityEvidence(authorityBefore,authorityAfter)];
    const afterNative=BigInt(await rpc('eth_getBalance',[request.transaction.from,'latest']));
    const discovery=discoverAssets(receipt.logs),assets=discovery.assets;
    if(op.token&&isAddress(op.token)&&['erc20','erc721','erc1155'].includes(op.tokenStandard??'')&&!assets.some(a=>eq(a.contract,op.token!))) {
      if(op.tokenStandard==='erc20')assets.push({kind:'erc20',contract:op.token});
      else if(op.fields.tokenId)assets.push({kind:op.tokenStandard as 'erc721'|'erc1155',contract:op.token,tokenId:String(op.fields.tokenId)});
    }
    const after=await Promise.all(assets.map(a=>readAsset(rpc,a,request.transaction.from)));
    let calls:ReturnType<typeof traceSummary>['calls']=[],traceGaps:string[]=[];let traceAvailable=false;
    try{const trace=await rpc('debug_traceTransaction',[hash,{tracer:'callTracer'}]);if(typeof trace?.type==='string'){const summary=traceSummary(trace);calls=summary.calls;traceGaps=summary.gaps;traceAvailable=true;}}catch{/* Partial trace must remain explicit. */}
    if(await rpc('evm_revert',[snapshot])!==true)throw Error('Could not restore isolated snapshot');
    const before=await Promise.all(assets.map(a=>readAsset(rpc,a,request.transaction.from)));
    const deltas=assets.map((asset,i)=>({...asset,owner:request.transaction.from,before:before[i],after:after[i],delta:asset.kind!=='erc721'&&before[i]!==null&&after[i]!==null?String(BigInt(after[i]!)-BigInt(before[i]!)):null}));
    const gas=observedGasCost(receipt);
    const facts=[...retainedTrace,...retainedProtocol,evidence('simulation_execution','pass','Isolated fork execution completed','Execution occurred only on a temporary local fork; no transaction was sent upstream. Supplied transaction type, gas, fees, and nonce were preserved; a fork cap was used if gas was absent. The fork mines from the stated base block, so this is not a guarantee of future execution.','isolated-fork',{...forkSnapshot(fork),executionBlockNumber:receipt.blockNumber?String(BigInt(receipt.blockNumber)):null,gasLimit:request.transaction.gas??'0xb71b00',gasLimitSource:request.transaction.gas?'request':'simulation_default',status:'success',native:{before:String(beforeNative),after:String(afterNative),deltaIncludingGas:String(afterNative-beforeNative),gasWei:gas===null?null:String(gas),deltaExcludingGas:gas===null?null:String(afterNative-beforeNative+gas)},assets:deltas,calls,traceAvailable,traceTruncated:traceGaps.length>0,traceGaps,assetDiscovery:{...discovery.inventory,retainedAssetCount:assets.length},limits:SIMULATION_LIMITS}),evidence('asset_simulation','unknown','Asset discovery has coverage limits','Before/after state was read for identified assets and assets found in Transfer events. Assets without events, nonstandard storage, future proxy changes, and cross-chain results may be missed.','isolated-fork')];
    const extractionGaps=[...(!traceAvailable?['trace_unavailable']:traceGaps),...(!discovery.inventory.receiptLogsAvailable?['receipt_logs_unavailable']:[]),...(discovery.inventory.logsTruncated?['receipt_log_limit']:[]),...(discovery.inventory.identifierEventsTruncated?['erc1155_identifier_limit']:[]),...(discovery.inventory.assetsTruncated?['discovered_asset_limit']:[])];
    if(extractionGaps.length)facts.push(evidence('simulation_extraction_limits','unknown','Some fork trace or asset observations are unavailable','A successful receipt does not make this bounded trace and asset inventory complete. Unavailable or truncated calls, receipt logs and asset identifiers were not inspected; absence from the retained summary is not evidence of absence.','isolated-fork',{...forkSnapshot(fork),gaps:extractionGaps,traceAvailable,retainedTraceCalls:calls.length,assetDiscovery:{...discovery.inventory,retainedAssetCount:assets.length},limits:SIMULATION_LIMITS}));
    if(gas===null)facts.push(evidence('simulation_fee','unknown','Execution fee could not be measured','The receipt lacks a usable gas-used or effective-gas-price value. Raw native balance changes are retained; gas-adjusted native changes are not guessed using a zero fee.','isolated-fork',{...forkSnapshot(fork)}));
    if(op.addsPermission&&deltas.some(d=>d.delta!==null&&BigInt(d.delta)<0n||d.kind==='erc721'&&d.before!==null&&d.after!==null&&eq(d.before,request.transaction.from)&&!eq(d.after,request.transaction.from)))facts.push(evidence('unexpected_asset_loss','risk','Permission operation also reduced assets','The fork observed an asset decrease. The permission operation may have additional unexpected behavior.','isolated-fork',{...forkSnapshot(fork),assets:deltas}));
    if(op.category==='token_transfer'&&deltas.some(d=>d.delta!==null&&eq(d.contract,op.token??'')&&-BigInt(d.delta)>BigInt(String(op.fields.amount))))facts.push(evidence('excess_token_spend','risk','Observed token decrease exceeds the declared amount','The fork balance decrease exceeds the transfer parameter. Review extra debits or nonstandard token behavior.','isolated-fork',{...forkSnapshot(fork),assets:deltas}));
    if(op.category==='native_transfer'&&gas!==null&&afterNative-beforeNative+gas < -BigInt(request.transaction.value??'0x0'))facts.push(evidence('excess_native_spend','risk','Native-asset decrease exceeds the declared value','After accounting for observed gas, the account still decreased by more than the declared value.','isolated-fork',forkSnapshot(fork)));
    if(['swap','swap_v3'].includes(op.category))facts.push(...await roundTrip(request,op,fork,config));
    else if(op.category==='batch')facts.push(evidence('round_trip','unknown','Dependent router buy/sell experiment is unavailable','Opaque aggregator commands and arbitrary nested wrappers have no authenticated reverse route. The original transaction may have fork observations, but no synthetic sell is invented.','coverage'));
    return output=facts;
  }catch{return output=[...retainedTrace,...retainedProtocol,...(retainedExecution?[retainedExecution]:[]),evidence('asset_simulation','unknown','Isolated fork simulation failed','The node, historical state, or executor was unavailable. Asset simulation was not completed.','isolated-fork')];}
  finally{if(fork){try{if(output)await finalizeForkSnapshot(fork,request.chainId,output);}finally{await fork.close();}}}
}
async function roundTrip(request:Extract<SecurityRequest,{kind:'transaction'}>,op:Operation,fork:ForkSession,config:SecurityConfig):Promise<Evidence[]>{
 const experiment=swapExperiment(request,op),snapshot=forkSnapshot(fork);
 if(!experiment)return [evidence('round_trip','unknown','Dependent buy/sell simulation unsupported for this request','Only supported V2 reverse paths and bounded canonical V3 exact-input/exact-output token-funded routes received by the same account are covered. Unsupported V3 native funding, router-balance input, sentinel/other recipients, malformed or over-limit paths and opaque commands remain unsupported.','isolated-fork',snapshot)];
 const funding=await swapFundingBinding(request,experiment,config,fork);
 if(!funding.allowed)return [evidence('round_trip','unknown','Swap funding or recipient is not verified for the experiment',funding.reason??'The selected route cannot safely define this reverse experiment.','isolated-fork',{...snapshot,variant:experiment.variant,sourceMethod:experiment.method,inputToken:experiment.input,outputToken:experiment.output,nativeInput:experiment.nativeInput})];
 const rpc=fork.rpc,asset:Asset={kind:'erc20',contract:experiment.output},returnAsset:Asset={kind:'erc20',contract:experiment.input};
 const scope={...snapshot,variant:experiment.variant,sourceMethod:experiment.method,exactOutput:experiment.exactOutput,pathTokens:experiment.tokens,pathFees:experiment.fees.map(String),inputToken:experiment.input,outputToken:experiment.output,router:request.transaction.to,recipient:request.transaction.from,protocolIdentityVerified:false,derivedMinimumOutputRaw:'0',derivedPriceLimit:'0',derivedNonceSource:'isolated_node_pending',derivedGasLimit:'0xb71b00',originalBuyPreserved:true,inputUnit:experiment.nativeInput?'native_wei':'token_raw'};
 try {
  // The parent execution was reverted. Replay the exact original buy, including
  // supplied nonce/fees/gas. Dependent approval/sell are explicitly derived local
  // experiments with their own pending nonces, not replacements for that buy.
  const baseBalance=await readAsset(rpc,asset,request.transaction.from),baseInput=experiment.nativeInput?null:await readAsset(rpc,returnAsset,request.transaction.from);
  if(baseBalance===null||!experiment.nativeInput&&baseInput===null)throw Error('Missing balance');
  const {receipt:buy}=await send(rpc,request.transaction),boughtBalance=await readAsset(rpc,asset,request.transaction.from),afterBuyInput=experiment.nativeInput?null:await readAsset(rpc,returnAsset,request.transaction.from);
  if(boughtBalance===null)throw Error('Missing balance');
  const acquired=BigInt(boughtBalance)-BigInt(baseBalance);
  if(acquired<=0n)return [evidence('round_trip','risk','Buy did not increase the output token balance','Fork execution succeeded, but the same-account recipient did not gain the expected output token.','isolated-fork',scope)];
  let observedInputDebit=baseInput!==null&&afterBuyInput!==null?BigInt(baseInput)-BigInt(afterBuyInput):null;
  if(experiment.variant!=='v2'&&(observedInputDebit===null||observedInputDebit<=0n))throw Error('V3 input debit unavailable');
  const fees=Object.fromEntries((['gasPrice','maxFeePerGas','maxPriorityFeePerGas'] as const).filter(key=>request.transaction[key]!==undefined).map(key=>[key,request.transaction[key]]));
  const derived={from:request.transaction.from,...fees};
  const approve=encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[request.transaction.to as `0x${string}`,acquired]});
  await send(rpc,{...derived,to:experiment.output,data:approve});
  const beforeReturn=experiment.nativeInput?String(BigInt(await rpc('eth_getBalance',[request.transaction.from,'latest']))):await readAsset(rpc,returnAsset,request.transaction.from);
  let sellData:`0x${string}`;
  if(experiment.variant!=='v2'){
   sellData=reverseSwapCalldata(experiment,acquired,request.transaction.from as `0x${string}`);
  }else{
   const reverseAbi=parseAbi(['function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)','function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)']);
   sellData=encodeFunctionData({abi:reverseAbi,functionName:experiment.nativeInput?'swapExactTokensForETHSupportingFeeOnTransferTokens':'swapExactTokensForTokensSupportingFeeOnTransferTokens',args:[acquired,0n,[...experiment.tokens].reverse(),request.transaction.from as `0x${string}`,experiment.deadline!]});
  }
  let sold;
  try{sold=await send(rpc,{...derived,to:request.transaction.to,data:sellData});}
  catch{return [evidence('round_trip','warning','Sell after buy failed','Token restrictions, routing, pool/fee support, liquidity, approval behavior or gas may explain failure. This single experiment does not prove a honeypot.','isolated-fork',{...scope,bought:String(acquired),buyGas:String(buy.gasUsed)})];}
  const gas=observedGasCost(sold.receipt);
  const afterReturn=experiment.nativeInput?String(BigInt(await rpc('eth_getBalance',[request.transaction.from,'latest']))):await readAsset(rpc,returnAsset,request.transaction.from);
  const returned=beforeReturn!==null&&afterReturn!==null&&(!experiment.nativeInput||gas!==null)?BigInt(afterReturn)-BigInt(beforeReturn)+(experiment.nativeInput?gas!:0n):null;
  const spent=experiment.variant!=='v2'?observedInputDebit!:experiment.declaredInput,ratio=returned!==null&&spent>0n?Number(returned*10000n/spent)/100:null;
  return [evidence('round_trip',returned===null?'unknown':returned<=0n||ratio!==null&&ratio<50?'risk':'warning','Buy/sell simulation from a fixed base block','The temporary fork replays the original buy, approves only newly acquired output tokens, then derives a reverse sell with zero minimum output and no price limit. Derived transactions reuse supplied fee fields but use new local nonces/default gas. V3 compares the observed input debit, which can differ from the input cap. Supported V2 native routes measure gas-adjusted native receipts; V3 native funding is not tested. Loss includes taxes, fees and price impact; it is not a tax rate or future-sellability guarantee.','isolated-fork',{...scope,bought:String(acquired),returned:returned===null?null:String(returned),declaredInputRaw:String(experiment.declaredInput),declaredInputKind:experiment.exactOutput?'maximum_input_cap':'exact_input',...(experiment.requestedOutput!==undefined?{requestedOutputRaw:String(experiment.requestedOutput)}:{}),observedInputDebitRaw:observedInputDebit===null?null:String(observedInputDebit),ratioInputRaw:String(spent),roundTripReturnPercent:ratio,...(experiment.variant!=='v2'?{...(experiment.fees.length===1?{feeTier:String(experiment.fees[0])}:{}),...(experiment.originalPriceLimit!==undefined?{originalPriceLimit:String(experiment.originalPriceLimit)}:{}),deadlinePresent:experiment.deadlinePresent}:{}),...(experiment.nativeInput?{sellGasCostWei:gas===null?null:String(gas),returnAmountUnavailableReason:gas===null?'missing_receipt_fee':null}:{})})];
 }catch{return [evidence('round_trip','unknown','Dependent buy/sell simulation incomplete','Balances and token storage were not modified to manufacture success. Failed buy, approval, input-debit, read, or execution steps remain unknown.','isolated-fork',scope)];}
}
