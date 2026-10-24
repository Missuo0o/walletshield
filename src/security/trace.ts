import type {SecurityConfig} from './config.js';
import type {Evidence,SecurityRequest} from './types.js';
import {evidence,readBoundedText,snapshotMetadata} from './evidence.js';
import {executionLimitations} from './transaction-fields.js';

const address=(value:unknown):value is string=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value);
const quantity=(value:unknown):value is string=>typeof value==='string'&&/^0x[\da-f]{1,64}$/i.test(value);
const bytes=(value:unknown):value is string=>typeof value==='string'&&/^0x(?:[\da-f]{2})*$/i.test(value);
const eq=(a:unknown,b:unknown)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const callTypes=new Set(['CALL','STATICCALL','DELEGATECALL','CALLCODE','CREATE','CREATE2','SELFDESTRUCT','SUICIDE']);
export const TRACE_LIMITS={frames:128,depth:20,responseBytes:750000,totalMs:14000,requestMs:1800} as const;
export type TraceFrame={type:string;depth:number;from?:string;to?:string;value?:string;selector?:string;reverted:boolean};
export type TraceSummary={calls:TraceFrame[];gaps:string[];rootReverted:boolean};
/** The bounded read-only transport is supplied by the already-opened private
 * fork. It never exposes an RPC URL or permits an upstream write. */
export type ForkTraceContext={chainId:number;blockNumber:string;blockHash:string;blockTimestampSeconds?:string;traceRpc?:(method:string,params:unknown[],signal:AbortSignal)=>Promise<any>;verifyTraceSource?:(signal:AbortSignal)=>Promise<boolean>};
export const FORK_TRACE_LIMITS={...TRACE_LIMITS,totalMs:6000} as const;
type TraceTransaction={from:string;to?:string|null;data:string;value?:string};
function rootMatches(frame:any,tx:TraceTransaction){return eq(frame.from,tx.from)&&(tx.to?String(frame.type).toUpperCase()==='CALL'&&eq(frame.to,tx.to):['CREATE','CREATE2'].includes(String(frame.type).toUpperCase()))&&bytes(frame.input)&&eq(frame.input,tx.data)&&quantity(frame.value)&&BigInt(frame.value)===BigInt(tx.value??'0x0');}
function retainedFrame(frame:any,depth:number):TraceFrame{return {type:String(frame.type).toUpperCase(),depth,...(address(frame.from)?{from:frame.from}:{}),...(address(frame.to)?{to:frame.to}:{}),...(quantity(frame.value)?{value:frame.value}:{}),...(bytes(frame.input)?{selector:frame.input.slice(0,10)}:{}),reverted:!!frame.error};}
function validFrameFields(frame:any){const type=String(frame.type).toUpperCase();return address(frame.from)&&(['CREATE','CREATE2'].includes(type)||address(frame.to))&&(['SELFDESTRUCT','SUICIDE'].includes(type)||bytes(frame.input))&&(frame.value===undefined||quantity(frame.value));}

/** Normalize only two known trace dialects. Provider text, complete calldata and
 * arbitrary fields never enter the retained evidence. Empty/malformed results
 * are unavailable, not an empty exhaustive call inventory. */
export function normalizeTrace(value:unknown,method:'debug_traceCall'|'trace_call',tx:TraceTransaction):TraceSummary|null{
 const calls:TraceFrame[]=[],gaps=new Set<string>();let rootReverted=false;
 if(method==='debug_traceCall'){
  const root=value as any;if(!root||typeof root!=='object'||!rootMatches(root,tx)||!callTypes.has(String(root.type).toUpperCase()))return null;
  rootReverted=!!root.error;
  const walk=(node:any,depth:number)=>{
   if(depth>TRACE_LIMITS.depth){gaps.add('trace_depth_limit');return;}
   if(calls.length>=TRACE_LIMITS.frames){gaps.add('trace_frame_limit');return;}
   if(!node||typeof node!=='object'||!callTypes.has(String(node.type).toUpperCase())){gaps.add('malformed_trace_frame');return;}
   if(!validFrameFields(node))gaps.add('malformed_trace_fields');
   calls.push(retainedFrame(node,depth));
   if(node.calls!==undefined&&!Array.isArray(node.calls)){gaps.add('malformed_trace_children');return;}
   if(node.calls?.length>TRACE_LIMITS.frames)gaps.add('trace_frame_limit');
   for(const child of (node.calls??[]).slice(0,TRACE_LIMITS.frames))walk(child,depth+1);
  };walk(root,0);
 }else{
  const body=value as any;if(!body||!Array.isArray(body.trace)||!body.trace.length||!bytes(body.output))return null;
  const roots=body.trace.filter((entry:any)=>Array.isArray(entry?.traceAddress)&&entry.traceAddress.length===0);if(roots.length!==1)return null;
  const convert=(entry:any)=>({type:entry.type==='call'?entry.action?.callType:entry.type,from:entry.action?.from??entry.action?.address,to:entry.action?.to??entry.result?.address??entry.action?.refundAddress,input:entry.action?.input??entry.action?.init,value:entry.action?.value??entry.action?.balance,error:entry.error});
  const root=convert(roots[0]);if(!rootMatches(root,tx)||!callTypes.has(String(root.type).toUpperCase()))return null;rootReverted=!!root.error;
  if(body.trace.length>TRACE_LIMITS.frames)gaps.add('trace_frame_limit');
  const paths=new Set<string>();
  for(const entry of body.trace.slice(0,TRACE_LIMITS.frames)){
   const path=entry?.traceAddress;if(!Array.isArray(path)||path.some((n:unknown)=>!Number.isSafeInteger(n)||Number(n)<0)){gaps.add('malformed_trace_path');continue;}
   if(path.length>TRACE_LIMITS.depth){gaps.add('trace_depth_limit');continue;}
   const key=JSON.stringify(path);if(paths.has(key)){gaps.add('duplicate_trace_path');continue;}paths.add(key);
   const frame=convert(entry);if(!callTypes.has(String(frame.type).toUpperCase())){gaps.add('malformed_trace_frame');continue;}
   if(!validFrameFields(frame))gaps.add('malformed_trace_fields');
   calls.push(retainedFrame(frame,path.length));
  }
  for(const entry of body.trace.slice(0,TRACE_LIMITS.frames)){
   const path=entry?.traceAddress;if(!Array.isArray(path))continue;
   if(path.length&&!paths.has(JSON.stringify(path.slice(0,-1))))gaps.add('missing_trace_parent');
   const childCount=body.trace.slice(0,TRACE_LIMITS.frames).filter((child:any)=>Array.isArray(child?.traceAddress)&&child.traceAddress.length===path.length+1&&JSON.stringify(child.traceAddress.slice(0,-1))===JSON.stringify(path)).length;
   if(!Number.isSafeInteger(entry.subtraces)||entry.subtraces<0||entry.subtraces!==childCount)gaps.add('trace_subtree_incomplete');
  }
  if(!paths.has('[]'))return null;
 }
 return calls.length?{calls,gaps:[...gaps],rootReverted}:null;
}

type Rpc=(method:string,params?:unknown[])=>Promise<any>;
class TraceRpcError extends Error{constructor(readonly reason:'method_unsupported'|'parameters_unsupported'|'provider_access_denied'|'rate_limited'|'unavailable'|'invalid_response'){super(reason);}}
const failureReason=(error:unknown,signal:AbortSignal)=>signal.aborted?'budget_exhausted':error instanceof TraceRpcError?error.reason:error instanceof Error&&['AbortError','TimeoutError'].includes(error.name)?'timed_out':'unavailable';
function transport(url:string,signal:AbortSignal,fetcher:typeof fetch):Rpc{
 let id=0;const methods=new Set(['eth_chainId','eth_getBlockByNumber','debug_traceCall','trace_call']);
 return async(method,params=[])=>{
  if(!methods.has(method))throw Error('Read-only trace method required');
  const requestId=++id,response=await fetcher(url,{method:'POST',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(TRACE_LIMITS.requestMs)]),headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})});
  if(!response.ok)throw new TraceRpcError(response.status===429?'rate_limited':[401,403].includes(response.status)?'provider_access_denied':'unavailable');const body=JSON.parse(await readBoundedText(response,TRACE_LIMITS.responseBytes));
  if(body.jsonrpc!=='2.0'||body.id!==requestId)throw new TraceRpcError('invalid_response');
  if(body.error)throw new TraceRpcError(body.error.code===-32601?'method_unsupported':body.error.code===-32602?'parameters_unsupported':'unavailable');
  if(body.result===undefined)throw new TraceRpcError('invalid_response');return body.result;
 };
}
const usableHeader=(header:any)=>!!header&&quantity(header.number)&&quantity(header.timestamp)&&typeof header.hash==='string'&&/^0x[\da-f]{64}$/i.test(header.hash);

/** Trace at the existing fork's base block before any simulation transaction.
 * The source and local headers must still match that base before and after the
 * read. This fallback needs ordinary historical RPC reads, not provider tracing.
 * It is not a replay of the later mined simulation block or an asset inventory. */
export async function isolatedForkTraceEvidence(request:SecurityRequest,fork:ForkTraceContext):Promise<Evidence[]>{
 if(request.kind!=='transaction')return [];
 const snapshot={chainId:fork.chainId,blockNumber:fork.blockNumber,blockHash:fork.blockHash,...(fork.blockTimestampSeconds!==undefined?{blockTimestampSeconds:fork.blockTimestampSeconds}:{})};
 const unavailable=(reason:string)=>[evidence('call_trace_fork','unknown','Isolated fork call trace unavailable','No usable request-bound base-block call trace was obtained. Other available observations are retained; missing trace frames are not evidence that internal calls do not exist.','isolated-fork',{...snapshot,traceAvailable:false,reason,completeAssetCoverage:false,limits:FORK_TRACE_LIMITS})];
 if(executionLimitations(request.transaction).length)return unavailable('unsupported_execution_envelope');
 if(!fork.traceRpc||!fork.verifyTraceSource)return unavailable('bounded_trace_transport_unavailable');
 if(fork.chainId!==request.chainId||!/^\d+$/.test(fork.blockNumber)||!/^0x[\da-f]{64}$/i.test(fork.blockHash)||!fork.blockTimestampSeconds||!/^\d+$/.test(fork.blockTimestampSeconds))return unavailable('invalid_fork_snapshot');
 const signal=AbortSignal.timeout(FORK_TRACE_LIMITS.totalMs),tag=`0x${BigInt(fork.blockNumber).toString(16)}`;
 const rpc=(method:string,params:unknown[]=[])=>fork.traceRpc!(method,params,AbortSignal.any([signal,AbortSignal.timeout(FORK_TRACE_LIMITS.requestMs)]));
 const sameHeader=(value:any)=>usableHeader(value)&&BigInt(value.number)===BigInt(fork.blockNumber)&&eq(value.hash,fork.blockHash)&&BigInt(value.timestamp)===BigInt(fork.blockTimestampSeconds!);
 try{
  if(!await fork.verifyTraceSource(signal))return unavailable('source_snapshot_mismatch');
  const chain=await rpc('eth_chainId');if(!quantity(chain)||BigInt(chain)!==BigInt(request.chainId))return unavailable('fork_chain_mismatch');
  if(!sameHeader(await rpc('eth_getBlockByNumber',[tag,false])))return unavailable('fork_snapshot_mismatch');
  const tx=request.transaction,fields=Object.fromEntries((['gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce','type'] as const).filter(key=>tx[key]!==undefined).map(key=>[key,tx[key]]));
  const call={from:tx.from,...(tx.to?{to:tx.to}:{}),data:tx.data,value:tx.value??'0x0',...fields};
  const raw=await rpc('debug_traceCall',[call,tag,{tracer:'callTracer',timeout:'1s',reexec:0}]),trace=normalizeTrace(raw,'debug_traceCall',tx);
  if(!trace)return unavailable('unusable_response');
  if(!sameHeader(await rpc('eth_getBlockByNumber',[tag,false]))||!await fork.verifyTraceSource(signal))return unavailable('snapshot_changed');
  return [evidence('call_trace_fork',trace.rootReverted?'warning':trace.gaps.length?'unknown':'pass','Bounded call trace observed on the isolated fork','The original call was traced read-only at the temporary fork base block before local execution. Source and child chain/header bindings were checked before and after. No upstream transaction was sent. Retained frames are not complete asset deltas, verified contract identity, transaction inclusion, or a future execution guarantee.','isolated-fork',{...snapshot,method:'debug_traceCall',endpoint:'isolated-fork',calls:trace.calls,retainedTraceCalls:trace.calls.length,traceAvailable:true,traceTruncated:trace.gaps.length>0,traceGaps:trace.gaps,rootReverted:trace.rootReverted,limits:FORK_TRACE_LIMITS,completeAssetCoverage:false})];
 }catch(error){return unavailable(signal.aborted?'budget_exhausted':error instanceof Error&&['AbortError','TimeoutError'].includes(error.name)?'timed_out':'unavailable');}
}

/** At most two trusted endpoints and two dialects, all at the primary's exact
 * height/hash. This is a trace of the supplied call, not a submitted transaction
 * or a complete asset-state simulation. No endpoint is accepted from a client. */
export async function transactionTraceEvidence(request:SecurityRequest,config:SecurityConfig,fetcher:typeof fetch=fetch):Promise<Evidence[]>{
 if(request.kind!=='transaction')return [];
 const primary=config.rpc[request.chainId];if(!primary)return [];
 const unsupported=executionLimitations(request.transaction);
 if(unsupported.length)return [evidence('call_trace','unknown','Call trace cannot preserve this execution envelope','Unsupported execution fields were not removed to trace a substitute transaction.','coverage',{unsupportedFields:unsupported})];
 const signal=AbortSignal.timeout(TRACE_LIMITS.totalMs),rpc=transport(primary,signal,fetcher),attempts:{endpoint:'primary'|'dedicated';method?:string;result:string}[]=[];
 let snapshot:Record<string,unknown>={chainId:request.chainId};
 try{
  const chain=await rpc('eth_chainId');if(!quantity(chain)||BigInt(chain)!==BigInt(request.chainId))throw Error('Network mismatch');
  const header=await rpc('eth_getBlockByNumber',['latest',false]);if(!usableHeader(header))throw Error('Header unavailable');
  snapshot=snapshotMetadata(request.chainId,BigInt(header.number),{number:BigInt(header.number),hash:header.hash,timestamp:BigInt(header.timestamp)});
  const tx=request.transaction,fields=Object.fromEntries((['gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce','type'] as const).filter(key=>tx[key]!==undefined).map(key=>[key,tx[key]]));
  const call={from:tx.from,...(tx.to?{to:tx.to}:{}),data:tx.data,value:tx.value??'0x0',...fields};
  const urls=[{url:primary,endpoint:'primary' as const},...(config.traceRpc?.[request.chainId]&&config.traceRpc[request.chainId]!==primary?[{url:config.traceRpc[request.chainId],endpoint:'dedicated' as const}]:[])];
  for(const candidate of urls){
   const node=candidate.endpoint==='primary'?rpc:transport(candidate.url,signal,fetcher);
   try{
    if(candidate.endpoint==='dedicated'){
     const observed=await node('eth_chainId');if(!quantity(observed)||BigInt(observed)!==BigInt(request.chainId)){attempts.push({endpoint:candidate.endpoint,result:'chain_mismatch'});continue;}
    }
    const pinned=await node('eth_getBlockByNumber',[header.number,false]);
    if(!usableHeader(pinned)||BigInt(pinned.number)!==BigInt(header.number)||!eq(pinned.hash,header.hash)||BigInt(pinned.timestamp)!==BigInt(header.timestamp)){attempts.push({endpoint:candidate.endpoint,result:'snapshot_mismatch'});continue;}
   }catch{attempts.push({endpoint:candidate.endpoint,result:'snapshot_unavailable'});continue;}
   for(const method of ['debug_traceCall','trace_call'] as const){
    try{
     const raw=await node(method,method==='debug_traceCall'?[call,header.number,{tracer:'callTracer',timeout:'1s',reexec:0}]:[call,['trace'],header.number]);
     const trace=normalizeTrace(raw,method,tx);if(!trace){attempts.push({endpoint:candidate.endpoint,method,result:'unusable_response'});continue;}
     const after=await node('eth_getBlockByNumber',[header.number,false]);
     const primaryAfter=candidate.endpoint==='primary'?after:await rpc('eth_getBlockByNumber',[header.number,false]);
     if([after,primaryAfter].some(value=>!usableHeader(value)||BigInt(value.number)!==BigInt(header.number)||!eq(value.hash,header.hash)||BigInt(value.timestamp)!==BigInt(header.timestamp))){attempts.push({endpoint:candidate.endpoint,method,result:'snapshot_changed'});break;}
     attempts.push({endpoint:candidate.endpoint,method,result:'observed'});
     return [evidence('call_trace',trace.rootReverted?'warning':trace.gaps.length?'unknown':'pass','Bounded call trace observed','The supplied call was traced at the primary RPC snapshot. Endpoint chain and block hash were checked before tracing and the height/hash were checked again afterwards. Retained call frames are not complete asset deltas, proof of contract identity, transaction inclusion, or future execution.','rpc',{...snapshot,method,endpoint:candidate.endpoint,attempts,calls:trace.calls,retainedTraceCalls:trace.calls.length,traceAvailable:true,traceTruncated:trace.gaps.length>0,traceGaps:trace.gaps,rootReverted:trace.rootReverted,limits:TRACE_LIMITS,completeAssetCoverage:false})];
    }catch(error){attempts.push({endpoint:candidate.endpoint,method,result:failureReason(error,signal)});}
    if(signal.aborted)break;
   }
   if(signal.aborted)break;
  }
 }catch{attempts.push({endpoint:'primary',result:'network_or_snapshot_unavailable'});}
 return [evidence('call_trace','unknown','Provider call trace unavailable','No usable request-bound trace was obtained from the bounded provider attempts. Unsupported, disabled, rate-limited, inconsistent and timed-out provider tracing remain unknown. A separately retained isolated-fork call trace can still supply execution evidence when enabled and available.','rpc',{...snapshot,attempts,traceAvailable:false,completeAssetCoverage:false,limits:TRACE_LIMITS})];
}
