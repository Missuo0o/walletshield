import test from 'node:test';
import assert from 'node:assert/strict';
import {transactionTraceEvidence,normalizeTrace,TRACE_LIMITS} from '../src/security/trace.js';
import {probeNetwork} from '../src/server/networks.js';
import {loadSecurityConfig,type SecurityConfig} from '../src/security/config.js';
import type {SecurityRequest} from '../src/security/types.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {modelFactCandidates,FACT_LIMITS} from '../src/security/model-facts.js';
import {dimensionsForEvidence,validateCertaintyClaims} from '../src/security/ai-claims.js';
import {assess} from '../src/security/rules.js';
import {evidence} from '../src/security/evidence.js';
const from='0x1111111111111111111111111111111111111111',to='0x2222222222222222222222222222222222222222',third='0x3333333333333333333333333333333333333333',hash=`0x${'ab'.repeat(32)}`;
const url='https://primary.fixture.invalid/private-primary-key',dedicated='https://trace.fixture.invalid/private-trace-key';
const header={number:'0x100',hash,timestamp:'0x1234'};
const request:SecurityRequest={kind:'transaction',chainId:1,transaction:{from,to,data:'0x12345678',value:'0x5',gas:'0x10000',gasPrice:'0x4',nonce:'0x2',type:'0x0'}};
const config:SecurityConfig={apiKey:'',model:'fixture',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{1:url}};
type Call={url:string;method:string;params:any[];id:number};
const debug=(tx=request.transaction)=>({type:'CALL',from:tx.from,to:tx.to,input:tx.data,value:tx.value??'0x0',output:'0x',calls:[{type:'DELEGATECALL',from:to,to:third,input:'0xabcdef01',value:'0x0'}]});
const parity=(tx=request.transaction)=>({output:'0x',trace:[{type:'call',action:{callType:'call',from:tx.from,to:tx.to,input:tx.data,value:tx.value??'0x0'},result:{output:'0x'},traceAddress:[],subtraces:0}]});
function mock(change:(call:Call)=>any){const calls:Call[]=[];const fetcher:typeof fetch=async(input,init)=>{const body=JSON.parse(String(init?.body)),call={url:String(input),...body};calls.push(call);assert.equal(init?.redirect,'error');assert.ok(init?.signal);const value=change(call);return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,...(value===undefined?{error:{code:-32601,message:'provider failure includes a secret'}}:{result:value})}));};return {calls,fetcher};}
const common=(call:Call)=>call.method==='eth_chainId'?'0x1':call.method==='eth_getBlockByNumber'?header:undefined;

test('transaction tracing preserves supplied execution fields and pinned snapshot with bounded summaries',async()=>{
 const fixture=mock(call=>common(call)??(call.method==='debug_traceCall'?debug():undefined));
 const [check]=await transactionTraceEvidence(request,config,fixture.fetcher);assert.equal(check.status,'pass');assert.equal(check.data?.method,'debug_traceCall');assert.equal(check.data?.blockNumber,'256');assert.equal(check.data?.blockHash,hash);assert.equal(check.data?.completeAssetCoverage,false);
 const trace=fixture.calls.find(c=>c.method==='debug_traceCall')!;assert.deepEqual(trace.params,[request.transaction,'0x100',{tracer:'callTracer',timeout:'1s',reexec:0}]);
 assert.deepEqual(fixture.calls.map(c=>c.method),['eth_chainId','eth_getBlockByNumber','eth_getBlockByNumber','debug_traceCall','eth_getBlockByNumber']);
 assert.equal((check.data?.calls as any[])[1].selector,'0xabcdef01');assert.ok(!JSON.stringify(check).includes('private-primary-key'));assert.ok(!JSON.stringify(check).includes('provider failure'));
});
test('unsupported debug dialect falls back to trace_call without changing endpoint, transaction or block',async()=>{
 const fixture=mock(call=>common(call)??(call.method==='trace_call'?parity():undefined));const [check]=await transactionTraceEvidence(request,config,fixture.fetcher);
 assert.equal(check.status,'pass');assert.equal(check.data?.method,'trace_call');assert.deepEqual(fixture.calls.find(c=>c.method==='trace_call')?.params,[request.transaction,['trace'],'0x100']);assert.equal((check.data?.attempts as any[])[0].result,'method_unsupported');
});
test('dedicated tracing endpoint must match primary chain and exact block hash before receiving wallet call',async()=>{
 for(const mismatch of ['chain','hash','timestamp'] as const){
  const fixture=mock(call=>call.url===dedicated?(call.method==='eth_chainId'?mismatch==='chain'?'0xa':'0x1':call.method==='eth_getBlockByNumber'?{...header,...(mismatch==='hash'?{hash:`0x${'cd'.repeat(32)}`} :mismatch==='timestamp'?{timestamp:'0x1235'}:{})}:debug()):common(call));
  const [check]=await transactionTraceEvidence(request,{...config,traceRpc:{1:dedicated}},fixture.fetcher);assert.equal(check.status,'unknown');assert.equal(check.data?.traceAvailable,false);assert.ok(!fixture.calls.some(c=>c.url===dedicated&&['debug_traceCall','trace_call'].includes(c.method)));assert.ok(!JSON.stringify(check).includes('private-trace-key'));
 }
 const fixture=mock(call=>common(call)??(call.url===dedicated&&call.method==='debug_traceCall'?debug():undefined));const [check]=await transactionTraceEvidence(request,{...config,traceRpc:{1:dedicated}},fixture.fetcher);
 assert.equal(check.status,'pass');assert.equal(check.data?.endpoint,'dedicated');assert.equal(fixture.calls.filter(c=>c.url===url&&c.method==='eth_getBlockByNumber').length,3,'Primary hash must be checked after dedicated tracing as well');
});
test('primary wrong chain or malformed header never forwards the unsigned wallet call to any trace endpoint',async()=>{
 for(const scenario of ['chain','header'] as const){const fixture=mock(call=>call.method==='eth_chainId'?scenario==='chain'?'0xa':'0x1':{...header,hash:'invalid'});const [check]=await transactionTraceEvidence(request,{...config,traceRpc:{1:dedicated}},fixture.fetcher);assert.equal(check.status,'unknown');assert.ok(!fixture.calls.some(c=>['debug_traceCall','trace_call'].includes(c.method)));assert.ok(!fixture.calls.some(c=>c.url===dedicated));}
});
test('reorganized or inconsistent provider snapshots cannot become successful retained traces',async()=>{
 let headers=0;const fixture=mock(call=>call.method==='eth_getBlockByNumber'?{...header,hash:++headers>=3?`0x${'cd'.repeat(32)}`:hash}:common(call)??debug());const [check]=await transactionTraceEvidence(request,config,fixture.fetcher);assert.equal(check.status,'unknown');assert.equal(check.data?.traceAvailable,false);assert.ok((check.data?.attempts as any[]).some(a=>a.result==='snapshot_changed'));
});
test('malformed, empty, unbound, truncated and reverted traces retain honest extraction semantics',()=>{
 assert.equal(normalizeTrace({output:'0x',trace:[]},'trace_call',request.transaction),null);
 assert.equal(normalizeTrace({...debug(),from:third},'debug_traceCall',request.transaction),null);
 assert.equal(normalizeTrace({...debug(),input:'0x87654321'},'debug_traceCall',request.transaction),null);
 assert.equal(normalizeTrace({...debug(),value:'0x999'},'debug_traceCall',request.transaction),null);
 assert.equal(normalizeTrace({...debug(),type:'DELEGATECALL'},'debug_traceCall',request.transaction),null);
 assert.equal(normalizeTrace({...parity(),trace:[...parity().trace,...parity().trace]},'trace_call',request.transaction),null);
 const root=debug();root.calls=Array.from({length:TRACE_LIMITS.frames+1},()=>debug().calls[0]);const bounded=normalizeTrace(root,'debug_traceCall',request.transaction)!;assert.equal(bounded.calls.length,TRACE_LIMITS.frames);assert.ok(bounded.gaps.includes('trace_frame_limit'));
 const deep:any=debug();let cursor=deep;for(let i=0;i<TRACE_LIMITS.depth+2;i++){cursor.calls=[debug()];cursor=cursor.calls[0];}assert.ok(normalizeTrace(deep,'debug_traceCall',request.transaction)?.gaps.includes('trace_depth_limit'));
 const revert=normalizeTrace({...debug(),error:'execution reverted; never retain provider prose'},'debug_traceCall',request.transaction)!;assert.equal(revert.rootReverted,true);assert.ok(!JSON.stringify(revert).includes('provider prose'));
});
test('special execution envelopes and signature requests do not trace altered substitutes',async()=>{
 let calls=0;const noFetch:typeof fetch=async()=>{calls++;throw Error('must not fetch');};const tx={...request,transaction:{...request.transaction,type:'0x4'}} as SecurityRequest;const [unsupported]=await transactionTraceEvidence(tx,config,noFetch);assert.equal(unsupported.status,'unknown');assert.deepEqual(unsupported.data?.unsupportedFields,['type_7702']);
 assert.deepEqual(await transactionTraceEvidence({kind:'signature',chainId:1,signature:{from,method:'personal_sign',data:'hello'}},config,noFetch),[]);assert.equal(calls,0);
});
test('trace body size limit leaves an explicit unknown and permits bounded alternate dialect',async()=>{
 const calls:string[]=[];const fetcher:typeof fetch=async(_input,init)=>{const call=JSON.parse(String(init?.body));calls.push(call.method);if(call.method==='debug_traceCall')return new Response('x'.repeat(TRACE_LIMITS.responseBytes+1));const result=common({...call,url})??parity();return new Response(JSON.stringify({jsonrpc:'2.0',id:call.id,result}));};const [check]=await transactionTraceEvidence(request,config,fetcher);assert.equal(check.data?.method,'trace_call');assert.equal(calls.filter(m=>m==='debug_traceCall').length,1);
});
test('trace deadline also aborts a stalled response body after headers before trying the alternate dialect',async()=>{
 let bodyAborted=false;
 const fetcher:typeof fetch=async(_input,init)=>{const call=JSON.parse(String(init?.body));if(call.method==='debug_traceCall')return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"jsonrpc":"2.0"'));init!.signal!.addEventListener('abort',()=>{bodyAborted=true;controller.error(Error('deadline'));},{once:true});}}));const result=common({...call,url})??parity();return new Response(JSON.stringify({jsonrpc:'2.0',id:call.id,result}));};
 const started=Date.now();const [check]=await transactionTraceEvidence(request,config,fetcher);assert.equal(bodyAborted,true);assert.equal(check.data?.method,'trace_call');assert.ok(Date.now()-started<TRACE_LIMITS.totalMs);
});
test('trace diagnostics distinguish bounded provider failure classes without exposing messages or endpoints',async()=>{
 for(const [status,reason] of [[403,'provider_access_denied'],[429,'rate_limited']] as const){
  const fetcher:typeof fetch=async(_url,init)=>{const call=JSON.parse(String(init?.body));if(['debug_traceCall','trace_call'].includes(call.method))return new Response('private-provider-key',{status});return new Response(JSON.stringify({jsonrpc:'2.0',id:call.id,result:common({...call,url})}));};
  const [check]=await transactionTraceEvidence(request,config,fetcher);assert.equal(check.status,'unknown');assert.deepEqual((check.data?.attempts as any[]).map(a=>a.result),[reason,reason]);assert.ok(!JSON.stringify(check).includes('private-provider-key'));assert.ok(!JSON.stringify(check).includes('fixture.invalid'));
 }
});
test('fixed network capability probe tries the alternate trace dialect and validates the root binding',async()=>{
 const fixture=mock(call=>call.method==='trace_call'?parity({from:'0x'+'0'.repeat(40),to:'0x'+'0'.repeat(40),data:'0x'}):call.method==='eth_call'?'0x':call.method==='eth_getBalance'?'0x0':common(call));const snapshot=await probeNetwork(url,1,undefined,fixture.fetcher);assert.equal(snapshot.capabilities?.callTrace,'observed');assert.equal(snapshot.capabilities?.callTraceMethod,'trace_call');assert.ok(fixture.calls.every(c=>!/^eth_send|anvil_|evm_/.test(c.method)));
});
test('dedicated trace config accepts only operator endpoints on configured public chains and keeps local chain fixed',async()=>{
 const root=await mkdtemp(join(tmpdir(),'walletshield-trace-'));try{const cfg=await loadSecurityConfig({root,env:{RPC_1_URL:url,TRACE_RPC_1_URL:dedicated,TRACE_RPC_10_URL:'https://unconfigured.invalid',TRACE_RPC_31337_URL:dedicated,TRACE_RPC_56_URL:'http://remote.invalid',RPC_56_URL:'https://bsc.invalid',TRACE_RPC_8453_URL:'https://user:secret@remote.invalid',RPC_8453_URL:'https://base.invalid'}});assert.deepEqual(cfg.traceRpc,{1:dedicated});assert.equal(cfg.rpc[31337],'http://127.0.0.1:8545');}finally{await rm(root,{recursive:true,force:true});}
});
test('bounded frame facts reach Muse with native units, endpoint subjects and execution-only admissibility',()=>{
 const calls=Array.from({length:8},(_,depth)=>({type:depth?'DELEGATECALL':'CALL',from,to:depth?third:to,value:'0x5',selector:'0x12345678',depth,reverted:depth===3,input:'RAW_CALLDATA_MUST_NOT_ENTER_FACTS',error:'PROVIDER_PROSE_MUST_NOT_ENTER_FACTS'}));
 const check=evidence('call_trace','pass','Trace fixture','Bounded observation','rpc',{chainId:1,blockNumber:'256',blockHash:hash,blockTimestampSeconds:'4660',calls,traceAvailable:true,traceTruncated:false,traceGaps:[],retainedTraceCalls:8,rootReverted:false,completeAssetCoverage:false});
 const report=assess(request,[check]),packet=modelFactCandidates(report),facts=packet.candidates.filter(item=>item.fact.evidence_id==='call_trace');
 assert.deepEqual(dimensionsForEvidence(check,report),['execution']);
 const frame=(name:string)=>facts.find(item=>item.fact.field===`data.calls[1].${name}`)!;
 assert.equal(frame('callType').fact.value,'DELEGATECALL');assert.deepEqual(frame('from').fact.subject,{role:'account',value:from});assert.deepEqual(frame('to').fact.subject,{role:'target',value:third});assert.deepEqual(frame('selector').fact.subject,{role:'target',value:third});
 assert.equal(frame('valueWei').fact.value,'5');assert.deepEqual(frame('valueWei').fact.subject,{role:'asset',value:'native'});assert.equal(frame('depth').fact.value,1);assert.deepEqual(frame('reverted').admissible_dimensions,['execution']);assert.equal(frame('selector').fact.provenance.block_hash,hash);
 assert.ok(!JSON.stringify(packet).includes('RAW_CALLDATA'));assert.ok(!JSON.stringify(packet).includes('PROVIDER_PROSE'));assert.ok(!facts.some(item=>item.fact.field.startsWith(`data.calls[${FACT_LIMITS.traceFrames}]`)));assert.ok(packet.scope.omitted>=4);
 assert.deepEqual(facts.find(item=>item.fact.field==='data.completeAssetCoverage')?.admissible_dimensions,[]);
 assert.throws(()=>validateCertaintyClaims([{text:'The contract is safe and the transfer will succeed.',evidence_ids:['call_trace']}],report),/Unsupported/);
});
test('unknown and truncated trace observations preserve structured gap facts without certifying a rated dimension',()=>{
 const check=evidence('call_trace','unknown','Truncated trace','Incomplete call inventory','rpc',{chainId:1,blockNumber:'256',blockHash:hash,calls:[{type:'CALL',from,to,value:'0x0',selector:'0x12345678',depth:0,reverted:false}],traceAvailable:true,traceTruncated:true,traceGaps:['trace_frame_limit'],retainedTraceCalls:1,completeAssetCoverage:false});
 const report=assess(request,[check]),facts=modelFactCandidates(report).candidates.filter(item=>item.fact.evidence_id==='call_trace');assert.deepEqual(dimensionsForEvidence(check,report),[]);
 assert.equal(facts.find(item=>item.fact.field==='data.traceGaps[0]')?.fact.value,'trace_frame_limit');assert.ok(facts.every(item=>item.fact.scope==='unresolved-check'));assert.ok(facts.every(item=>item.admissible_dimensions.length===0));
 check.status='pass';check.data!.traceAvailable=false;assert.deepEqual(dimensionsForEvidence(check,report),[],'A forged passing status cannot establish a missing trace');
});
