import test from 'node:test';
import assert from 'node:assert/strict';
import {isolatedForkTraceEvidence,type ForkTraceContext,FORK_TRACE_LIMITS} from '../src/security/trace.js';
import {simulateRequest,type ForkFactory} from '../src/security/simulation.js';
import {decodeRequest} from '../src/security/decode.js';
import type {SecurityRequest} from '../src/security/types.js';
const from='0x1111111111111111111111111111111111111111',to='0x2222222222222222222222222222222222222222',third='0x3333333333333333333333333333333333333333',hash=`0x${'ab'.repeat(32)}`;
const request:Extract<SecurityRequest,{kind:'transaction'}>={kind:'transaction',chainId:1,transaction:{from,to,data:'0x12345678',value:'0x5',gas:'0x10000',gasPrice:'0x4',nonce:'0x2',type:'0x0'}};
const header={number:'0x100',hash,timestamp:'0x1234'};
const trace=()=>({type:'CALL',from,to,input:request.transaction.data,value:'0x5',calls:[{type:'DELEGATECALL',from:to,to:third,input:'0xabcdef01',value:'0x0'}]});
function fixture(change?:(method:string,params:unknown[],nth:number)=>unknown){
 const methods:{method:string;params:unknown[]}[]=[];let verified=0;
 const fork:ForkTraceContext={chainId:1,blockNumber:'256',blockHash:hash,blockTimestampSeconds:'4660',verifyTraceSource:async signal=>{assert.equal(signal.aborted,false);verified++;return true;},traceRpc:async(method,params,signal)=>{assert.equal(signal.aborted,false);methods.push({method,params});return change?.(method,params,methods.filter(item=>item.method===method).length)??(method==='eth_chainId'?'0x1':method==='eth_getBlockByNumber'?header:trace());}};
 return {fork,methods,verified:()=>verified};
}
test('isolated trace reuses the existing fork at the exact base and preserves all supported transaction fields',async()=>{
 const f=fixture(),[result]=await isolatedForkTraceEvidence(request,f.fork);
 assert.equal(result.id,'call_trace_fork');assert.equal(result.source,'isolated-fork');assert.equal(result.status,'pass');assert.equal(result.data?.traceAvailable,true);assert.equal(result.data?.completeAssetCoverage,false);assert.equal(result.data?.blockHash,hash);assert.equal(result.data?.blockTimestampSeconds,'4660');assert.equal(f.verified(),2);
 assert.deepEqual(f.methods.find(item=>item.method==='debug_traceCall')?.params,[request.transaction,'0x100',{tracer:'callTracer',timeout:'1s',reexec:0}]);
 assert.deepEqual(f.methods.map(item=>item.method),['eth_chainId','eth_getBlockByNumber','debug_traceCall','eth_getBlockByNumber']);assert.ok(!f.methods.some(item=>/send|impersonate|setBalance|mine/.test(item.method)));
 assert.equal((result.data?.calls as any[])[1].selector,'0xabcdef01');assert.equal(result.data?.limits&& (result.data.limits as any).responseBytes,FORK_TRACE_LIMITS.responseBytes);
});
test('unbound, reorganized, unavailable and special-envelope fork traces cannot produce passing execution evidence',async()=>{
 for(const mode of ['chain','before','after','root','reorg','envelope','missing_transport'] as const){
  const f=fixture((method,_params,nth)=>mode==='chain'&&method==='eth_chainId'?'0xa':mode==='before'&&method==='eth_getBlockByNumber'?{...header,hash:`0x${'cd'.repeat(32)}`}:mode==='after'&&method==='eth_getBlockByNumber'&&nth===2?{...header,timestamp:'0x1235'}:mode==='root'&&method==='debug_traceCall'?{...trace(),input:'0xdeadbeef'}:undefined);
  if(mode==='reorg'){let count=0;f.fork.verifyTraceSource=async()=>++count===1;}
  if(mode==='missing_transport')delete f.fork.traceRpc;
  const req=mode==='envelope'?{...request,transaction:{...request.transaction,type:'0x4'}}:request;
  const [result]=await isolatedForkTraceEvidence(req,f.fork);assert.equal(result.status,'unknown',mode);assert.equal(result.data?.traceAvailable,false,mode);assert.equal(result.data?.calls,undefined,mode);
  if(['chain','before','envelope','missing_transport'].includes(mode))assert.ok(!f.methods.some(item=>item.method==='debug_traceCall'),mode);
 }
});
test('reverted and bounded partial fork traces preserve explicit execution warnings and coverage gaps',async()=>{
 const reverted=fixture(method=>method==='debug_traceCall'?{...trace(),error:'SECRET_PROVIDER_MESSAGE'}:undefined),[warning]=await isolatedForkTraceEvidence(request,reverted.fork);assert.equal(warning.status,'warning');assert.equal(warning.data?.rootReverted,true);assert.ok(!JSON.stringify(warning).includes('SECRET_PROVIDER_MESSAGE'));
 const truncated=fixture(method=>method==='debug_traceCall'?{...trace(),calls:Array.from({length:129},()=>trace().calls[0])}:undefined),[partial]=await isolatedForkTraceEvidence(request,truncated.fork);assert.equal(partial.status,'unknown');assert.equal(partial.data?.traceAvailable,true);assert.equal(partial.data?.traceTruncated,true);assert.ok((partial.data?.traceGaps as string[]).includes('trace_frame_limit'));assert.equal((partial.data?.calls as unknown[]).length,128);
});
test('an isolated base-block trace survives later simulation execution failure and closes the same single fork',async()=>{
 const f=fixture();let opened=0,closed=0;const methods:string[]=[];
 const factory:ForkFactory=async()=>{opened++;return {...f.fork,close:async()=>{closed++;},rpc:async(method)=>{methods.push(method);if(method==='eth_sendTransaction')throw Error('local receipt failed');if(method==='eth_getBalance')return '0x64';if(method==='evm_snapshot')return '1';return '0x';}};};
 const checks=await simulateRequest(request,decodeRequest(request),{apiKey:'',model:'test',aiEnabled:false,lookups:false,goPlusToken:'',forkEnabled:true,rpc:{1:'https://fixture.invalid'}},factory);
 assert.equal(opened,1);assert.equal(closed,1);assert.equal(checks.find(item=>item.id==='call_trace_fork')?.status,'pass');assert.equal(checks.find(item=>item.id==='simulation_execution')?.status,'unknown');assert.equal(methods.filter(method=>method==='eth_sendTransaction').length,1);assert.ok(!checks.some(item=>item.id==='simulation_execution'&&item.status==='pass'));
});
test('fork trace transport failures remain separate from an empty successful trace and do not retain exception secrets',async()=>{
 const f=fixture();f.fork.traceRpc=async()=>{throw Error('https://secret.fixture/private-key');};const [result]=await isolatedForkTraceEvidence(request,f.fork);assert.equal(result.status,'unknown');assert.equal(result.data?.reason,'unavailable');assert.equal(result.data?.traceAvailable,false);assert.ok(!JSON.stringify(result).includes('private-key'));
 assert.deepEqual(await isolatedForkTraceEvidence({kind:'signature',chainId:1,signature:{from,method:'personal_sign',data:'hello'}},f.fork),[]);
});
