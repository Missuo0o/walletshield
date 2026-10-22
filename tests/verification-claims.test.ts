import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAI} from '../src/security/ai.js';
import {evidence} from '../src/security/evidence.js';
import {finitePermitOutput,finitePermitReport} from './fixtures/model.js';

type ModelOutput=Omit<ReturnType<typeof finitePermitOutput>,'missing_data'>&{missing_data:string[]};
type Slot='reason'|'dimension'|'summary'|'action'|'missing';
function model():ModelOutput{
 const result=finitePermitOutput(23);
 result.summary='Known request scope; further context is unavailable.';
 result.reasons=[{text:'The parsed permission has a finite amount.',evidence_ids:['operation','permission_scope']}];
 result.dimensions[0].reason='The parsed permission has a finite amount.';
 result.dimensions[0].evidence_ids=['operation','permission_scope'];
 result.suggested_action='Verify the spender and intended purpose.';
 return result;
}
function write(result:ModelOutput,slot:Slot,text:string,ids=['operation']){
 if(slot==='reason')result.reasons=[{text,evidence_ids:ids}];
 if(slot==='dimension'){result.dimensions[0].reason=text;result.dimensions[0].evidence_ids=ids;}
 if(slot==='summary')result.summary=text;
 if(slot==='action')result.suggested_action=text;
 if(slot==='missing')result.missing_data=[text];
 return result;
}
const error=/Unsupported signature verification claim/;

test('all displayed prose rejects unsupported verification, including action and missing-data text',()=>{
 const report=finitePermitReport();
 for(const slot of ['reason','dimension','summary','action','missing'] as const)for(const text of [
  'The nonce is verified and no further nonce check is needed.',
  'Check the recipient because the nonce is verified.',
  'The domain does not match; check the recipient.',
  'Proceed because the domain is valid and no concern was found.',
  'nonce 已核对匹配，不需要再检查。',
  '请检查收款方，因为域分隔符已验证。'
 ])assert.throws(()=>validateAI(write(model(),slot,text),report,'test'),error,`${slot}: ${text}`);
});

test('a negation or advice about another assertion cannot suppress a factual match or mismatch',()=>{
 const report=finitePermitReport();
 for(const text of [
  'No identity conclusion was made and the nonce is verified.',
  'Do not proceed because the domain does not match.',
  'The nonce is verified but the domain remains unknown.',
  'The nonce remains unknown and the domain is verified.',
  'The nonce was unknown but is now verified.',
  'The nonce was unknown and is now verified.',
  'The nonce is not verified but matched.',
  'Check the spender and the domain is verified.',
  'The domain is not valid.',
  'The domain has no mismatch.',
  'The nonce is not invalid.'
 ])assert.throws(()=>validateAI(write(model(),'reason',text),report,'test'),error,text);
});

test('uncertainty, scoped questions, conditional advice and attributed claims are not invented observations',()=>{
 const report=finitePermitReport();
 report.checks.filter(c=>/^signature_(?:nonce|domain)$/.test(c.id)).forEach(c=>{c.status='unknown';});
 for(const text of [
  'The nonce has not been verified; the domain is unconfirmed.',
  "The nonce isn't verified.",
  'Verify whether the nonce matches before signing.',
  'If the nonce is verified and the domain matches, review the spender next.',
  'Please verify that the nonce is valid and the domain matches before signing.',
  'The nonce may be verified; the domain might be invalid.',
  'The nonce mismatch is not confirmed.',
  'There is no evidence of a nonce mismatch.',
  'The nonce matches only if the pending state remains unchanged.',
  'Does the domain match?',
  'The website claims the nonce is verified and the domain matches; this was not independently checked.',
  'nonce 未核对，domain 尚待验证；请核对后再决定。',
  '用户声称 nonce 已验证，但该说法未独立核实。不能据此认为 domain 不匹配。'
 ])assert.doesNotThrow(()=>assert.equal(validateAI(write(model(),'reason',text),report,'test').score,23),text);
});

test('match and mismatch assertions need the corresponding cited RPC observation in the same direction',()=>{
 for(const kind of ['nonce','domain'] as const) {
  const id=`signature_${kind}`,report=finitePermitReport();
  for(const text of [`The ${kind} is verified.`,`The ${kind} matches.`,`${kind} 已核对匹配。`]) {
   const value=write(model(),'reason',text,[id]);
   assert.equal(validateAI(value,report,'test').score,23,text);
   const unknown=structuredClone(report);unknown.checks.find(c=>c.id===id)!.status='unknown';
   assert.throws(()=>validateAI(value,unknown,'test'),error,text);
   const wrongSource=structuredClone(report);wrongSource.checks.find(c=>c.id===id)!.source='goplus';
   assert.throws(()=>validateAI(value,wrongSource,'test'),error,text);
  }
  const mismatch=structuredClone(report);mismatch.checks.find(c=>c.id===id)!.status='risk';
  for(const text of [`The ${kind} does not match.`,`The ${kind} is invalid.`,`${kind} 与链上状态不一致。`]) {
   assert.equal(validateAI(write(model(),'reason',text,[id]),mismatch,'test').score,23,text);
   assert.throws(()=>validateAI(write(model(),'reason',text,[id]),report,'test'),error,text);
  }
 }
});

test('coordinated nonce and domain assertions cannot borrow one another’s observation',()=>{
 const report=finitePermitReport();
 for(const text of ['The nonce and domain are verified.','Verified nonce and domain.','nonce 与 domain 已核对匹配。']) {
  assert.throws(()=>validateAI(write(model(),'reason',text,['signature_nonce']),report,'test'),error,text);
  assert.equal(validateAI(write(model(),'reason',text,['signature_nonce','signature_domain']),report,'test').score,23,text);
 }
 const mixed=structuredClone(report);mixed.checks.find(c=>c.id==='signature_domain')!.status='risk';
 assert.equal(validateAI(write(model(),'reason','The nonce is verified and the domain does not match.',['signature_nonce','signature_domain']),mixed,'test').score,23);
 assert.throws(()=>validateAI(write(model(),'reason','The nonce and domain are verified.',['signature_nonce','signature_domain']),mixed,'test'),error);
});

test('summary and suggested action use only actually cited supporting observations',()=>{
 const report=finitePermitReport();
 for(const slot of ['summary','action','missing'] as const) {
  const value=write(model(),slot,'The nonce is verified and the domain matches.');
  assert.throws(()=>validateAI(value,report,'test'),error);
  value.reasons[0].evidence_ids.push('signature_nonce','signature_domain');
  assert.equal(validateAI(value,report,'test').score,23);
 }
 const local=write(model(),'reason','The nonce is verified.',['operation']);
 local.dimensions[0].evidence_ids.push('signature_nonce');
 assert.throws(()=>validateAI(local,report,'test'),error,'another field’s citation cannot excuse an uncited reason');
});

test('unqualified batch assertions require every entry and indexed assertions require the exact entry',()=>{
 const report=finitePermitReport();report.checks=report.checks.filter(c=>c.id!=='signature_nonce');
 report.checks.push(evidence('signature_nonce_0','pass','Entry zero','Synthetic comparison','rpc'),evidence('signature_nonce_1','unknown','Entry one','Not checked','rpc'));
 for(const text of ['All nonces are verified.','The nonce matches.'])assert.throws(()=>validateAI(write(model(),'reason',text,['signature_nonce_0']),report,'test'),error,text);
 for(const text of ['nonce[0] is verified.','nonce #0 is verified.','nonce index 0 is verified.','nonce_0 is verified.'])assert.equal(validateAI(write(model(),'reason',text,['signature_nonce_0']),report,'test').score,23,text);
 assert.throws(()=>validateAI(write(model(),'reason','nonce[1] is verified.',['signature_nonce_0']),report,'test'),error);
 report.checks.find(c=>c.id==='signature_nonce_1')!.status='risk';
 assert.equal(validateAI(write(model(),'reason','nonce[1] does not match.',['signature_nonce_1']),report,'test').score,23);
 report.checks.find(c=>c.id==='signature_nonce_1')!.status='pass';
 assert.equal(validateAI(write(model(),'reason','All nonces are verified.',['signature_nonce_0','signature_nonce_1']),report,'test').score,23);
});

test('website host comparison is distinct from a typed-message contract domain comparison',()=>{
 const report=finitePermitReport();
 assert.equal(validateAI(write(model(),'reason','The website domain matches the visible origin.'),report,'test').score,23);
 assert.equal(validateAI(write(model(),'reason','The login domain matches the visible origin.'),report,'test').score,23);
 assert.throws(()=>validateAI(write(model(),'reason','The EIP-712 domain matches.'),report,'test'),error);
 if(report.request.kind==='signature')report.request.signature.method='personal_sign';
 assert.equal(validateAI(write(model(),'reason','The domain matches the login origin.'),report,'test').score,23);
 assert.throws(()=>validateAI(write(model(),'reason','The DOMAIN_SEPARATOR is verified.'),report,'test'),error);
});
