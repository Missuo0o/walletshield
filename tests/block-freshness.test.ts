import test from 'node:test';
import assert from 'node:assert/strict';
import {assess} from '../src/security/rules.js';
import {evidence} from '../src/security/evidence.js';
import {evidenceQuality} from '../src/security/quality.js';
import {assessmentScope} from '../src/security/assessment-scope.js';
import {validateAI,evidencePacket} from '../src/security/ai.js';
import {modelDimensions} from './fixtures/model.js';
const at=Date.parse('2026-10-22T20:00:00Z');
function report(chainId=1,offset=0,source='rpc'){
 const value=assess({kind:'transaction',chainId,transaction:{from:'0x'+'1'.repeat(40),to:'0x'+'2'.repeat(40),data:'0x'}},[]);
 value.createdAt=new Date(at).toISOString();value.complete=true;value.missingData=[];
 value.checks=[{...evidence('operation','pass','Transfer candidate','Synthetic offline fixture','rules'),observedAt:value.createdAt},{...evidence('chain_context','pass','Synthetic chain state','Not a live observation',source,{chainId,blockNumber:'100',blockHash:'0x'+'a'.repeat(64),blockTimestampSeconds:String(at/1000+offset)}),observedAt:value.createdAt}];
 return value;
}
test('fresh response time cannot conceal a stale public upstream block or future clock',()=>{
 for(const [offset,marker] of [[-301,'Stale upstream block'],[31,'Future-dated upstream block']] as const){
  const value=report(1,offset),q=evidenceQuality(value);
  assert.deepEqual(q.freshness.staleCheckIds,[]);assert.deepEqual(q.freshness.futureCheckIds,[]);
  assert.ok(assessmentScope(value).criticalMissingData.includes(`${marker}: chain_context`));
  const proposed={...modelDimensions('operation'),score:12,assessment:'review',evidence_confidence:'strong',summary:'Only this request is assessed.',reasons:[{text:'Candidate operation.',evidence_ids:['operation']}],missing_data:[],suggested_action:'Verify current state independently.',honeypot:'unknown'};
  assert.throws(()=>validateAI(proposed,value,'offline-fixture'),/Unresolved evidence/);
  const accepted=validateAI({...proposed,evidence_confidence:'limited'},value,'offline-fixture');assert.equal(accepted.score,12);assert.ok(accepted.missing_data.includes(`${marker}: chain_context`));
  assert.equal(evidencePacket(value).evidenceComplete,false);assert.ok(evidencePacket(value).missing_checks.includes(`${marker}: chain_context`));
 }
 assert.deepEqual(assessmentScope(report(1,-300)).criticalMissingData,[]);
 assert.deepEqual(assessmentScope(report(1,30)).criticalMissingData,[]);
});
test('missing public header provenance remains explicit and large timestamp values do not overflow',()=>{
 const value=report(),data=value.checks[1].data!;delete data.blockTimestampSeconds;delete data.blockHash;delete data.chainId;
 assert.deepEqual(assessmentScope(value).criticalMissingData,['Missing upstream block timestamp: chain_context','Missing upstream block hash: chain_context','Unverified upstream chain: chain_context']);
 data.chainId=1;data.blockHash='0x'+'a'.repeat(64);data.blockTimestampSeconds='9'.repeat(100);
 assert.deepEqual(evidenceQuality(value).blockFreshness?.futureCheckIds,['chain_context']);
 data.chainId=31337;assert.deepEqual(evidenceQuality(value).blockFreshness?.localCheckIds,[]);assert.deepEqual(evidenceQuality(value).blockFreshness?.unverifiedChainCheckIds,['chain_context'],'A public request cannot bypass freshness using a mismatched local-chain label.');
});
test('isolated fork timestamps are checked against public base blocks while artificial local clocks and demos are not certified',()=>{
 assert.deepEqual(evidenceQuality(report(1,-400,'isolated-fork')).blockFreshness?.staleCheckIds,['chain_context']);
 const local=evidenceQuality(report(31337,-100000));assert.deepEqual(local.blockFreshness?.staleCheckIds,[]);assert.deepEqual(local.blockFreshness?.localCheckIds,['chain_context']);assert.ok(local.caveats.some(c=>c.includes('artificial')));
 const demo=report(1,-100000);demo.source='demo';assert.deepEqual(evidenceQuality(demo).blockFreshness?.staleCheckIds,[]);
});
