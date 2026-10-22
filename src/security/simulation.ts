import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { encodeFunctionData, decodeFunctionResult, erc20Abi, parseAbi, decodeEventLog, keccak256, toHex } from 'viem';
import type { SecurityConfig } from './config.js';
import type { Evidence, Operation, SecurityRequest } from './types.js';
import { evidence } from './evidence.js';
type Rpc=(method:string,params?:unknown[])=>Promise<any>;
export type ForkSession={rpc:Rpc;chainId:number;blockNumber:string;blockHash:string;close:()=>Promise<void>};
export type ForkFactory=(config:SecurityConfig,chainId:number)=>Promise<ForkSession>;
const nftAbi=parseAbi(['function ownerOf(uint256) view returns (address)','function balanceOf(address,uint256) view returns(uint256)','function getApproved(uint256) view returns(address)','function isApprovedForAll(address,address) view returns(bool)','event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)','event TransferBatch(address indexed operator,address indexed from,address indexed to,uint256[] ids,uint256[] values)']);
const eq=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
const isAddress=(s:unknown):s is `0x${string}`=>typeof s==='string'&&/^0x[\da-f]{40}$/i.test(s);
const rawRpc=(url:string,signal:AbortSignal):Rpc=>async(method,params=[])=>{
  const r=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  if(!r.ok)throw Error('RPC unavailable');
  const reader=r.body?.getReader();if(!reader)throw Error('RPC response unavailable');const parts:Uint8Array[]=[];let size=0;
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>8000000){await reader.cancel();throw Error('RPC response too large');}parts.push(part.value);}
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
      try {if(Number(BigInt(await rpc('eth_chainId')))!==chainId)throw Error('Wrong child');const block=await rpc('eth_getBlockByNumber',[base.number,false]);if(block?.hash!==base.hash)throw Error('Fork mismatch');ready=true;break;}catch{await new Promise(ok=>setTimeout(ok,60));}
    }
    if(!ready)throw Error('Fork unavailable');
    return {rpc,chainId,blockNumber:String(BigInt(base.number)),blockHash:base.hash,close};
  }catch{await close();throw Error('Isolated fork unavailable');}
};
type Asset={kind:'erc20'|'erc721'|'erc1155';contract:`0x${string}`;tokenId?:string};
const transferTopic=keccak256(toHex('Transfer(address,address,uint256)'));
export function assetsFromLogs(logs:any[]):Asset[]{
  const assets:Asset[]=[];
  for(const log of logs.slice(0,256)){
    if(!isAddress(log.address)||!Array.isArray(log.topics))continue;
    // Event names and topic counts alone do not make malformed log bytes an
    // asset observation. A bad event must not discard other execution facts.
    if(log.topics[0]===transferTopic&&log.topics.every((topic:unknown)=>typeof topic==='string'&&/^0x[\da-f]{64}$/i.test(topic))){if(log.topics.length===3&&typeof log.data==='string'&&/^0x[\da-f]{64}$/i.test(log.data))assets.push({kind:'erc20',contract:log.address});else if(log.topics.length===4&&log.data==='0x')assets.push({kind:'erc721',contract:log.address,tokenId:String(BigInt(log.topics[3]))});}
    try {const parsed=decodeEventLog({abi:nftAbi,data:log.data,topics:log.topics});if(parsed.eventName==='TransferSingle')assets.push({kind:'erc1155',contract:log.address,tokenId:String(parsed.args.id)});if(parsed.eventName==='TransferBatch')for(const id of parsed.args.ids.slice(0,64))assets.push({kind:'erc1155',contract:log.address,tokenId:String(id)});}catch{/* Other events are not assets. */}
  }
  return [...new Map(assets.map(a=>[JSON.stringify(a),a])).values()].slice(0,32);
}
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
async function send(rpc:Rpc,tx:{from:string;to?:string|null;data:string;value?:string;gas?:string;gasPrice?:string;maxFeePerGas?:string;maxPriorityFeePerGas?:string;nonce?:string}){
  await rpc('anvil_impersonateAccount',[tx.from]);
  const executionFields=Object.fromEntries((['gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce'] as const).filter(key=>tx[key]!==undefined).map(key=>[key,tx[key]]));
  const hash=await rpc('eth_sendTransaction',[{from:tx.from,...(tx.to?{to:tx.to}:{}),data:tx.data,value:tx.value??'0x0',gas:tx.gas??'0xb71b00',...executionFields}]);
  let receipt;
  for(let i=0;i<30;i++){receipt=await rpc('eth_getTransactionReceipt',[hash]);if(receipt)break;await new Promise(ok=>setTimeout(ok,50));}
  if(!receipt||receipt.status!=='0x1')throw Error('Simulated execution reverted');return {hash,receipt};
}
function traceSummary(root:any){
  const calls:{type:string;from?:string;to?:string;value?:string;selector?:string;error?:string}[]=[];
  const walk=(node:any,depth:number)=>{if(!node||depth>20||calls.length>=128)return;calls.push({type:String(node.type??'CALL'),...(isAddress(node.from)?{from:node.from}:{}),...(isAddress(node.to)?{to:node.to}:{}),...(typeof node.value==='string'?{value:node.value}:{}),...(typeof node.input==='string'?{selector:node.input.slice(0,10)}:{}),...(node.error?{error:String(node.error).slice(0,120)}:{})});for(const call of (node.calls??[]).slice(0,128))walk(call,depth+1);};walk(root,0);return calls;
}
export async function simulateRequest(request:SecurityRequest,op:Operation,config:SecurityConfig,factory:ForkFactory=openFork):Promise<Evidence[]>{
  if(request.kind!=='transaction')return [];
  if(request.transaction.unsupportedFields?.length)return [evidence('asset_simulation','unknown','Special transaction envelope cannot be simulated completely','Delegation, blob, or other unsupported execution fields are not silently removed to execute a substitute transaction.','coverage')];
  if(!config.forkEnabled)return [evidence('asset_simulation','unknown','Isolated fork simulation is disabled','This request has not been executed on an isolated chain fork.','configuration')];
  let fork:ForkSession|undefined;
  try {
    fork=await factory(config,request.chainId);const rpc=fork.rpc;
    const snapshot=await rpc('evm_snapshot');const beforeNative=BigInt(await rpc('eth_getBalance',[request.transaction.from,'latest']));
    let executed;
    try{executed=await send(rpc,request.transaction);}catch{return [evidence('simulation_execution','unknown','Fork execution incomplete','The request reverted, had insufficient gas, or the fork was unavailable. This alone does not establish a honeypot.','isolated-fork',{chainId:fork.chainId,blockNumber:fork.blockNumber})];}
    const {hash,receipt}=executed;const afterNative=BigInt(await rpc('eth_getBalance',[request.transaction.from,'latest']));
    const assets=assetsFromLogs(receipt.logs??[]);
    if(op.token&&isAddress(op.token)&&['erc20','erc721','erc1155'].includes(op.tokenStandard??'')&&!assets.some(a=>eq(a.contract,op.token!))) {
      if(op.tokenStandard==='erc20')assets.push({kind:'erc20',contract:op.token});
      else if(op.fields.tokenId)assets.push({kind:op.tokenStandard as 'erc721'|'erc1155',contract:op.token,tokenId:String(op.fields.tokenId)});
    }
    const after=await Promise.all(assets.map(a=>readAsset(rpc,a,request.transaction.from)));
    let calls:ReturnType<typeof traceSummary>=[];let traceAvailable=false;
    try{const trace=await rpc('debug_traceTransaction',[hash,{tracer:'callTracer'}]);if(trace?.type){calls=traceSummary(trace);traceAvailable=true;}}catch{/* Partial trace must remain explicit. */}
    if(await rpc('evm_revert',[snapshot])!==true)throw Error('Could not restore isolated snapshot');
    const before=await Promise.all(assets.map(a=>readAsset(rpc,a,request.transaction.from)));
    const deltas=assets.map((asset,i)=>({...asset,owner:request.transaction.from,before:before[i],after:after[i],delta:asset.kind!=='erc721'&&before[i]!==null&&after[i]!==null?String(BigInt(after[i]!)-BigInt(before[i]!)):null}));
    const gas=observedGasCost(receipt);
    const facts=[evidence('simulation_execution','pass','Isolated fork execution completed','Execution occurred only on a temporary local fork; no transaction was sent upstream. Supplied gas, fees, and nonce were preserved; a fork cap was used if gas was absent. The fork mines from the stated base block, so this is not a guarantee of future execution.','isolated-fork',{chainId:fork.chainId,blockNumber:fork.blockNumber,blockHash:fork.blockHash,executionBlockNumber:receipt.blockNumber?String(BigInt(receipt.blockNumber)):null,gasLimit:request.transaction.gas??'0xb71b00',gasLimitSource:request.transaction.gas?'request':'simulation_default',status:'success',native:{before:String(beforeNative),after:String(afterNative),deltaIncludingGas:String(afterNative-beforeNative),gasWei:gas===null?null:String(gas),deltaExcludingGas:gas===null?null:String(afterNative-beforeNative+gas)},assets:deltas,calls,traceAvailable}),evidence('asset_simulation','unknown','Asset discovery has coverage limits','Before/after state was read for identified assets and assets found in Transfer events. Assets without events, nonstandard storage, future proxy changes, and cross-chain results may be missed.','isolated-fork')];
    if(gas===null)facts.push(evidence('simulation_fee','unknown','Execution fee could not be measured','The receipt lacks a usable gas-used or effective-gas-price value. Raw native balance changes are retained; gas-adjusted native changes are not guessed using a zero fee.','isolated-fork',{chainId:fork.chainId,blockNumber:fork.blockNumber}));
    if(op.addsPermission&&deltas.some(d=>d.delta!==null&&BigInt(d.delta)<0n||d.kind==='erc721'&&d.before!==null&&d.after!==null&&eq(d.before,request.transaction.from)&&!eq(d.after,request.transaction.from)))facts.push(evidence('unexpected_asset_loss','risk','Permission operation also reduced assets','The fork observed an asset decrease. The permission operation may have additional unexpected behavior.','isolated-fork',{assets:deltas}));
    if(op.category==='token_transfer'&&deltas.some(d=>d.delta!==null&&eq(d.contract,op.token??'')&&-BigInt(d.delta)>BigInt(String(op.fields.amount))))facts.push(evidence('excess_token_spend','risk','Observed token decrease exceeds the declared amount','The fork balance decrease exceeds the transfer parameter. Review extra debits or nonstandard token behavior.','isolated-fork',{assets:deltas}));
    if(op.category==='native_transfer'&&gas!==null&&afterNative-beforeNative+gas < -BigInt(request.transaction.value??'0x0'))facts.push(evidence('excess_native_spend','risk','Native-asset decrease exceeds the declared value','After accounting for observed gas, the account still decreased by more than the declared value.','isolated-fork'));
    if(op.category==='swap')facts.push(...await roundTrip(request,op,fork));
    return facts;
  }catch{return [evidence('asset_simulation','unknown','Isolated fork simulation failed','The node, historical state, or executor was unavailable. Asset simulation was not completed.','isolated-fork')];}
  finally{if(fork)await fork.close();}
}
async function roundTrip(request:Extract<SecurityRequest,{kind:'transaction'}>,op:Operation,fork:ForkSession):Promise<Evidence[]>{
  const method=op.fields.method;const path=op.fields.path;
  if(!Array.isArray(path)||path.length<2||path.length>12||!path.every(isAddress)||!request.transaction.to||!['swapExactTokensForTokens','swapExactETHForTokens'].includes(String(method))||!eq(String(op.fields.recipient),request.transaction.from))return [evidence('round_trip','unknown','Dependent buy/sell simulation unsupported for this request','Only common V2 token-input or ETH-input buys received by the same account and sold along the reverse path are covered.','isolated-fork')];
  const rpc=fork.rpc;const output=path.at(-1)!;const asset:Asset={kind:'erc20',contract:output};
  try {
    // Main simulation already reverted to the base snapshot. Every dependent
    // step below executes against this same child, never the upstream RPC.
    const baseBalance=await readAsset(rpc,asset,request.transaction.from);if(baseBalance===null)throw Error('Missing balance');
    const {receipt:buy}=await send(rpc,request.transaction);const boughtBalance=await readAsset(rpc,asset,request.transaction.from);if(boughtBalance===null)throw Error('Missing balance');
    const acquired=BigInt(boughtBalance)-BigInt(baseBalance);if(acquired<=0n)return [evidence('round_trip','risk','Buy did not increase the output token balance','Fork execution succeeded, but the recipient did not gain the expected output token.','isolated-fork')];
    const approve=encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[request.transaction.to as `0x${string}`,acquired]});
    await send(rpc,{from:request.transaction.from,to:output,data:approve});
    const reverseAbi=parseAbi(['function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)','function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)']);
    const returnAsset:Asset={kind:'erc20',contract:path[0]};
    const beforeReturn=method==='swapExactETHForTokens'?String(BigInt(await rpc('eth_getBalance',[request.transaction.from,'latest']))):await readAsset(rpc,returnAsset,request.transaction.from);
    const sellData=encodeFunctionData({abi:reverseAbi,functionName:method==='swapExactETHForTokens'?'swapExactTokensForETHSupportingFeeOnTransferTokens':'swapExactTokensForTokensSupportingFeeOnTransferTokens',args:[acquired,0n,[...path].reverse(),request.transaction.from as `0x${string}`,BigInt(op.fields.deadline as string)]});
    let sold;try{sold=await send(rpc,{from:request.transaction.from,to:request.transaction.to,data:sellData});}catch{return [evidence('round_trip','warning','Sell after buy failed','Token restrictions, routing, liquidity, or gas may explain the failure. Combine it with contract and intelligence evidence; this alone does not prove a honeypot.','isolated-fork',{bought:String(acquired),buyGas:String(buy.gasUsed),blockNumber:fork.blockNumber})];}
    const afterReturn=method==='swapExactETHForTokens'?String(BigInt(await rpc('eth_getBalance',[request.transaction.from,'latest']))):await readAsset(rpc,returnAsset,request.transaction.from);
    const gas=observedGasCost(sold.receipt);
    const returned=beforeReturn!==null&&afterReturn!==null&&(method!=='swapExactETHForTokens'||gas!==null)?BigInt(afterReturn)-BigInt(beforeReturn)+(method==='swapExactETHForTokens'?gas!:0n):null;
    const spent=BigInt(String(op.fields.amountIn));const ratio=returned!==null&&spent>0n?Number(returned*10000n/spent)/100:null;
    return [evidence('round_trip',returned===null?'unknown':returned<=0n||ratio!==null&&ratio<50?'risk':'warning','Buy/sell simulation from a fixed base block','The fork mines sequential buy, approval, and sell steps from a base block. Minimum sell output is zero for observation. Loss includes taxes, fees, and price impact; it is not a tax rate. One successful sell does not guarantee future safety.','isolated-fork',{chainId:fork.chainId,blockNumber:fork.blockNumber,blockHash:fork.blockHash,bought:String(acquired),returned:returned===null?null:String(returned),roundTripReturnPercent:ratio,...(method==='swapExactETHForTokens'?{sellGasCostWei:gas===null?null:String(gas),returnAmountUnavailableReason:gas===null?'missing_receipt_fee':null}:{})})];
  }catch{return [evidence('round_trip','unknown','Dependent buy/sell simulation incomplete','Balances and token storage were not modified to manufacture success. Failed buy, approval, read, or execution steps remain unknown.','isolated-fork')];}
}
