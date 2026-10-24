import test from 'node:test';
import assert from 'node:assert/strict';
import {assess} from '../src/security/rules.js';
import {evidence} from '../src/security/evidence.js';
import {modelFactCandidates,FACT_SCHEMA_VERSION,type ModelFact} from '../src/security/model-facts.js';
import {AI_DIMENSIONS,type SecurityRequest,type SecurityReport} from '../src/security/types.js';
import {evidencePacket,resolveModelSelection,validateAI} from '../src/security/ai.js';
import {SCORING_POLICY} from '../src/security/scoring-policy.js';
const sender='0x2222222222222222222222222222222222222222',recipient='0x3333333333333333333333333333333333333333',hash=`0x${'1'.repeat(64)}`;
function chainReport(kind:'transaction'|'signature'='transaction'){
 const request:SecurityRequest=kind==='transaction'?{kind:'transaction',chainId:31337,transaction:{from:sender,to:recipient,data:'0x',value:'0x1'}}:{kind:'signature',chainId:31337,signature:{from:sender,method:'personal_sign',data:'Inspect this unsigned local test message.'}};
 return assess(request,[evidence('chain_context','pass','Chain state observed','Synthetic local observation; the balance was read for the sender, target is separate.','rpc',{chainId:31337,blockNumber:'1',blockHash:hash,blockTimestampSeconds:String(Math.floor(Date.now()/1000)),target:recipient,targetHasCode:false,nativeBalanceWei:'1000000000000000000'})]);
}
function proposal(fact:ModelFact,dimension:'exposure'|'execution'|'identity'='exposure'){
 return {response_schema_version:'walletshield-selection-v1',selected_fact_ids:[fact.id],score:49,assessment:'review',evidence_confidence:'limited',summary:'One bounded request observation was selected; unresolved checks remain visible.',reasons:[{text:'The selected field was returned by this observation.',evidence_ids:[fact.evidence_id],fact_ids:[fact.id]}],missing_data:[],suggested_action:'Inspect the request and every missing check.',honeypot:'unknown',dimensions:AI_DIMENSIONS.map(name=>({dimension:name,assessment:name===dimension?'review':'unknown',reason:'Only the selected bounded field is used for this dimension.',evidence_ids:[fact.evidence_id],fact_ids:name===dimension?[fact.id]:[]}))};
}
function strict(value:unknown,report:SecurityReport){return validateAI(resolveModelSelection(value,report),report,'synthetic-review',{requireStructuredFacts:true});}

test('native chain-context balances retain the request sender or signer as owner, never the target recipient',()=>{
 for(const kind of ['transaction','signature'] as const){
  const report=chainReport(kind),fact=modelFactCandidates(report).candidates.find(c=>c.fact.evidence_id==='chain_context'&&c.fact.field==='data.nativeBalanceWei')!;
  assert.deepEqual(fact.fact.subject,{role:'account',value:sender});assert.notEqual(fact.fact.subject.value,recipient);assert.deepEqual(fact.admissible_dimensions,['exposure']);
  const accepted=strict(proposal(fact.fact),report);assert.equal(accepted.score,49);assert.deepEqual(accepted.facts?.[0].subject,{role:'account',value:sender});
  const oldSubject={...fact.fact,subject:{role:'target' as const,value:recipient}};
  const resolved=resolveModelSelection(proposal(fact.fact),report) as ReturnType<typeof proposal>&{fact_schema_version:typeof FACT_SCHEMA_VERSION;facts:ModelFact[]};resolved.facts=[oldSubject];
  assert.throws(()=>validateAI(resolved,report,'synthetic-review',{requireStructuredFacts:true}),/Structured fact does not match observation/);
 }
});

test('chain-context facts have field-specific dimensions and network or target metadata cannot anchor a financial score',()=>{
 const report=chainReport(),candidates=modelFactCandidates(report).candidates.filter(c=>c.fact.evidence_id==='chain_context');
 const chain=candidates.find(c=>c.fact.field==='data.chainId')!,target=candidates.find(c=>c.fact.field==='data.target')!,code=candidates.find(c=>c.fact.field==='data.targetHasCode')!;
 assert.deepEqual(chain.admissible_dimensions,[]);assert.deepEqual(target.admissible_dimensions,[]);assert.deepEqual(code.admissible_dimensions,['execution']);
 for(const metadata of [chain,target,code])for(const dimension of ['exposure','identity'] as const){
  for(const assessment of ['low','review','high']){const value=proposal(metadata.fact,dimension);value.dimensions.find(d=>d.dimension===dimension)!.assessment=assessment;
   assert.throws(()=>strict(value,report),/Structured dimension lacks relevant fact|Identity risk requires/,`${metadata.fact.field}/${dimension}/${assessment}`);
  }
 }
 assert.equal(strict(proposal(code.fact,'execution'),report).score,49,'Code presence remains a bounded execution observation, never identity or financial exposure.');
});

test('collector-level exposure cannot leak through code hashes, network IDs, addresses, NFT IDs or unit metadata',()=>{
 const report=chainReport();report.checks.push(evidence('signature_exposure','pass','Conditional token quantity','Synthetic raw quantity, not a dollar estimate.','rpc',{chainId:31337,token:recipient,owner:sender,decimals:6,balanceRaw:'100',codeHash:hash,implementationCodeHash:hash,signingHash:hash,domainHash:hash,hasCode:true,tokenId:'7'}));
 const candidates=modelFactCandidates(report).candidates.filter(c=>c.fact.evidence_id==='signature_exposure');
 for(const name of ['chainId','token','owner','decimals','codeHash','implementationCodeHash','signingHash','domainHash','hasCode','tokenId']){
  const candidate=candidates.find(c=>c.fact.field===`data.${name}`);if(!candidate)continue;
  assert.ok(!candidate.admissible_dimensions.includes('exposure'),name);
  assert.throws(()=>strict(proposal(candidate.fact),report),/Structured dimension lacks relevant fact/,name);
 }
 const amount=candidates.find(c=>c.fact.field==='data.balanceRaw')!;assert.deepEqual(amount.admissible_dimensions,['exposure']);assert.equal(strict(proposal(amount.fact),report).score,49);
 report.checks.push(evidence('order_asset_0','pass','Observed NFT ownership','Synthetic current token owner, not merely a target address.','rpc',{token:recipient,tokenId:'7',currentOwner:sender,matches:true}));
 const owner=modelFactCandidates(report).candidates.find(c=>c.fact.evidence_id==='order_asset_0'&&c.fact.field==='data.currentOwner')!;
 assert.ok(owner.admissible_dimensions.includes('exposure'),'An actually observed NFT owner remains distinct from generic address metadata.');assert.equal(strict(proposal(owner.fact),report).score,49);
});

test('new validation records its server-owned scoring policy without rewriting the input or accepting a model-supplied version',()=>{
 const report=chainReport(),balance=modelFactCandidates(report).candidates.find(c=>c.fact.field==='data.nativeBalanceWei')!.fact,value=proposal(balance),before=structuredClone(value);
 const accepted=strict(value,report);assert.equal(accepted.scoringPolicy,SCORING_POLICY);assert.equal(evidencePacket(report).scoringPolicy,SCORING_POLICY);assert.deepEqual(value,before);assert.equal(report.ai.result,undefined);
 assert.throws(()=>strict({...value,scoringPolicy:'model-selected-policy'},report));
 const {response_schema_version,selected_fact_ids,...legacy}=structuredClone(value);const unstructured={...legacy,reasons:legacy.reasons.map(({fact_ids,...reason})=>reason),dimensions:legacy.dimensions.map(({fact_ids,...dimension})=>dimension)};
 assert.equal(validateAI(unstructured,report,'historical-inspection').scoringPolicy,undefined,'The compatibility path cannot advertise field-bound validation for an unstructured historical response.');
});
