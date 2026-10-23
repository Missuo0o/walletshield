import test from 'node:test';
import assert from 'node:assert/strict';
import {FACT_LIMITS,FACT_SCHEMA_VERSION,modelFactCandidates,validateModelFacts} from '../src/security/model-facts.js';
import {evidencePacket,scoreWithAI,validateAI} from '../src/security/ai.js';
import {evidence} from '../src/security/evidence.js';
import {finitePermitOutput,finitePermitReport,structuredModelOutput} from './fixtures/model.js';
import {assess} from '../src/security/rules.js';
import {abstentionFixture} from '../src/evaluation/ai-evaluation.js';
import {forkProtocolEvidence,type ForkProtocolState} from '../src/security/fork-protocol-state.js';

test('real fork protocol facts bind shares and underlying units separately even when owner subjects are present',()=>{
 const report=finitePermitReport(),owner='0x2222222222222222222222222222222222222222',vault='0x4444444444444444444444444444444444444444',asset='0x5555555555555555555555555555555555555555';
 report.operation.category='vault';report.operation.fields.action='deposit';
 const state:ForkProtocolState={category:'vault',phase:'before',target:vault,asset,subjects:{caller:owner,owner,receiver:owner},snapshot:{chainId:1,blockNumber:'123',blockHash:`0x${'a'.repeat(64)}`},missing:[],values:{totalAssetsRaw:'1000',totalSharesRaw:'800',ownerSharesRaw:'20',receiverSharesRaw:'20',maxOwnerWithdrawRaw:'25',maxOwnerRedeemRaw:'20',shareDecimals:'18',underlyingDecimals:'6',callerUnderlyingRaw:'500',receiverUnderlyingRaw:'500',callerUnderlyingAllowanceToVaultRaw:'100',requestPreviewRaw:'80'}};
 report.checks.push(...forkProtocolEvidence(state,null));
 const fact=(field:string)=>modelFactCandidates(report).candidates.find(item=>item.fact.evidence_id==='fork_vault_before'&&item.fact.field===`data.values.${field}`)!.fact;
 for(const field of ['totalSharesRaw','ownerSharesRaw','receiverSharesRaw','maxOwnerRedeemRaw','shareDecimals','requestPreviewRaw'])assert.deepEqual(fact(field).subject,{role:'asset',value:vault},field);
 for(const field of ['totalAssetsRaw','maxOwnerWithdrawRaw','underlyingDecimals','callerUnderlyingRaw','receiverUnderlyingRaw','callerUnderlyingAllowanceToVaultRaw'])assert.deepEqual(fact(field).subject,{role:'asset',value:asset},field);
 for(const action of ['deposit','withdraw','mint','redeem']){
  report.operation.fields.action=action;
  assert.deepEqual(fact('requestPreviewRaw').subject,{role:'asset',value:['deposit','withdraw'].includes(action)?vault:asset},`preview${action}`);
 }
 report.operation.fields.action='unrecognized';assert.deepEqual(fact('requestPreviewRaw').subject,{role:'evidence',value:'fork_vault_before'});
 const after:ForkProtocolState={...structuredClone(state),phase:'after',values:{...state.values,totalAssetsRaw:'1100',totalSharesRaw:'880',ownerSharesRaw:'100',callerUnderlyingRaw:'400'}};
 const changes={...report,checks:forkProtocolEvidence(state,after)};
 const changeFact=(name:string)=>modelFactCandidates(changes).candidates.find(item=>item.fact.evidence_id==='fork_vault_change'&&item.fact.field===`data.differences.${name}`)!.fact;
 assert.deepEqual(changeFact('ownerSharesRaw').subject,{role:'asset',value:vault});assert.deepEqual(changeFact('callerUnderlyingRaw').subject,{role:'asset',value:asset});
 report.checks.find(check=>check.id==='fork_vault_before')!.data!.asset=undefined;
 assert.deepEqual(fact('callerUnderlyingRaw').subject,{role:'evidence',value:'fork_vault_before'},'An absent underlying address must not be replaced by the wallet owner or the share token');
});

test('fork lending base values retain their account subject rather than becoming token quantities',()=>{
 const report=finitePermitReport(),owner='0x2222222222222222222222222222222222222222',asset='0x5555555555555555555555555555555555555555';
 const state:ForkProtocolState={category:'lending',phase:'after',target:'0x4444444444444444444444444444444444444444',asset,subjects:{caller:owner,owner,receiver:owner},snapshot:{chainId:1,blockNumber:'123'},missing:[],values:{totalCollateralBaseRaw:'100',totalDebtBaseRaw:'50',availableBorrowsBaseRaw:'20',currentLiquidationThresholdRaw:'8000',ltvRaw:'7500',healthFactor1e18:'1600000000000000000',callerUnderlyingRaw:'500'}};
 report.checks.push(...forkProtocolEvidence(null,state));
 const facts=modelFactCandidates(report).candidates.filter(item=>item.fact.evidence_id==='fork_lending_after');
 for(const name of ['totalCollateralBaseRaw','totalDebtBaseRaw','healthFactor1e18','currentLiquidationThresholdRaw','ltvRaw'])assert.deepEqual(facts.find(item=>item.fact.field===`data.values.${name}`)!.fact.subject,{role:'account',value:owner},name);
 assert.deepEqual(facts.find(item=>item.fact.field==='data.values.callerUnderlyingRaw')!.fact.subject,{role:'asset',value:asset});
});

test('structured observations bind subject, field, scalar value, chain, block, hash, source, time and scope exactly',()=>{
 const report=finitePermitReport(),value=structuredModelOutput(finitePermitOutput(27),report);
 const accepted=validateAI(value,report,'fixture',{requireStructuredFacts:true});assert.equal(accepted.score,27);assert.equal(accepted.fact_schema_version,FACT_SCHEMA_VERSION);assert.deepEqual(accepted.facts,value.facts);
 const candidate=modelFactCandidates(report).candidates.find(item=>item.fact.evidence_id==='token_identity'&&item.fact.field==='data.balance')!;
 assert.equal(candidate.fact.subject.role,'token');assert.equal(candidate.fact.subject.value,report.operation.token!.toLowerCase());assert.equal(candidate.fact.value,'5000000000');assert.equal(candidate.fact.provenance.source,'rpc');assert.equal(candidate.fact.provenance.chain_id,null,'A missing observation chain ID is not silently inferred from the request');
 const mutated:((v:typeof value)=>void)[]=[v=>v.facts[0].subject.value='invented',v=>v.facts[0].field='data.invented',v=>v.facts[0].value='invented',v=>v.facts[0].provenance.chain_id=42161,v=>v.facts[0].provenance.block_number='999',v=>v.facts[0].provenance.block_hash=`0x${'f'.repeat(64)}`,v=>v.facts[0].provenance.source='forged',v=>v.facts[0].provenance.observed_at='2026-01-01T00:00:00.000Z',v=>v.facts[0].scope='isolated-fork'];
 for(const mutate of mutated){const forged=structuredClone(value);mutate(forged);assert.throws(()=>validateAI(forged,report,'fixture',{requireStructuredFacts:true}),/Structured fact does not match observation/);}
});

test('legacy historical output remains readable while current Muse responses require the fact schema',async()=>{
 const report=finitePermitReport(),legacy=finitePermitOutput(27);assert.equal(validateAI(legacy,report,'historical').score,27);
 assert.throws(()=>validateAI(legacy,report,'current',{requireStructuredFacts:true}),/Structured facts required/);
 const state=await scoreWithAI(report,{apiKey:'synthetic',model:'muse-wonder-1.0',aiEnabled:true,lookups:false,goPlusToken:'',rpc:{}},async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(legacy)}]}]})));
 assert.equal(state.status,'failed');assert.equal(state.result,undefined);assert.equal(report.score,null);
});

test('fact citations must be selected, unique, tied to the same evidence and semantically relevant to the rated dimension',()=>{
 const report=finitePermitReport(),value=structuredModelOutput(finitePermitOutput(27),report);
 const duplicate=structuredClone(value);duplicate.facts.push(structuredClone(duplicate.facts[0]));assert.throws(()=>validateAI(duplicate,report,'fixture'),/Ambiguous structured facts/);
 const forged=structuredClone(value);forged.reasons[0].fact_ids=['fact_000000000000000000000000'];assert.throws(()=>validateAI(forged,report,'fixture'),/Structured fact citation mismatch/);
 const wrongEvidence=structuredClone(value);wrongEvidence.reasons[0].evidence_ids=['operation'];const balance=modelFactCandidates(report).candidates.find(item=>item.fact.field==='data.balance')!.fact;wrongEvidence.facts.push(balance);wrongEvidence.reasons[0].fact_ids=[balance.id];assert.throws(()=>validateAI(wrongEvidence,report,'fixture'),/Structured fact citation mismatch/);
 const status=modelFactCandidates(report).candidates.find(item=>item.fact.evidence_id==='operation'&&item.fact.field==='status')!.fact;
 const irrelevant=structuredClone(value);irrelevant.facts.push(status);irrelevant.dimensions[0].fact_ids=[status.id];assert.throws(()=>validateAI(irrelevant,report,'fixture'),/Structured dimension lacks relevant fact/);
 const ungrounded=structuredClone(value);ungrounded.reasons[0].fact_ids=[];assert.throws(()=>validateAI(ungrounded,report,'fixture'),/Structured reason lacks observation/);
});

test('a current reason about an unknown observation needs its exact status fact while historical unstructured reasons remain readable',()=>{
 const report=finitePermitReport(),legacy=finitePermitOutput(27),structured=structuredModelOutput(legacy,report);
 const value={...structured,reasons:structured.reasons.map(reason=>({...reason,fact_ids:[...reason.fact_ids]}))};
 const missing=modelFactCandidates(report).candidates.find(item=>item.fact.evidence_id==='address_reputation'&&item.fact.field==='status')!.fact;
 value.reasons.push({text:'Address reputation was not observed, so spender identity remains unverified.',evidence_ids:['address_reputation'],fact_ids:[]});
 assert.throws(()=>validateAI(value,report,'fixture',{requireStructuredFacts:true}),/Structured reason lacks observation/);
 value.facts.push(missing);value.reasons.at(-1)!.fact_ids=[missing.id];
 assert.equal(validateAI(value,report,'fixture',{requireStructuredFacts:true}).score,27);
 legacy.reasons.push({text:'Historical missing observation explanation.',evidence_ids:['address_reputation']});
 assert.equal(validateAI(legacy,report,'historical').score,27);
});

test('typed candidates exclude personal messages, metadata injections, signatures and raw calldata',()=>{
 const report=finitePermitReport(),secret='SYNTHETIC_SECRET_DO_NOT_TRANSMIT';report.operation.fields.preview=secret;report.operation.fields.statement=secret;
 report.checks.find(check=>check.id==='token_identity')!.data={...report.checks.find(check=>check.id==='token_identity')!.data,symbol:secret,name:secret,signature:secret,calldata:secret,sourceCode:secret};
 const candidates=JSON.stringify(modelFactCandidates(report));assert.ok(!candidates.includes(secret));assert.ok(candidates.includes('5000000000'));
 assert.equal(evidencePacket(report).structured_fact_candidates.version,FACT_SCHEMA_VERSION);
});

test('candidate extraction is bounded and its omitted inventory is explicit rather than complete coverage',()=>{
 const report=finitePermitReport();report.checks=[];
 for(let index=0;index<300;index++)report.checks.push(evidence(`asset_identity_${index}`,'pass','Synthetic bounded data','No network','rpc',{token:report.operation.token,balance:'1',decimals:6,amounts:Array.from({length:100},()=> '1')}));
 const packet=modelFactCandidates(report);assert.equal(packet.candidates.length,FACT_LIMITS.candidates);assert.ok(packet.scope.omitted>0);assert.equal(packet.scope.full_report,false);
});

test('retired deployment and price records have no admissible dimensions; source, order and fork facts retain provenance',()=>{
 const report=finitePermitReport(),address=report.operation.token!,snapshot={chainId:1,blockNumber:'123',blockHash:`0x${'a'.repeat(64)}`};
 report.checks.push(
  evidence('registry_deployment_0','pass','Maintained binding','Not official safety','rpc',{...snapshot,address,matched:true,protocol:'fixture',safetyCertified:false}),
  evidence('registry_source_0','pass','Source match','Not audit','sourcify',{chainId:1,address,runtimeMatch:'exact_match'}),
  evidence('price_reference_0','pass','Reference price','Not loss','rpc',{...snapshot,asset:address,priceRaw:'123000000',priceDecimals:8,currency:'USD',referenceOnly:true}),
  evidence('order_structure','warning','Committed order','No fulfillment','eip712',{verifyingContract:address,offer:[{itemType:1,token:address,identifierOrCriteria:'0',startAmount:'100',endAmount:'100'},{itemType:0,token:`0x${'0'.repeat(40)}`,identifierOrCriteria:'0',startAmount:'1000000000000000000',endAmount:'1000000000000000000'}]}),
  evidence('fork_vault_after','pass','Fork state','Not upstream execution','isolated-fork',{...snapshot,target:address,asset:'0x3333333333333333333333333333333333333333',values:{ownerSharesRaw:'123',callerUnderlyingRaw:'456',shareDecimals:'18',underlyingDecimals:'6'},simulationOnly:true})
 );
 const candidates=modelFactCandidates(report).candidates;
 assert.deepEqual(candidates.find(item=>item.fact.evidence_id==='registry_deployment_0'&&item.fact.field==='data.matched')!.admissible_dimensions,[]);
 assert.deepEqual(candidates.find(item=>item.fact.evidence_id==='price_reference_0'&&item.fact.field==='data.priceRaw')!.admissible_dimensions,[]);
 const offered=candidates.find(item=>item.fact.field==='data.offer[0].startAmount')!;assert.equal(offered.fact.subject.value,address);assert.equal(offered.fact.value,'100');
 const native=candidates.find(item=>item.fact.field==='data.offer[1].startAmount')!;assert.deepEqual(native.fact.subject,{role:'asset',value:'native'});assert.equal(native.fact.value,'1000000000000000000','Native order units stay raw wei, never a token ID or USD value');
 const shares=candidates.find(item=>item.fact.field==='data.values.ownerSharesRaw')!,underlying=candidates.find(item=>item.fact.field==='data.values.callerUnderlyingRaw')!;
 assert.equal(shares.fact.subject.value,address);assert.equal(underlying.fact.subject.value,'0x3333333333333333333333333333333333333333');assert.equal(shares.fact.scope,'isolated-fork');
 const forged=structuredModelOutput(finitePermitOutput(27),report);forged.summary='The USD loss is zero and the protocol is official.';assert.throws(()=>validateAI(forged,report,'fixture'),/Unsupported certainty claim/);
});

test('UserOperation nonce claims require their exact keyed comparison and cannot borrow a Permit check',()=>{
 const report=assess({kind:'user_operation',chainId:31337,method:'eth_sendUserOperation',params:{}},[evidence('userop_nonce','pass','Keyed nonce','Synthetic fixture','rpc',{requestedNonce:'5',currentNonce:'5',matches:true})]);
 const proposal=(text:string,id='userop_nonce')=>{const value=abstentionFixture(report);value.reasons=[{text,evidence_ids:[id],fact_ids:[]}];return structuredModelOutput(value,report);};
 assert.equal(validateAI(proposal('The EntryPoint keyed nonce matches.'),report,'fixture',{requireStructuredFacts:true}).score,null);
 const check=report.checks.find(check=>check.id==='userop_nonce')!;check.data!.currentNonce='6';check.data!.matches=false;check.status='warning';
 assert.equal(validateAI(proposal('The EntryPoint keyed nonce does not match.'),report,'fixture').score,null);
 assert.throws(()=>validateAI(proposal('The EntryPoint keyed nonce matches.'),report,'fixture'),/Unsupported signature verification claim/);
 check.data!.matches=true;assert.throws(()=>validateAI(proposal('The EntryPoint keyed nonce matches.'),report,'fixture'),/Unsupported signature verification claim/);
 report.checks.push(evidence('signature_nonce','pass','Unrelated Permit nonce','Synthetic fixture','rpc',{nonce:'5',declaredNonce:'5'}));
 assert.throws(()=>validateAI(proposal('The EntryPoint keyed nonce matches.','signature_nonce'),report,'fixture'),/Unsupported signature verification claim/);
});

test('7702 nonce comparisons preserve tuple indexes, complete-list coverage and conditional snapshot scope',()=>{
 const report=assess({kind:'transaction',chainId:31337,transaction:{from:'0x2222222222222222222222222222222222222222',to:'0x3333333333333333333333333333333333333333',data:'0x',type:'0x4',authorizationList:[0,1].map(()=>({chainId:'0x7a69',address:'0x1111111111111111111111111111111111111111',nonce:'0x0',yParity:'0x0',r:'0x1',s:'0x1'}))}},[evidence('delegation_state_0','pass','Conditional tuple nonce','Synthetic fixture','rpc',{requestedNonce:'0',expectedNonceAtThisTuple:'0',tupleEligibleAtSnapshot:true})]);
 const proposal=(text:string,ids=['delegation_state_0'])=>{const value=abstentionFixture(report);value.reasons=[{text,evidence_ids:ids,fact_ids:[]}];return structuredModelOutput(value,report);};
 assert.equal(validateAI(proposal('Delegation tuple index 0 nonce matches.'),report,'fixture').score,null);
 assert.throws(()=>validateAI(proposal('All delegation tuple nonces match.'),report,'fixture'),/Unsupported signature verification claim/);
 assert.throws(()=>validateAI(proposal('Delegation tuple index 1 nonce matches.'),report,'fixture'),/Unsupported signature verification claim/);
 report.checks.push(evidence('delegation_state_1','warning','Conditional tuple mismatch','Synthetic fixture','rpc',{requestedNonce:'0',expectedNonceAtThisTuple:'1',tupleEligibleAtSnapshot:false}));
 assert.equal(validateAI(proposal('Delegation tuple index 1 nonce does not match.',['delegation_state_1']),report,'fixture').score,null);
 assert.throws(()=>validateAI(proposal('All delegation tuple nonces match.',['delegation_state_0','delegation_state_1']),report,'fixture'),/Unsupported signature verification claim/);
 const candidate=modelFactCandidates(report).candidates.find(item=>item.fact.field==='data.expectedNonceAtThisTuple')!;assert.ok(candidate.admissible_dimensions.includes('authority'));assert.equal(candidate.fact.scope,'reported-observation');
});

test('order information-domain comparisons require their observed comparison and do not substitute for a generic domain claim',()=>{
 const report=finitePermitReport();report.operation.category='order_signature';report.checks.find(check=>check.id==='signature_domain')!.status='unknown';
 report.checks.push(evidence('order_deployment','pass','Order information comparison','Synthetic bounded observation','rpc',{runtimeVersion:'1.6',signedDomainMatchesInformation:true,deploymentMatched:true}));
 const proposal=(text:string,ids=['order_deployment'])=>{const value=abstentionFixture(report);value.reasons=[{text,evidence_ids:ids,fact_ids:[]}];return structuredModelOutput(value,report);};
 assert.equal(validateAI(proposal('The information() order domain matches.'),report,'fixture').score,null);
 assert.throws(()=>validateAI(proposal('The domain is verified.'),report,'fixture'),/Unsupported signature verification claim/);
 assert.throws(()=>validateAI(proposal('The information() order domain matches.',['operation']),report,'fixture'),/Unsupported signature verification claim/);
 const check=report.checks.find(check=>check.id==='order_deployment')!;check.status='unknown';check.data!.signedDomainMatchesInformation=false;
 assert.equal(validateAI(proposal('The information() order domain does not match.'),report,'fixture').score,null);
 check.data!.runtimeVersion=null;assert.throws(()=>validateAI(proposal('The information() order domain does not match.'),report,'fixture'),/Unsupported signature verification claim/);
});


test('Seaport order nonce comparisons require the bound exact order counter rather than a Permit nonce',()=>{
 const report=finitePermitReport();report.operation.category='order_signature';
 report.checks.push(evidence('order_counter','pass','Order counter observed','Synthetic bounded comparison','rpc',{deploymentMatched:true,nonce:'7',declaredNonce:'7',matches:true}));
 const proposal=(text:string,ids=['order_counter'])=>{const value=abstentionFixture(report);value.reasons=[{text,evidence_ids:ids,fact_ids:[]}];return structuredModelOutput(value,report);};
 assert.equal(validateAI(proposal('The order nonce matches at this block.'),report,'fixture').score,null);
 assert.equal(validateAI(proposal('订单 nonce 匹配。'),report,'fixture').score,null);
 assert.throws(()=>validateAI(proposal('The order nonce matches.',['signature_nonce']),report,'fixture'),/Unsupported signature verification claim/);
 const check=report.checks.find(item=>item.id==='order_counter')!;check.status='warning';check.data!.nonce='8';check.data!.matches=false;
 assert.equal(validateAI(proposal('The order nonce does not match.'),report,'fixture').score,null);
 assert.throws(()=>validateAI(proposal('The order nonce matches.'),report,'fixture'),/Unsupported signature verification claim/);
 check.data!.deploymentMatched=false;assert.throws(()=>validateAI(proposal('The order nonce does not match.'),report,'fixture'),/Unsupported signature verification claim/);
 check.data!.deploymentMatched=true;check.status='unknown';assert.throws(()=>validateAI(proposal('The order nonce does not match.'),report,'fixture'),/Unsupported signature verification claim/);
});
