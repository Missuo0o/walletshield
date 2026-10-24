import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveModelSelection,scoreWithAI,validateAI} from '../src/security/ai.js';
import {META_MODEL,type SecurityConfig} from '../src/security/config.js';
import {finitePermitOutput,finitePermitReport,structuredModelOutput} from './fixtures/model.js';
import {assess} from '../src/security/rules.js';
import {securityExamples} from '../src/security/examples.js';
import {modelFactCandidates} from '../src/security/model-facts.js';
import {evidence} from '../src/security/evidence.js';
const config:SecurityConfig={apiKey:'synthetic-test-key',model:META_MODEL,aiEnabled:true,lookups:false,goPlusToken:'',rpc:{}};
const envelope=(value:unknown)=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]}));
function selection(value:ReturnType<typeof structuredModelOutput<ReturnType<typeof finitePermitOutput>>>){const {facts,fact_schema_version,...rest}=value;return {...rest,response_schema_version:'walletshield-selection-v1',selected_fact_ids:facts.map(f=>f.id)};}

test('compact fact references preserve the model number and resolve exact original observation provenance',async()=>{
 const report=finitePermitReport(),legacy=structuredModelOutput(finitePermitOutput(37),report),compact=selection(legacy);
 assert.ok(JSON.stringify(compact).length<JSON.stringify(legacy).length);
 const resolved=resolveModelSelection(compact,report) as any;
 assert.deepEqual(resolved.facts,legacy.facts);assert.equal(resolved.score,37);
 const state=await scoreWithAI(report,config,async()=>envelope(compact));
 assert.equal(state.status,'completed');assert.equal(state.result?.score,37);assert.equal(state.attempts,1);assert.equal(state.repaired,false);
 assert.deepEqual(state.result?.facts,legacy.facts);
});

test('compact selection rejects invented, duplicate and cross-evidence citations without changing any score',()=>{
 const report=finitePermitReport(),value=selection(structuredModelOutput(finitePermitOutput(37),report));
 const invented=structuredClone(value);invented.selected_fact_ids[0]='fact_000000000000000000000000';assert.throws(()=>resolveModelSelection(invented,report),/Unknown selected fact/);
 const duplicate=structuredClone(value);duplicate.selected_fact_ids.push(duplicate.selected_fact_ids[0]);assert.throws(()=>resolveModelSelection(duplicate,report),/Ambiguous structured facts/);
 const wrong=structuredClone(value);wrong.reasons[0].evidence_ids=['operation'];wrong.reasons[0].fact_ids=[value.selected_fact_ids.find(id=>{const f=structuredModelOutput(finitePermitOutput(37),report).facts.find(x=>x.id===id);return f?.evidence_id!=='operation';})!];
 assert.throws(()=>validateAI(resolveModelSelection(wrong,report),report,META_MODEL,{requireStructuredFacts:true}),/Structured fact citation mismatch/);
 const certainty=structuredClone(value);certainty.suggested_action='The token can always be sold.';
 assert.throws(()=>validateAI(resolveModelSelection(certainty,report),report,META_MODEL,{requireStructuredFacts:true}),/Unsupported certainty claim/);
});

test('transient HTTP recovery is quota-reserved and shares the two-attempt cap with output repair',async()=>{
 const report=finitePermitReport(),value=selection(structuredModelOutput(finitePermitOutput(37),report));let calls=0,reservations=0;
 const state=await scoreWithAI(report,config,async()=>++calls===1?new Response('{}',{status:503}):envelope(value),()=>{reservations++;return true;});
 assert.equal(state.status,'completed');assert.equal(state.attempts,2);assert.equal(state.repaired,false);assert.equal(reservations,1);assert.match(state.message,/transient retry/);
 calls=0;reservations=0;const invalid=structuredClone(value);invalid.assessment='unknown';
 const rejected=await scoreWithAI(report,config,async()=>++calls===1?new Response('{}',{status:500}):envelope(invalid),()=>{reservations++;return true;});
 assert.equal(calls,2);assert.equal(reservations,1);assert.equal(rejected.failureKind,'validation');assert.equal(rejected.result,undefined);
 for(const [status,code]of [[401,''],[429,''],[500,'insufficient_quota']] as const){calls=0;reservations=0;await scoreWithAI(report,config,async()=>{calls++;return new Response(JSON.stringify({error:{code}}),{status});},()=>{reservations++;return true;});assert.equal(calls,1);assert.equal(reservations,0);}
});

test('signer and login comparisons retain structured facts rather than status labels alone',()=>{
 const permit=securityExamples.find(x=>x.id==='permit')??securityExamples.find(x=>x.request.kind==='signature'&&String(x.id).includes('permit'))!;
 const request=structuredClone(permit.request);assert.equal(request.kind,'signature');if(request.kind!=='signature')return;
 const data=request.signature.data as any;if(typeof data==='object'&&data.message)data.message.owner='0x3333333333333333333333333333333333333333';
 const report=assess(request,[]),candidates=modelFactCandidates(report).candidates;
 const mismatch=report.checks.find(c=>c.id==='signer_mismatch');assert.ok(mismatch);assert.equal(mismatch.data?.ownerMatchesSigner,false);
 assert.ok(candidates.some(x=>x.fact.evidence_id==='signer_mismatch'&&x.fact.field==='data.ownerMatchesSigner'&&x.fact.value===false&&x.admissible_dimensions.includes('identity')));
});

test('transient retry omits incomplete aggregate usage when the failed request may also be billable',async()=>{
 const report=finitePermitReport(),value=selection(structuredModelOutput(finitePermitOutput(37),report));let calls=0;
 const state=await scoreWithAI(report,config,async()=>{
  if(++calls===1)return new Response('{}',{status:502});
  return new Response(JSON.stringify({status:'completed',usage:{input_tokens:12,output_tokens:9},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]}));
 },()=>true);
 assert.equal(state.status,'completed');assert.equal(state.attempts,2);assert.equal(state.result?.usage,undefined,'The successful response alone cannot represent the two paid attempts');
});

test('identity mismatch support is bound to this request signer and committed owner',()=>{
 const request=structuredClone(finitePermitReport().request);assert.equal(request.kind,'signature');if(request.kind!=='signature')return;
 const owner='0x3333333333333333333333333333333333333333';(request.signature.data as any).message.owner=owner;
 const check=evidence('signature_owner_binding','warning','Account comparison','Unsigned owner and signer differ; no signature verified.','eip712',{owner,signer:request.signature.from,ownerMatchesSigner:false,cryptographicSignerVerified:false});
 const report=assess(request,[check]);
 const raw={...finitePermitOutput(58),summary:'The declared owner and selected signer differ; this is not proof of fraud.',reasons:[{text:'The declared owner differs from this request signing account.',evidence_ids:[check.id]}],suggested_action:'Review the committed owner and selected signing account before proceeding.',dimensions:finitePermitOutput(58).dimensions.map(d=>({...d,assessment:d.dimension==='identity'?'high':'unknown',reason:d.dimension==='identity'?'The declared owner differs from this request signing account; malicious intent is unverified.':'This comparison does not establish this dimension.',evidence_ids:[check.id]}))};
 const value=structuredModelOutput(raw,report);
 assert.equal(validateAI(value,report,META_MODEL,{requireStructuredFacts:true}).score,58);
 for(const mutate of [(r:typeof report)=>{r.checks.find(c=>c.id===check.id)!.data!.ownerMatchesSigner=true;},(r:typeof report)=>{r.checks.find(c=>c.id===check.id)!.data!.signer='0x4444444444444444444444444444444444444444';},(r:typeof report)=>{r.checks.find(c=>c.id===check.id)!.data!.owner='0x4444444444444444444444444444444444444444';}]){
  const misbound=structuredClone(report);mutate(misbound);assert.throws(()=>validateAI(value,misbound,META_MODEL,{requireStructuredFacts:true}),/Identity risk requires an observed adverse signal/);
 }
});
