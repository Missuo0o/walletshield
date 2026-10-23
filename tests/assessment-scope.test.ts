import test from 'node:test';
import assert from 'node:assert/strict';
import {assessmentScope} from '../src/security/assessment-scope.js';
import {evidencePacket,validateAI} from '../src/security/ai.js';
import {assess} from '../src/security/rules.js';
import {evidence} from '../src/security/evidence.js';
import {modelDimensions} from './fixtures/model.js';
import type {SecurityReport} from '../src/security/types.js';

const at=Date.parse('2026-10-22T20:00:00Z');
const legacyTitle='Off-chain purpose is unverified';
function report():SecurityReport {
 const value=assess({kind:'transaction',chainId:1,transaction:{from:'0x'+'1'.repeat(40),to:'0x'+'2'.repeat(40),data:'0x'}},[]);
 value.createdAt=new Date(at).toISOString();
 value.checks=value.checks.filter(c=>c.id==='operation');
 value.checks.forEach(c=>{c.observedAt=new Date(at).toISOString();});
 value.complete=true;value.missingData=[];
 return value;
}
function output(){return {...modelDimensions('operation'),score:11,assessment:'low',evidence_confidence:'strong',summary:'Only the supplied observable request is assessed; this does not establish safety.',reasons:[{text:'The supplied request has a decoded operation.',evidence_ids:['operation']}],missing_data:[] as string[],suggested_action:'Independently verify the recipient and request parameters.',honeypot:'unknown'};}
function critical(value:SecurityReport,missing:string[]=[]){
 const proposed={...output(),missing_data:missing};
 assert.throws(()=>validateAI(proposed,value,'test'),/Unresolved evidence cannot have strong confidence/);
 assert.throws(()=>validateAI({...proposed,evidence_confidence:'limited'},value,'test'),/Incomplete evidence cannot be called low risk/);
 assert.equal(validateAI({...proposed,evidence_confidence:'limited',assessment:'review'},value,'test').score,11,'Uncertainty does not replace or impose a model number.');
}

test('gap-free observable evidence permits scoped low and strong without an automatic off-chain-purpose gap',()=>{
 const value=report(),scope=assessmentScope(value),accepted=validateAI(output(),value,'test');
 assert.equal(scope.policy,'observable-request-v1');
 assert.equal(Object.hasOwn(scope,'contextualUnknownCheckIds'),false);
 assert.equal(Object.hasOwn(scope,'contextualMissingData'),false);
 assert.deepEqual(scope.criticalUnknownCheckIds,[]);assert.deepEqual(scope.criticalMissingData,[]);
 assert.match(scope.boundary,/not a guarantee/);
 assert.equal(accepted.score,11);assert.equal(accepted.assessment,'low');assert.equal(accepted.evidence_confidence,'strong');
 assert.deepEqual(accepted.missing_data,[]);
 assert.equal(value.complete,true);assert.deepEqual(value.missingData,[]);
 const packet=evidencePacket(value);assert.equal(packet.evidenceComplete,true);
 assert.deepEqual(packet.missing_checks,[]);assert.deepEqual(packet.assessment_scope,scope);
});

test('critical unknowns stay critical even when a stale complete flag or missing list omits them',()=>{
 const value=report();value.complete=true;value.missingData=[];
 value.checks.push({...evidence('signature_replay_state','unknown','Replay state not observed','No interface result','rpc'),observedAt:new Date(at).toISOString()});
 const scope=assessmentScope(value);
 assert.deepEqual(scope.criticalUnknownCheckIds,['signature_replay_state']);
 assert.deepEqual(scope.criticalMissingData,['Replay state not observed']);
 critical(value);
 const accepted=validateAI({...output(),assessment:'review',evidence_confidence:'limited'},value,'test');
 assert.deepEqual(accepted.missing_data,['Replay state not observed']);
 assert.equal(evidencePacket(value).evidenceComplete,false);
 assert.deepEqual(evidencePacket(value).missing_checks,['Replay state not observed']);
});

test('every model-discovered gap stays critical, including the former contextual title',()=>{
 const value=report();
 for(const text of ['Unknown spender identity',legacyTitle,'Off-chain purpose is unverified ','off-chain purpose is unverified']) {
  assert.ok(assessmentScope(value,[text]).criticalMissingData.includes(text));
  critical(value,[text]);
 }
});

test('a legacy or forged fraud-context identifier has no exception regardless of source',()=>{
 for(const source of ['rules/0.3.0','goplus','rpc','user_reported','rules']) {
  const value=report();value.checks.push({...evidence('fraud_context','unknown',legacyTitle,'A supplied unresolved observation, not an automatic product check.',source),observedAt:new Date(at).toISOString()});
  const scope=assessmentScope(value);
  assert.equal(Object.hasOwn(scope,'contextualUnknownCheckIds'),false,source);
  assert.deepEqual(scope.criticalUnknownCheckIds,['fraud_context'],source);
  assert.ok(scope.criticalMissingData.includes(legacyTitle),source);
  critical(value);
 }
});

test('unknowns with colliding titles remain individually identified and cannot be exempted',()=>{
 const value=report();for(const id of ['unobserved_protocol','second_unobserved_protocol'])value.checks.push({...evidence(id,'unknown',legacyTitle,'An unfinished check with a colliding title','rpc'),observedAt:new Date(at).toISOString()});
 const scope=assessmentScope(value);
 assert.deepEqual(scope.criticalUnknownCheckIds,['unobserved_protocol','second_unobserved_protocol']);
 assert.deepEqual(scope.criticalMissingData,[legacyTitle]);
 critical(value);
});

test('explicit missing data and an unexplained incomplete report remain critical',()=>{
 const value=report();value.missingData.push('Collector deadline exceeded');
 assert.ok(assessmentScope(value).criticalMissingData.includes('Collector deadline exceeded'));critical(value);
 const empty=report();empty.complete=false;
 const scope=assessmentScope(empty);
 assert.deepEqual(scope.criticalUnknownCheckIds,[]);
 assert.deepEqual(scope.criticalMissingData,['Evidence collection is incomplete; specific missing observations were not supplied.']);
 critical(empty);
});

test('stale, future and invalid timestamps remain critical on actual observed checks',()=>{
 for(const [observedAt,marker] of [[new Date(at-300001).toISOString(),'Stale observation'],[new Date(at+30001).toISOString(),'Future-dated observation'],['invalid','Missing observation timestamp']] as const) {
  const id='operation';
  const value=report();value.checks.find(c=>c.id===id)!.observedAt=observedAt;
  assert.ok(assessmentScope(value).criticalMissingData.includes(`${marker}: ${id}`),`${marker} ${id}`);
  critical(value);
 }
});

test('conflicting hashes at one chain and height remain critical; fork execution is a distinct state space',()=>{
 const value=report();
 for(const [id,hash,source] of [['observed_a','a','rpc'],['observed_b','b','rpc']] as const)value.checks.push({...evidence(id,'pass',id,'Synthetic pinned observation',source,{chainId:1,blockNumber:'100',blockHash:'0x'+hash.repeat(64),blockTimestampSeconds:String(at/1000)}),observedAt:new Date(at).toISOString()});
 assert.ok(assessmentScope(value).criticalMissingData.includes('Conflicting block hashes: chain 1, block 100'));
 critical(value);
 value.checks.find(c=>c.id==='observed_b')!.source='isolated-fork';
 assert.deepEqual(assessmentScope(value).criticalMissingData,[]);
 assert.equal(validateAI(output(),value,'test').score,11);
});
