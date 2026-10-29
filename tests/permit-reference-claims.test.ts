import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAI} from '../src/security/ai.js';
import {assess} from '../src/security/rules.js';
import {evidence} from '../src/security/evidence.js';
import {finitePermitOutput} from './fixtures/model.js';
import {AI_DIMENSIONS,type SecurityRequest} from '../src/security/types.js';

const owner='0x'+'1'.repeat(40),verifier='0x'+'2'.repeat(40),token='0x'+'3'.repeat(40),spender='0x'+'4'.repeat(40);
function report(matches=false){
 const request:SecurityRequest={kind:'signature',chainId:0,signature:{from:owner,method:'eth_signTypedData_v4',data:{
  domain:{name:matches?'Permit2':'Local Permit2',...(matches?{}:{version:'1'}),chainId:31337,verifyingContract:verifier},
  types:{PermitDetails:[{name:'token',type:'address'},{name:'amount',type:'uint160'},{name:'expiration',type:'uint48'},{name:'nonce',type:'uint48'}],PermitSingle:[{name:'details',type:'PermitDetails'},{name:'spender',type:'address'},{name:'sigDeadline',type:'uint256'}]},
  primaryType:'PermitSingle',message:{details:{token,amount:'100',expiration:'2000000000',nonce:'0'},spender,sigDeadline:'2000000000'}
 }}};
 return assess(request,[evidence('signature_protocol','warning','Reference format comparison','Unsigned name/version only.','reference',{chainId:31337,verifyingContract:verifier,identityVerified:false,standardDomainFieldsMatch:matches}),evidence('signature_domain','unknown','Domain hash unavailable','No on-chain domain hash.','rpc')]);
}
function output(text:string){
 return {...finitePermitOutput(40),summary:'Review the observed conditional permission.',missing_data:[],suggested_action:'Review the spender and the exact permission before signing.',
  dimensions:AI_DIMENSIONS.map(dimension=>({dimension,assessment:dimension==='authority'?'review':'unknown',reason:dimension==='authority'?'A spending permission is requested.':'This dimension remains unverified.',evidence_ids:dimension==='authority'?['operation']:['signature_domain']})),
  reasons:[{text,evidence_ids:['signature_protocol']}]
 };
}

test('Permit2 reference domain-field mismatch is distinct from on-chain domain hash verification',()=>{
 for(const text of ['The standard domain fields do not match the reference format.','The reference comparison reports address and domain-field mismatches.'])assert.equal(validateAI(output(text),report(),'test').score,40);
 assert.equal(validateAI(output('The standard domain fields match the reference format.'),report(true),'test').score,40);
});

test('a Permit2 reference claim needs the exact request-bound comparison and direction',()=>{
 const text='The standard domain fields do not match the reference format.';
 for(const mutate of [(r:any)=>{r.checks.find((c:any)=>c.id==='signature_protocol').data.standardDomainFieldsMatch=true;},(r:any)=>{r.checks.find((c:any)=>c.id==='signature_protocol').data.chainId=1;},(r:any)=>{r.checks.find((c:any)=>c.id==='signature_protocol').data.verifyingContract=spender;},(r:any)=>{r.checks.find((c:any)=>c.id==='signature_protocol').source='rpc';},(r:any)=>{r.checks.find((c:any)=>c.id==='signature_protocol').status='unknown';}]){
  const r=report();mutate(r);assert.throws(()=>validateAI(output(text),r,'test'),/Unsupported signature verification claim/);
 }
 assert.throws(()=>validateAI(output('The standard domain fields match the reference format.'),report(),'test'),/Unsupported signature verification claim/);
 const uncited=output(text);uncited.reasons[0].evidence_ids=['operation'];assert.throws(()=>validateAI(uncited,report(),'test'),/Unsupported signature verification claim/);
});

test('reference wording cannot exempt a different hash, nonce or unqualified domain claim',()=>{
 for(const text of [
  'The standard domain fields do not match the reference format; the domain separator is verified.',
  'The reference domain fields mismatch but the nonce is verified.',
  'The reference comparison exists; the domain is valid.',
  'The domain separator does not match the reference.',
 ])assert.throws(()=>validateAI(output(text),report(),'test'),/Unsupported signature verification claim/,text);
});
