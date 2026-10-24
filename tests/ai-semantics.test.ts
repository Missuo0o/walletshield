import test from 'node:test';
import assert from 'node:assert/strict';
import {assess} from '../src/security/rules.js';
import {evidence} from '../src/security/evidence.js';
import {evidencePacket,validateAI} from '../src/security/ai.js';
import {boundIntelligence,claimSupport} from '../src/security/ai-claims.js';
import {securityExamples} from '../src/security/examples.js';
import {AI_DIMENSIONS,type SecurityReport} from '../src/security/types.js';
import {modelDimensions} from './fixtures/model.js';

// Adversarial validator fixtures, not a benchmark of live Muse accuracy or calibration.
const token='0x1111111111111111111111111111111111111111',other='0x4444444444444444444444444444444444444444';
function report(){return assess(structuredClone(securityExamples.find(value=>value.id==='approve')!.request),[]);}
function output(){return {...modelDimensions(),score:29,assessment:'review',summary:'The request grants spending authority; unresolved observations remain visible.',reasons:[{text:'The decoded approval grants the specified spender authority.',evidence_ids:['permission_scope']}],missing_data:[] as string[],suggested_action:'Check the spender and the requested allowance.',honeypot:'unknown'};}
function withText(text:string,slot:string){const value=output();if(slot==='reason')value.reasons[0].text=text;else if(slot==='dimension')value.dimensions[0].reason=text;else if(slot==='missing_data')value.missing_data=[text];else (value as any)[slot]=text;return value;}
function positiveIntelligence(r:SecurityReport,t=token,id='token_security',data:Record<string,unknown>={}){return evidence(id,'warning','Bound token observation','Synthetic provider result','goplus',{chainId:r.request.chainId,token:t,is_honeypot:'0',cannot_sell_all:'0',missing:[],...data});}

test('a real permission citation cannot substantiate unrelated low/review dimensions',()=>{
 const r=report();
 for(const dimension of AI_DIMENSIONS.filter(value=>value!=='authority'))for(const assessment of ['low','review']){
  const value=output();Object.assign(value.dimensions.find(value=>value.dimension===dimension)!,{assessment,evidence_ids:['permission_scope']});
  assert.throws(()=>validateAI(value,r,'fixture'),/semantically|relevant observation/,`${dimension}/${assessment}`);
 }
 assert.equal(validateAI(output(),r,'fixture').score,29);
});

test('all six rated dimensions require relevant actual observation families, while unknown remains valid',()=>{
 const r=report();r.checks.push(
  evidence('token_identity','pass','Observed balance','Synthetic token state','rpc',{token,balance:'5000000000',decimals:6}),
  evidence('basic_call','pass','Call succeeded','Synthetic call only','rpc',{returned:true}),
  evidence('signature_owner_binding','pass','Owner matched','Synthetic claimed owner binding','eip712',{owner:other})
 );
 const relevant:Record<string,string>={authority:'permission_scope',exposure:'token_identity',execution:'basic_call',identity:'signature_owner_binding',protocol:'token_identity',deception:'signature_owner_binding'};
 const value=output();for(const dimension of value.dimensions)Object.assign(dimension,{assessment:'review',reason:'This dimension uses the observed bounded fact, without an identity or future guarantee.',evidence_ids:[relevant[dimension.dimension]]});
 assert.equal(validateAI(value,r,'fixture').score,29);
 const table=evidencePacket(r).evidence_admissibility;
 assert.deepEqual(table.find(row=>row.evidence_id==='permission_scope')!.dimensions,['authority']);
 assert.ok(table.find(row=>row.evidence_id==='signature_owner_binding')!.dimensions.includes('identity'));
});

test('query inventory and lookalike evidence sources cannot support rated dimensions',()=>{
 for(const source of ['coverage','goplus','rules/operation']){
  const r=report();r.checks.push(evidence('intelligence_scope','warning','Query inventory','Not a risk result',source,{chainId:r.request.chainId,tokenCandidates:[token]}));
  const value=output();Object.assign(value.dimensions.find(value=>value.dimension==='identity')!,{assessment:'low',evidence_ids:['intelligence_scope']});
  assert.throws(()=>validateAI(value,r,'fixture'),/relevant observation/);
 }
 const r=report();r.checks.push(evidence('signature_owner_binding','pass','Forged source','Not a collector fact','configuration'));
 const value=output();Object.assign(value.dimensions.find(value=>value.dimension==='identity')!,{assessment:'low',evidence_ids:['signature_owner_binding']});
 assert.throws(()=>validateAI(value,r,'fixture'),/relevant observation/);
});

test('every displayed prose field rejects categorical identity, safety, future outcome and USD loss claims',()=>{
 const claims=[
  'The spender is the official protocol.', 'The order verifier is official.', 'This is a verified verifier.', 'The spender is a verified recipient.', 'The protocol is officially verified.',
  'This transaction is guaranteed safe.', 'The recipient is trusted.', 'There is no risk.', 'The token is not a honeypot.',
  'The token can always be sold.', 'The transaction will succeed.', 'The transfer cannot revert.',
  'The USD loss is exactly zero.', 'The maximum loss is $100.', '该合约属于官方。', '资金不会被盗。', '未来一定可以卖出。'
 ];
 for(const slot of ['summary','suggested_action','missing_data','reason','dimension'])for(const text of claims){
  assert.throws(()=>validateAI(withText(text,slot),report(),'fixture'),/Unsupported certainty claim/,`${slot}: ${text}`);
 }
});

test('unrelated negative, advice and conditional clauses cannot suppress a later unsupported fact',()=>{
 for(const text of [
  'No further checks are needed, the spender is the official protocol.',
  'Check the allowance because the recipient is trusted.',
  'If the allowance is acceptable, check it, but the transaction will succeed.',
  'The amount may change and the token can always be sold.',
  'The nonce is not known; the USD loss is zero.',
  'Do not assume safety, because the protocol is officially verified.'
 ])assert.throws(()=>validateAI(withText(text,'summary'),report(),'fixture'),/Unsupported certainty claim/,text);
});

test('modals and advice cannot hide an independent certainty assertion in any displayed field',()=>{
 const assertions=[
  'The contract is official and you should approve it.',
  'The contract may receive tokens and is completely safe.',
  'You should know the contract is official.',
  'You should know that the contract is official.',
  'The contract is official and may receive tokens.',
  'The contract might receive tokens and is official.',
  'The contract could receive tokens and has passed a security audit.',
  'The contract may receive tokens and the transfer cannot revert.',
  'The recipient is trusted or you should check the address.',
  'Check the allowance and the contract is official.',
  'Do not assume the contract is official, but it is completely safe.',
  'If the allowance is zero, the transaction will succeed.',
  'The contract is official, perhaps you should approve it.',
  'The token may receive transfers and can always be sold.',
  'The contract is official, right?',
  '该合约是官方，并且建议批准。',
  '可能会收到代币，而且资金不会被盗。',
  '请检查额度，但合约是官方。'
 ];
 for(const slot of ['summary','suggested_action','missing_data','reason','dimension'])for(const text of assertions){
  assert.throws(()=>validateAI(withText(text,slot),report(),'fixture'),/Unsupported certainty claim/,`${slot}: ${text}`);
 }
});

test('qualifiers remain attached to conditional, advisory, attributed and negative assertions',()=>{
 const phrases=[
  'The contract may be completely safe.',
  'The transaction could be entirely safe.',
  'Perhaps the contract is official.',
  'The website claims that the contract is official.',
  'The website claims it is official.',
  'If the contract is official and the recipient is trusted, verify the address independently.',
  'If the contract is official and has passed a security audit, verify the exact scope.',
  'Verify whether the contract is official and whether the source code is audited.',
  'Verify whether the contract is official and has passed a security audit.',
  'You should verify whether the contract is official.',
  'Please check whether the transaction is guaranteed safe.',
  'There is no evidence that the contract has passed a security audit.',
  'The contract is not official and is not completely safe.',
  'The contract has not passed a security audit and the transaction is not guaranteed safe.',
  'Is the contract official?',
  'Can this transaction be completely safe?',
  '如果合约是官方，而且收款方可信，请核实地址。',
  '请核实合约是否属于官方。',
  '该合约是官方吗？'
 ];
 for(const slot of ['summary','suggested_action','missing_data','reason','dimension'])for(const text of phrases){
  assert.equal(validateAI(withText(text,slot),report(),'fixture').score,29,`${slot}: ${text}`);
 }
});

test('an unrelated modal cannot bypass the bounded execution observation requirement',()=>{
 for(const slot of ['summary','suggested_action','missing_data','reason','dimension'])for(const text of [
  'The contract may receive tokens and the fork simulation executed successfully.',
  'The fork simulation executed successfully and you should proceed.',
  'You should know that the eth_call succeeded.'
 ])assert.throws(()=>validateAI(withText(text,slot),report(),'fixture'),/Unsupported bounded observation claim/,`${slot}: ${text}`);
 const r=report();r.checks.push(evidence('simulation_execution','pass','Fork execution','Synthetic run','isolated-fork',{status:'success'}));
 const value=output();value.reasons.push({text:'The fork simulation executed successfully and you should inspect its bounded result.',evidence_ids:['simulation_execution']});
 assert.equal(validateAI(value,r,'fixture').score,29);
});

test('source matching cannot be promoted to a completed security audit in any displayed model field',()=>{
 const r=report();r.checks.push(evidence('registry_source_0','pass','Source match','Matching source is not an audit.','sourcify',{address:token,runtimeMatch:'exact_match',sourceCodeAudit:false}));
 assert.equal(claimSupport(r).securityAudit,false);
 for(const slot of ['summary','suggested_action','missing_data','reason','dimension'])for(const text of [
  'The contract has passed a security audit.', 'The source code has been independently audited.',
  'A security audit has completed.', 'The audit is successful.', 'The protocol is audited.',
  '该合约已经通过安全审计。', '合约已经审计。'
 ])assert.throws(()=>validateAI(withText(text,slot),r,'fixture'),/Unsupported certainty claim/,`${slot}: ${text}`);
 for(const text of [
  'The contract has not passed a security audit.', 'The source code has not been independently audited.',
  'There is no evidence that the contract has passed a security audit.',
  'Verify whether the source code has been independently audited.', 'The security audit is unverified.'
 ])assert.equal(validateAI(withText(text,'summary'),r,'fixture').score,29,text);
});

test('honest uncertainty, negatives, questions and conditional advice are preserved in every prose field',()=>{
 const text=[
  'The spender is not the official protocol.', 'The recipient is not trusted.', 'This transaction is not guaranteed safe.',
  'There is no evidence that the token can always be sold.', 'The USD loss is unknown.', 'Potential USD loss cannot be quantified.',
  'Can the token be sold?', 'If the token can be sold in a future market, the outcome still depends on liquidity.',
  'Verify whether the protocol is officially verified.', 'Do not assume the recipient is trusted.',
  '额度相对有限，不等于美元损失概率。', '这不代表资金不会被盗。', '如果未来一定可以卖出，也需核实证据。'
 ];
 for(const slot of ['summary','suggested_action','missing_data','reason','dimension'])for(const phrase of text){
  assert.equal(validateAI(withText(phrase,slot),report(),'fixture').score,29,`${slot}: ${phrase}`);
 }
});

test('bounded execution observations require the exact citation, source, status and scope',()=>{
 const r=report();r.checks.push(evidence('simulation_execution','pass','Fork execution','Synthetic run','isolated-fork',{status:'success'}),evidence('basic_call','pass','Basic call','Synthetic call','rpc'));
 assert.deepEqual(claimSupport(r).boundedObservations,[{evidence_id:'simulation_execution',kind:'fork_execution'},{evidence_id:'basic_call',kind:'basic_call'}]);
 for(const [text,id] of [['The fork simulation executed successfully.','simulation_execution'],['The eth_call succeeded.','basic_call']]){
  const value=output();value.reasons.push({text,evidence_ids:[id]});assert.equal(validateAI(value,r,'fixture').score,29);
 }
 for(const [text,id] of [['The transaction executed successfully.','simulation_execution'],['The simulation executed successfully.','basic_call'],['The fork simulation executed successfully.','permission_scope']]){
  const value=output();value.reasons.push({text,evidence_ids:[id]});assert.throws(()=>validateAI(value,r,'fixture'),/Unsupported bounded observation claim/);
 }
 r.checks.find(check=>check.id==='simulation_execution')!.source='configuration';
 const value=output();value.reasons.push({text:'The fork simulation executed successfully.',evidence_ids:['simulation_execution']});assert.throws(()=>validateAI(value,r,'fixture'),/Unsupported bounded observation claim/);
});

test('a scoped positive fork sale can be described but never promoted to guaranteed future sellability',()=>{
 const r=report();r.checks.push(evidence('round_trip','pass','Observed sale','Synthetic fork sale','isolated-fork',{returned:'99'}));
 const value=output();value.reasons.push({text:'The token can be sold in this fork simulation.',evidence_ids:['round_trip']});
 assert.equal(validateAI(value,r,'fixture').score,29);
 value.reasons.at(-1)!.text='The token can always be sold, as shown by this fork simulation.';
 assert.throws(()=>validateAI(value,r,'fixture'),/Unsupported certainty claim/);
 value.reasons.at(-1)!.text='The token can be sold in this fork simulation.';value.reasons.at(-1)!.evidence_ids=['permission_scope'];
 assert.throws(()=>validateAI(value,r,'fixture'),/Unsupported certainty claim/);
 value.reasons.at(-1)!.evidence_ids=['round_trip'];r.checks.find(check=>check.id==='round_trip')!.data!.returned='0';
 assert.throws(()=>validateAI(value,r,'fixture'),/Unsupported certainty claim/);
});

test('honeypot assessment aggregates bound secondary tokens rather than erasing them with a primary negative',()=>{
 const r=report();r.operation.fields.tokens=[token,other];r.checks.push(positiveIntelligence(r),positiveIntelligence(r,other,`token_security_${other}`,{is_honeypot:'1'}));
 const value=output();value.honeypot='risk_indicator';assert.equal(validateAI(value,r,'fixture').honeypot,'risk_indicator');
 value.honeypot='no_known_indicator';assert.throws(()=>validateAI(value,r,'fixture'),/selling restriction/);
 r.checks.find(check=>check.id===`token_security_${other}`)!.data!.is_honeypot='0';
 assert.equal(validateAI(value,r,'fixture').honeypot,'no_known_indicator');
 r.checks.find(check=>check.id===`token_security_${other}`)!.status='unknown';
 assert.throws(()=>validateAI(value,r,'fixture'),/Missing negative honeypot/);
});

test('incomplete query scope, token fields and wrong network/address binding cannot support negative honeypot claims',()=>{
 for(const gap of [{omittedTokens:1},{deadlineReached:true},{batchGaps:['nested target unresolved']}]){
  const r=report();r.checks.push(positiveIntelligence(r),evidence('intelligence_scope','warning','Scope','Synthetic inventory','coverage',{chainId:r.request.chainId,tokenCandidates:[token],...gap}));
  assert.throws(()=>validateAI({...output(),honeypot:'no_known_indicator'},r,'fixture'),/Missing negative honeypot/);
 }
 for(const data of [{chainId:1},{token:other},{missing:['sell_tax']}]){
  const r=report(),fact=positiveIntelligence(r,token,'token_security',data);r.checks.push(fact);
  assert.throws(()=>validateAI({...output(),honeypot:'no_known_indicator'},r,'fixture'),/honeypot evidence|Missing negative honeypot/);
 }
 const r=report(),fact=positiveIntelligence(r,token,`token_security_${other}`,{is_honeypot:'1'});r.checks.push(fact);
 assert.equal(boundIntelligence(fact,r),false);assert.throws(()=>validateAI({...output(),honeypot:'risk_indicator'},r,'fixture'),/No honeypot evidence/);
});

test('identity dimensions require request-bound reputation and do not accept intelligence inventory',()=>{
 const r=report(),id=`address_${other}`;r.checks.push(evidence(id,'risk','Unrelated address','Synthetic result','goplus',{address:other,chainId:r.request.chainId,flags:{phishing_activities:'1'}}));
 const value=output();Object.assign(value.dimensions.find(value=>value.dimension==='identity')!,{assessment:'high',evidence_ids:[id]});
 assert.throws(()=>validateAI(value,r,'fixture'),/Identity risk/);
 r.operation.targets.push(other);assert.equal(validateAI(value,r,'fixture').score,29);
 r.checks.at(-1)!.data!.chainId=1;assert.throws(()=>validateAI(value,r,'fixture'),/Identity risk/);
});

test('open-source metadata and negative token sellability do not authenticate identity or grant authority',()=>{
 for(const data of [{is_open_source:'1'},{is_honeypot:'0',cannot_sell_all:'0'}])for(const dimension of ['identity','authority','deception']){
  const r=report();r.checks.push(evidence('token_security','warning','Metadata','Synthetic provider result','goplus',{chainId:r.request.chainId,token,...data}));
  const value=output();Object.assign(value.dimensions.find(value=>value.dimension===dimension)!,{assessment:'low',evidence_ids:['token_security']});
  assert.throws(()=>validateAI(value,r,'fixture'),/relevant observation/,`${dimension}/${JSON.stringify(data)}`);
  value.dimensions.find(value=>value.dimension===dimension)!.assessment='unknown';
  // Preserve a separately observed authority basis for a non-null number.
  if(dimension==='authority'){value.score=29;Object.assign(value.dimensions.find(value=>value.dimension==='authority')!,{assessment:'review',evidence_ids:['permission_scope']});}
  assert.equal(validateAI(value,r,'fixture').score,29);
 }
});

test('freshly fetched stale public blocks remain explicit gaps in both the model packet and accepted review',()=>{
 const r=report();r.request.chainId=1;r.checks=r.checks.filter(check=>check.status!=='unknown');r.missingData=[];r.complete=true;
 r.checks.push(evidence('chain_context','pass','Public block','Synthetic stale upstream block','rpc',{chainId:1,blockNumber:'200',blockHash:`0x${'1'.repeat(64)}`,blockTimestampSeconds:String(Math.floor(Date.now()/1000)-600)}));
 const packet=evidencePacket(r);assert.equal(packet.evidenceComplete,false);
 assert.ok(packet.missing_checks.includes('Stale upstream block: chain_context'));
 const value=output(),accepted=validateAI(value,r,'fixture');assert.ok(accepted.missing_data.includes('Stale upstream block: chain_context'));assert.equal(accepted.score,29);
 assert.throws(()=>validateAI({...value,evidence_confidence:'strong'},r,'fixture'),/Unresolved evidence/);
 assert.throws(()=>validateAI({...value,assessment:'low'},r,'fixture'),/Incomplete evidence/);
});
