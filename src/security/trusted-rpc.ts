import {decodeFunctionResult,encodeFunctionData,type Abi} from 'viem';
import type {SecurityConfig} from './config.js';
import type {Evidence} from './types.js';
import {evidence,readBoundedText,snapshotMetadata} from './evidence.js';
const quantity=(v:unknown):v is `0x${string}`=>typeof v==='string'&&/^0x[\da-f]{1,64}$/i.test(v);
const hash=(v:unknown):v is `0x${string}`=>typeof v==='string'&&/^0x[\da-f]{64}$/i.test(v);
type Header={number?:unknown;hash?:unknown;timestamp?:unknown};
const integer=(value:unknown):bigint|undefined=>typeof value==='bigint'&&value>=0n?value:quantity(value)?BigInt(value):undefined;
/** A bounded await also covers injected transports that ignore AbortSignal. */
async function bounded<T>(task:Promise<T>,milliseconds=2500):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([task,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Snapshot verification timed out')),milliseconds);})]);}finally{if(timer)clearTimeout(timer);}}
/** Numeric block selectors need a complete header before the first state read
 * and a canonical chain/header recheck after the entire related group. If that
 * recheck fails, previously collected values and state-derived conclusions must
 * not survive under the old hash. This is consistency checking of one trusted
 * node, not proof against a deliberately dishonest RPC provider. */
export function rpcSnapshotGuard(chainId:number,block:bigint,header:Header|undefined,verify:()=>Promise<{chain:unknown;header:Header|undefined}>){
 if(!header||integer(header.number)!==block||!hash(header.hash)||integer(header.timestamp)===undefined)throw Error('Complete snapshot header required');
 const expectedHash=header.hash.toLowerCase(),timestamp=integer(header.timestamp)!;
 const snapshot=snapshotMetadata(chainId,block,{number:block,hash:header.hash,timestamp});let invalid=false;
 async function check():Promise<boolean>{
  if(invalid)return false;
  try{const current=await bounded(Promise.resolve().then(verify)),next=current.header;if((typeof current.chain==='number'&&Number.isSafeInteger(current.chain)?BigInt(current.chain):integer(current.chain))!==BigInt(chainId)||!next||integer(next.number)!==block||!hash(next.hash)||next.hash.toLowerCase()!==expectedHash||integer(next.timestamp)!==timestamp)throw Error('Snapshot changed');return !invalid;}
  catch{invalid=true;return false;}
 }
 async function finish(checks:Evidence[],scope:string):Promise<boolean>{
  const consistent=await check();
  if(consistent){for(const item of checks)if(item.source==='rpc'&&item.data?.blockNumber===String(block)&&item.data?.chainId===chainId)item.data={...item.data,snapshotConsistency:'verified_before_after'};return true;}
  for(let index=0;index<checks.length;index++)if(checks[index].source==='rpc'){
   const item=checks[index];checks[index]=evidence(item.id,'unknown','RPC observation discarded: snapshot not verified','The chain or pinned block header changed, was malformed, timed out, or could not be rechecked. All state values and derived comparisons from this collector group were discarded; request and cryptographic evidence remain separate.','rpc',{chainId,requestedBlockNumber:String(block),snapshotConsistent:false});
  }
  checks.push(evidence(`${scope}_snapshot`,'unknown','RPC snapshot consistency could not be verified','The complete related RPC group was discarded. No balance, code, nonce, permission, execution or economic conclusion is retained from a changing or unverified snapshot.','rpc',{chainId,requestedBlockNumber:String(block),snapshotConsistent:false}));return false;
 }
 return {snapshot,check,finish};
}
const methods=new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getStorageAt','eth_getBalance','eth_getTransactionCount','eth_call']);
const stateMethods=new Set(['eth_getCode','eth_getStorageAt','eth_getBalance','eth_getTransactionCount','eth_call']);
class RpcError extends Error{constructor(readonly code:unknown){super('RPC method failed');}}
/** Server-configured read-only RPC. Hash selectors are preferred. Providers
 * rejecting EIP-1898 with invalid params fall back to a numeric selector under
 * before/after checks. Consumers must finalize the complete evidence group. */
export async function pinnedRpc(config:SecurityConfig,chainId:number,fetcher:typeof fetch=fetch){
 const url=config.rpc[chainId];if(!url)throw Error('RPC not configured');
 const total=AbortSignal.timeout(8500);let id=0;
 async function raw(method:string,params:unknown[]=[]):Promise<any>{
  if(!methods.has(method))throw Error('Read-only method required');
  const requestId=++id;
  return bounded((async()=>{const response=await fetcher(url,{method:'POST',redirect:'error',signal:AbortSignal.any([total,AbortSignal.timeout(2200)]),headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})});
   if(!response.ok)throw Error('RPC unavailable');const body=JSON.parse(await readBoundedText(response,350000));
   if(body.jsonrpc!=='2.0'||body.id!==requestId)throw Error('Invalid RPC response');if(body.error)throw new RpcError(body.error.code);if(body.result===undefined)throw Error('Invalid RPC response');return body.result;})(),2300);
 }
 const chain=await raw('eth_chainId');if(!quantity(chain)||BigInt(chain)!==BigInt(chainId))throw Error('Wrong chain');
 const header=await raw('eth_getBlockByNumber',['latest',false]);
 if(!header||!quantity(header.number)||!quantity(header.timestamp)||!hash(header.hash))throw Error('Pinned block unavailable');
 const tag=header.number as `0x${string}`,block=BigInt(tag),timestamp=BigInt(header.timestamp);
 const guard=rpcSnapshotGuard(chainId,block,header,async()=>{const [chain,header]=await Promise.all([raw('eth_chainId'),raw('eth_getBlockByNumber',[tag,false])]);return {chain,header};});
 const snapshot=guard.snapshot,unsupportedHash=new Set<string>();
 async function call(method:string,params:unknown[]=[]):Promise<any>{
  if(!stateMethods.has(method))return raw(method,params);
  if(params.at(-1)!==tag)throw Error('Read must use the pinned block');
  if(!unsupportedHash.has(method)){
   try{return await raw(method,[...params.slice(0,-1),{blockHash:header.hash,requireCanonical:true}]);}
   catch(error){if(!(error instanceof RpcError)||error.code!==-32602)throw error;unsupportedHash.add(method);}
  }
  if(!await guard.check())throw Error('Snapshot not verified');
  const value=await raw(method,params);
  if(!await guard.check())throw Error('Snapshot changed');return value;
 }
 const read=async(abi:Abi,name:string,args:readonly unknown[],to:string)=>decodeFunctionResult({abi,functionName:name,data:await call('eth_call',[{to,data:encodeFunctionData({abi,functionName:name,args:args as any})},tag]) as `0x${string}`});
 const code=async(address:string)=>{const value=await call('eth_getCode',[address,tag]);if(typeof value!=='string'||!/^0x(?:[\da-f]{2})*$/i.test(value))throw Error('Invalid bytecode');return value as `0x${string}`;};
 return {call,read,code,tag,block,timestamp,snapshot,chainId,finalize:guard.finish};
}
export type PinnedRpc=Awaited<ReturnType<typeof pinnedRpc>>;
