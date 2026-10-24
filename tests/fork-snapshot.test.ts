import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateRequest,type ForkFactory,type ForkSession,FORK_SNAPSHOT_LIMITS} from '../src/security/simulation.js';
import {decodeRequest} from '../src/security/decode.js';
import {assess} from '../src/security/rules.js';
import {evidencePacket} from '../src/security/ai.js';
import type {SecurityConfig} from '../src/security/config.js';
import type {SecurityRequest} from '../src/security/types.js';
const from=`0x${'1'.repeat(40)}`,to=`0x${'2'.repeat(40)}`,hash=`0x${'a'.repeat(64)}`;
const request:SecurityRequest={kind:'transaction',chainId:1,transaction:{from,to,data:'0x',value:'0x0'}};
const config:SecurityConfig={apiKey:'',model:'not-called',aiEnabled:false,lookups:false,goPlusToken:'',forkEnabled:true,rpc:{1:'https://not-called.invalid'}};
type Options={changedAfterSend?:boolean;sendFails?:boolean;balanceFailsAfterReceipt?:boolean;verification?:'missing'|'throws'|'hangs';header?:Partial<ForkSession>};
function fixture(options:Options={}){
 let executed=false,verified=0,closed=0,hasReceipt=false;
 const frame={type:'CALL',from,to,input:'0x',value:'0x0'};
 const factory:ForkFactory=async()=>({chainId:1,blockNumber:'16',blockHash:hash,blockTimestampSeconds:'256',...options.header,close:async()=>{closed++;},
  ...(options.verification==='missing'?{}:{verifyTraceSource:async()=>{
   verified++;if(executed&&options.verification==='throws')throw Error('private provider failure');
   if(executed&&options.verification==='hangs')return new Promise<boolean>(()=>{});
   return !(executed&&options.changedAfterSend);
  }}),
  traceRpc:async method=>method==='eth_chainId'?'0x1':method==='eth_getBlockByNumber'?{number:'0x10',hash,timestamp:'0x100'}:frame,
  rpc:async method=>{
   if(method==='evm_snapshot')return '1';if(method==='anvil_impersonateAccount')return null;
   if(method==='eth_getBalance'){if(hasReceipt&&options.balanceFailsAfterReceipt)throw Error('private balance failure');return '0x1000';}
   if(method==='eth_sendTransaction'){executed=true;if(options.sendFails)throw Error('local execution failed');return `0x${'b'.repeat(64)}`;}
   if(method==='eth_getTransactionReceipt'){hasReceipt=true;return {status:'0x1',blockNumber:'0x11',gasUsed:'0x0',effectiveGasPrice:'0x0',logs:[]};}
   if(method==='debug_traceTransaction')return frame;if(method==='evm_revert')return true;throw Error('Unexpected method');
  }});
 return {factory,state:()=>({verified,closed})};
}
const run=async(options:Options={})=>{const f=fixture(options);const checks=await simulateRequest(request,decodeRequest(request),config,f.factory);return {checks,...f.state()};};
test('fork source is checked after the complete execution and asset work before its observations are returned',async()=>{
 const result=await run();assert.equal(result.verified,3);assert.equal(result.closed,1);
 const execution=result.checks.find(check=>check.id==='simulation_execution')!;assert.equal(execution.status,'pass');assert.equal(execution.data?.blockHash,hash);assert.equal(execution.data?.sourceSnapshotConsistency,'verified_after_execution');
 assert.equal(result.checks.find(check=>check.id==='call_trace_fork')?.data?.sourceSnapshotConsistency,'verified_after_execution');
});
test('a source reorg after the initial trace discards successful execution and asset facts from the AI packet',async()=>{
 const result=await run({changedAfterSend:true});assert.equal(result.verified,3);assert.equal(result.closed,1);
 assert.deepEqual(result.checks.map(check=>check.id),['asset_simulation','fork_source_snapshot']);
 for(const check of result.checks){assert.equal(check.status,'unknown');assert.equal(check.data?.sourceSnapshotConsistent,false);assert.equal(check.data?.blockHash,undefined);}
 const packet=evidencePacket(assess(request,result.checks));assert.ok(!packet.checks.some(check=>check.id==='simulation_execution'||check.id==='call_trace_fork'));assert.ok(!JSON.stringify(packet).includes(hash));
});
test('source verification also runs on early execution failure and partial post-receipt failure',async()=>{
 for(const options of [{sendFails:true},{balanceFailsAfterReceipt:true}]){
  const result=await run({...options,changedAfterSend:true});assert.equal(result.closed,1);assert.equal(result.verified,3);assert.ok(!result.checks.some(check=>check.status==='pass'));assert.ok(result.checks.some(check=>check.id==='fork_source_snapshot'));
 }
});
test('incomplete or malformed fork source metadata never preserves an apparently verified execution',async()=>{
 for(const options of [{verification:'missing' as const},{header:{blockHash:'0xabc'}},{header:{blockTimestampSeconds:undefined}},{header:{blockNumber:'-1'}},{header:{chainId:10}}]){
  const result=await run(options);assert.equal(result.closed,1);assert.ok(result.checks.every(check=>check.status==='unknown'));assert.ok(result.checks.some(check=>check.id==='fork_source_snapshot'));
 }
});
test('failed and hanging final source checks are bounded, sanitized and still close the private fork',async()=>{
 for(const verification of ['throws','hangs'] as const){const started=Date.now(),result=await run({verification});assert.equal(result.closed,1);assert.ok(Date.now()-started<FORK_SNAPSHOT_LIMITS.verificationMs+1200);assert.ok(result.checks.some(check=>check.id==='fork_source_snapshot'));assert.ok(!JSON.stringify(result.checks).includes('private provider'));}
});
