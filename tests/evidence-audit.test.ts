import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,parseAbi,maxUint256,stringToHex} from 'viem';
import {assess} from '../src/security/rules.js';
import {decodeRequest} from '../src/security/decode.js';
import {evidencePacket,validateAI} from '../src/security/ai.js';
import {simulateRequest} from '../src/security/simulation.js';
import {evidence} from '../src/security/evidence.js';
import {securityExamples,demoEvidence} from '../src/security/examples.js';
import {finitePermitOutput,finitePermitReport,modelDimensions} from './fixtures/model.js';
import {comparableRequest,newLabSession} from '../src/testing/sessions.js';
import {buildApp} from '../src/server/app.js';
import {createStore} from '../src/server/store.js';
import type {SecurityRequest} from '../src/security/types.js';
const example=(id:string)=>structuredClone(securityExamples.find(e=>e.id===id)!.request);
const config={apiKey:'',model:'muse-wonder-1.0',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{},snapToken:'a'.repeat(64)};
test('long personal messages explicitly retain truncation and cannot be presented as fully read',()=>{
 const req:SecurityRequest={kind:'signature',chainId:0,signature:{from:'0x'+'1'.repeat(40),method:'personal_sign',data:stringToHex('x'.repeat(1700)+'hidden permission')}};
 const report=assess(req,[]);assert.equal(report.operation.fields.previewTruncated,true);assert.equal(report.operation.fields.messageCharacters,'1717');assert.ok(report.checks.some(c=>c.id==='extraction_limit'&&c.status==='unknown'));
});
test('Permit / Permit2 extraction preserves raw amounts, unlimited scope and each batch nonce',()=>{
 const permit=example('permit') as Extract<SecurityRequest,{kind:'signature'}>;(permit.signature.data as any).message.value=maxUint256.toString();assert.equal(decodeRequest(permit).fields.unlimited,true);
 const permit2=example('permit2') as Extract<SecurityRequest,{kind:'signature'}>;const t=permit2.signature.data as any;t.primaryType='PermitBatch';t.types.PermitBatch=[{name:'details',type:'PermitDetails[]'},{name:'spender',type:'address'},{name:'sigDeadline',type:'uint256'}];t.message.details=[{token:'0x'+'1'.repeat(40),amount:String(2n**160n-1n),expiration:'2000000000',nonce:'3'},{token:'0x'+'2'.repeat(40),amount:'100',expiration:'2000000001',nonce:'7'}];
 const fields=decodeRequest(permit2).fields;assert.deepEqual(fields.nonces,['3','7']);assert.equal(fields.unlimited,true);assert.equal(fields.declaredAssetCount,'2');
});
test('invalid typed structure cannot leave a decoded-pass operation despite a Permit-like name',()=>{
 const report=assess(example('permit'),[evidence('typed_structure','unknown','bad structure','invalid types','eip712')]);assert.equal(report.operation.decoded,false);assert.ok(report.checks.some(c=>c.id==='operation'&&c.status==='unknown'));
});
test('special transaction fields do not silently execute a stripped substitute',async()=>{
 const req=example('native') as Extract<SecurityRequest,{kind:'transaction'}>;req.transaction.unsupportedFields=['authorizationList'];let fork=false;
 const facts=await simulateRequest(req,decodeRequest(req),config,async()=>{fork=true;throw Error('must not run');});assert.equal(fork,false);assert.equal(facts[0].status,'unknown');const report=assess(req,facts);assert.ok(report.checks.some(c=>c.id==='unsupported_transaction_fields'));assert.deepEqual(evidencePacket(report).unsupportedTransactionFields,['authorizationList']);
});
test('liquidity and vault fields name amounts and preserve shares vs underlying units',()=>{
 const address='0x1111111111111111111111111111111111111111';
 const abi=parseAbi(['function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)','function redeem(uint256,address,address)']);
 const req:Extract<SecurityRequest,{kind:'transaction'}>={kind:'transaction',chainId:31337,transaction:{from:address,to:address,data:encodeFunctionData({abi,functionName:'addLiquidity',args:[address,address,10n,20n,8n,15n,address,2000000000n]})}};
 const fields=decodeRequest(req).fields;assert.equal(fields.amountADesired,'10');assert.equal(fields.amountBMin,'15');req.transaction.data=encodeFunctionData({abi,functionName:'redeem',args:[10n,address,address]});assert.equal(decodeRequest(req).fields.amountKind,'shares_raw');
});
test('new AI output requires six distinct cited dimensions and explicit abstention without changing valid model numbers',()=>{
 const report=assess(example('approve'),demoEvidence());const valid={...modelDimensions(),score:17,assessment:'review',summary:'Evidence-bound test',reasons:[{text:'scope',evidence_ids:['permission_scope']}],missing_data:[],suggested_action:'verify',honeypot:'unknown'};
 assert.equal(validateAI(valid,report,'test').score,17);
 for(const bad of [{...valid,dimensions:valid.dimensions.slice(1)},{...valid,dimensions:valid.dimensions.map(d=>({...d,dimension:'authority'}))},{...valid,dimensions:valid.dimensions.map(d=>({...d,evidence_ids:['fabricated']}))},{...valid,evidence_confidence:'strong'},{...valid,score:null},{...valid,assessment:'unknown'},{...valid,dimensions:valid.dimensions.map(d=>d.dimension==='identity'?{...d,assessment:'high',evidence_ids:['operation']}:d)},{...valid,dimensions:valid.dimensions.map(d=>({...d,assessment:'unknown'}))}])assert.throws(()=>validateAI(bad,report,'test'));
 assert.equal(validateAI({...valid,score:null,assessment:'unknown'},report,'test').score,null);
});
test('AI packet preserves evidence provenance, observed units and summary coverage without raw signing material',()=>{
 const req=example('permit') as Extract<SecurityRequest,{kind:'signature'}>;
 (req.signature.data as any).message.signature='private-signature-value';
 const report=assess(req,demoEvidence(),'demo');const packet=evidencePacket(report);
 assert.equal(packet.createdAt,report.createdAt);assert.equal(packet.reportSource,'demo');assert.equal(packet.evidenceComplete,false);
 assert.match(packet.request_data_scope,/synthetic observations/);assert.match(packet.request_data_scope,/full RPC parameters/);
 assert.match(packet.quantity_conventions,/wei per gas/);assert.match(packet.quantity_conventions,/Nonces are counters/);assert.match(packet.quantity_conventions,/1e18 for one/);
 assert.ok(!JSON.stringify(packet).includes('private-signature-value'));
 const tx=example('native') as Extract<SecurityRequest,{kind:'transaction'}>;
 tx.transaction.gas='0x5208';tx.transaction.maxFeePerGas='0x3b9aca00';tx.transaction.nonce='0x2';
 assert.deepEqual(evidencePacket(assess(tx,[])).feeParameters,{gas:'21000',maxFeePerGas:'1000000000',nonce:'2'});
});
test('unknown checks, incomplete collection and model-discovered gaps cannot be hidden behind stale completeness metadata',()=>{
 const report=assess(example('approve'),demoEvidence());report.missingData=[];report.complete=true;
 const valid={...modelDimensions(),score:23,assessment:'review',summary:'Evidence-bound test',reasons:[{text:'scope',evidence_ids:['permission_scope']}],missing_data:[],suggested_action:'verify',honeypot:'unknown'};
 const simulationGap=report.checks.find(c=>c.id==='asset_simulation')!.title;
 const packet=evidencePacket(report);assert.equal(packet.evidenceComplete,false);assert.ok(packet.missing_checks.includes(simulationGap));
 assert.throws(()=>validateAI({...valid,evidence_confidence:'strong'},report,'test'),/Unresolved evidence/);
 assert.throws(()=>validateAI({...valid,assessment:'low'},report,'test'),/Incomplete evidence/);
 assert.ok(validateAI(valid,report,'test').missing_data.includes(simulationGap));
 const complete=structuredClone(report);complete.checks=complete.checks.filter(c=>c.status!=='unknown');
 assert.equal(evidencePacket(complete).evidenceComplete,true);
 assert.throws(()=>validateAI({...valid,missing_data:['Price source unknown'],evidence_confidence:'strong'},complete,'test'),/Unresolved evidence/);
 assert.throws(()=>validateAI({...valid,missing_data:['Price source unknown'],assessment:'low'},complete,'test'),/Incomplete evidence/);
 complete.complete=false;assert.equal(evidencePacket(complete).evidenceComplete,false);
 assert.ok(validateAI(valid,complete,'test').missing_data.some(m=>m.includes('Evidence collection is incomplete')));
 const many=assess(example('approve'),Array.from({length:35},(_,i)=>evidence(`gap_${i}`,'unknown',`Missing observation ${i}`,'missing','coverage')));
 const accepted=validateAI(valid,many,'test');for(let i=0;i<35;i++)assert.ok(accepted.missing_data.includes(`Missing observation ${i}`));
});
test('unperformed plans and unknown-only citations cannot support a number; duplicate evidence IDs remain ambiguous',()=>{
 const report=assess(example('approve'),demoEvidence());
 const valid={...modelDimensions(),score:23,assessment:'review',summary:'Evidence-bound test',reasons:[{text:'scope',evidence_ids:['permission_scope']}],missing_data:[],suggested_action:'verify',honeypot:'unknown'};
 for(const id of ['asset_simulation','tool_plan']){
  const unsupported={...valid,dimensions:valid.dimensions.map(d=>({...d,evidence_ids:[id]}))};
  assert.throws(()=>validateAI(unsupported,report,'test'),/No supported dimension/);
  assert.equal(validateAI({...unsupported,score:null,assessment:'unknown',dimensions:unsupported.dimensions.map(d=>({...d,assessment:'unknown'}))},report,'test').score,null);
 }
 report.checks.push({...report.checks[0],detail:'conflicting duplicate'});
 assert.throws(()=>validateAI(valid,report,'test'),/Ambiguous evidence/);
});
test('identity high requires relevant observed identity evidence rather than an unrelated permission risk',()=>{
 const report=assess(example('approve'),demoEvidence());
 const withIdentity=(id:string)=>({...modelDimensions(),score:23,assessment:'review',summary:'Evidence-bound test',reasons:[{text:'scope',evidence_ids:['permission_scope']}],missing_data:[],suggested_action:'verify',honeypot:'unknown',dimensions:modelDimensions().dimensions.map(d=>d.dimension==='identity'?{...d,assessment:'high',evidence_ids:[id]}:d)});
 assert.throws(()=>validateAI(withIdentity('permission_scope'),report,'test'),/Identity risk/);
 const id='address_0x3333333333333333333333333333333333333333';
 report.checks.push(evidence(id,'risk','地址不利情报','数据源命中','goplus',{flags:{phishing_activities:'1'}}));
 assert.equal(validateAI(withIdentity(id),report,'test').score,23);
 const negativeToken=assess(example('approve'),[evidence('token_security','warning','代币情报','未命中','goplus',{is_honeypot:'0'})]);
 assert.throws(()=>validateAI(withIdentity('token_security'),negativeToken,'test'),/Identity risk/);
 const req=example('permit') as Extract<SecurityRequest,{kind:'signature'}>;(req.signature.data as any).message.owner='0x'+'4'.repeat(40);
 assert.equal(validateAI(withIdentity('signer_mismatch'),assess(req,demoEvidence()),'test').score,23);
});
test('each assessed dimension needs an observation even when another dimension supports the number',()=>{
 const report=finitePermitReport();
 for(const score of [23,null]){
  const unsupported=finitePermitOutput(score);unsupported.dimensions.find(d=>d.dimension==='exposure')!.evidence_ids=['asset_simulation','tool_plan'];
  assert.throws(()=>validateAI(unsupported,report,'test'),/Assessed dimension lacks observation/);
  const unknown=structuredClone(unsupported);unknown.dimensions.find(d=>d.dimension==='exposure')!.assessment='unknown';
  assert.equal(validateAI(unknown,report,'test').score,score);
  const observed=structuredClone(unsupported);observed.dimensions.find(d=>d.dimension==='exposure')!.evidence_ids.push('token_identity');
  assert.equal(validateAI(observed,report,'test').score,score);
 }
});
test('honeypot conclusions require selling-specific evidence and cannot ignore a contradictory restriction',()=>{
 const valid={...modelDimensions(),score:23,assessment:'review',summary:'Evidence-bound test',reasons:[{text:'scope',evidence_ids:['permission_scope']}],missing_data:[],suggested_action:'verify',honeypot:'unknown'};
 const report=(data:Record<string,string>)=>assess(example('approve'),[evidence('token_security','risk','代币情报','observed','goplus',data)]);
 const controls=report({is_honeypot:'0',owner_change_balance:'1'});
 assert.throws(()=>validateAI({...valid,honeypot:'risk_indicator'},controls,'test'),/Unsupported honeypot/);
 assert.equal(validateAI({...valid,honeypot:'no_known_indicator'},controls,'test').honeypot,'no_known_indicator');
 const restricted=report({is_honeypot:'0',cannot_sell_all:'1'});
 assert.equal(validateAI({...valid,honeypot:'risk_indicator'},restricted,'test').honeypot,'risk_indicator');
 assert.throws(()=>validateAI({...valid,honeypot:'no_known_indicator'},restricted,'test'),/selling restriction/);
 assert.equal(validateAI({...valid,honeypot:'risk_indicator'},report({is_honeypot:'1'}),'test').honeypot,'risk_indicator');
 const roundTrip=report({is_honeypot:'0'});roundTrip.checks.push(evidence('round_trip','risk','卖出未返回资产','observed','isolated-fork'));
 assert.equal(validateAI({...valid,honeypot:'risk_indicator'},roundTrip,'test').honeypot,'risk_indicator');
 assert.throws(()=>validateAI({...valid,honeypot:'no_known_indicator'},roundTrip,'test'),/round trip risk/);
});
test('explicit signature verification claims require the matching cited RPC observation and direction',()=>{
 const report=finitePermitReport();
 for(const [text,evidence_ids] of [
  ['nonce 已核对匹配',['token_identity']],
  ['domain 已核对一致',['typed_structure']],
  ['nonce and domain are verified',['signature_nonce']],
  ['nonce 与链上状态不一致',['signature_nonce']],
  ['domain mismatch',['signature_domain']]
 ] as [string,string[]][]){
  const value=finitePermitOutput(23);value.reasons=[{text,evidence_ids}];
  assert.throws(()=>validateAI(value,report,'test'),/Unsupported signature verification claim/,text);
 }
 const unknown=finitePermitOutput(23);unknown.reasons=[{text:'nonce 未核对，domain 尚待验证；请核对后再决定。',evidence_ids:['operation']}];
 assert.equal(validateAI(unknown,report,'test').score,23,'uncertainty and advice do not claim a verification');
 const quoted=finitePermitOutput(23);quoted.reasons=[{text:'用户声称 nonce 已验证，但该说法未独立核实。不能据此认为 domain 不匹配。',evidence_ids:['operation']}];
 assert.equal(validateAI(quoted,report,'test').score,23,'quoting an unverified claim does not turn it into an asserted observation');
 const observed=finitePermitOutput(23);observed.reasons=[{text:'nonce is verified, but the spender remains untrusted.',evidence_ids:['signature_nonce']}];
 assert.equal(validateAI(observed,report,'test').score,23);
 const failed=structuredClone(report);failed.checks.find(c=>c.id==='signature_nonce')!.status='risk';
 const mismatch=finitePermitOutput(23);mismatch.dimensions[0].reason='有限权限存在，但 nonce 与链上状态不一致。';mismatch.reasons=[{text:'nonce 与链上状态不一致；domain 已核对匹配。',evidence_ids:['signature_nonce','signature_domain']}];
 assert.equal(validateAI(mismatch,failed,'test').score,23);
 const missing=structuredClone(report);missing.checks.find(c=>c.id==='signature_domain')!.status='unknown';
 assert.throws(()=>validateAI(finitePermitOutput(23),missing,'test'),/Unsupported signature verification claim/);
});
test('an opaque request with no observed permission or exposure basis may abstain and cannot borrow a completed plan as substance',()=>{
 const request:SecurityRequest={kind:'wallet_rpc',chainId:1,method:'wallet_unrecognizedOperation',params:{}};
 const report=assess(request,[]),fixture=modelDimensions('operation'),value={...fixture,dimensions:fixture.dimensions.map(d=>({...d,assessment:'unknown'})),score:null,assessment:'unknown',summary:'There is not enough evidence to assess this unknown operation.',reasons:[{text:'Tools were selected, but execution semantics are not understood.',evidence_ids:['operation','tool_plan']}],missing_data:[],suggested_action:'Verify the request method and actual purpose first.',honeypot:'unknown'};
 assert.equal(validateAI(value,report,'test').score,null);
 assert.throws(()=>validateAI({...value,score:10,assessment:'review'},report,'test'),/No supported dimension/);
});
test('personal-sign session matching normalizes text/hex representation without changing message bytes',()=>{
 const req=example('message') as Extract<SecurityRequest,{kind:'signature'}>;req.signature.data='hello';const encoded=structuredClone(req);encoded.signature.data=stringToHex('hello');assert.equal(comparableRequest(req),comparableRequest(encoded));encoded.signature.data=stringToHex('Hello');assert.notEqual(comparableRequest(req),comparableRequest(encoded));
});
test('legacy lab purpose/context never reenter clean Snap input, while exact session/report correlation and stored history remain intact',async()=>{
 const store=createStore(':memory:');const captured:SecurityRequest[]=[];
 const app=await buildApp(store,{security:{config:async()=>config,collect:async(req)=>{captured.push(req);return demoEvidence();}}});
 try{
  const req=example('approve'),legacy=Object.assign(structuredClone(req),{intent:'LEGACY_PURPOSE_MUST_NOT_REENTER_MODEL',context:{withdrawalFee:true,guaranteedProfit:true,requestedBy:'stranger'}});const {session}=newLabSession('approve-unlimited',legacy);store.labSave(session);
  const webpage=await app.inject({method:'POST',url:'/api/security/scan',headers:{origin:'http://127.0.0.1:5173','X-WalletShield-Test-Session':session.id},payload:req});assert.equal(webpage.statusCode,200);assert.equal(Object.hasOwn(captured[0],'intent'),false);assert.equal(Object.hasOwn(captured[0],'context'),false);assert.equal(store.labGet(session.id)?.reportId,undefined,'a website request cannot claim Snap delivery');
  const response=await app.inject({method:'POST',url:'/api/security/scan',headers:{origin:'null',authorization:`Bearer ${config.snapToken}`,'X-WalletShield-Test-Session':session.id},payload:req});assert.equal(response.statusCode,200);assert.equal(captured.length,2);assert.equal(Object.hasOwn(captured[1],'intent'),false);assert.equal(Object.hasOwn(captured[1],'context'),false);assert.equal(response.json().capture.channel,'paired-snap');assert.equal(store.labGet(session.id)?.reportId,response.json().id,'removing context must preserve exact Snap session/report matching');assert.ok(!response.json().checks.some((c:any)=>['fraud_context','withdrawal_fee','guaranteed_profit','stranger_request'].includes(c.id)));assert.ok(response.json().checks.some((c:any)=>c.status==='unknown'),'genuine unfinished checks are still retained');
  const saved=store.labGet(session.id)!;assert.equal((saved.request as typeof legacy).intent,legacy.intent);assert.equal((saved.request as typeof legacy).context.withdrawalFee,true,'historical records must not be rewritten');
  const oldReport=assess(structuredClone(req),demoEvidence());Object.assign(oldReport.request,{intent:legacy.intent,context:legacy.context});const before=JSON.stringify(oldReport),packet=evidencePacket(oldReport);assert.equal(Object.hasOwn(packet,'intent'),false);assert.equal(Object.hasOwn(packet,'userReportedContext'),false);assert.equal(Object.hasOwn(packet,'context'),false);assert.equal(JSON.stringify(packet).includes(legacy.intent),false);assert.equal(JSON.stringify(oldReport),before,'packet construction must not rewrite the persisted report');
  for(const extra of [{intent:'New manual purpose'},{context:{withdrawalFee:true}}]){const denied=await app.inject({method:'POST',url:'/api/security/scan',headers:{origin:'null',authorization:`Bearer ${config.snapToken}`},payload:{...req,...extra}});assert.equal(denied.statusCode,400);}
  assert.equal(captured.length,2,'rejected manual fields must not reach evidence collection');
 }finally{await app.close();store.close();}
});
test('on-chain deadline comparison uses the observed block timestamp instead of silently assuming the workstation clock',()=>{
 const req=example('permit') as Extract<SecurityRequest,{kind:'signature'}>;(req.signature.data as any).message.deadline='2';
 const at=(timestamp:string)=>assess(req,[evidence('chain_context','pass','block','test','rpc',{blockTimestampSeconds:timestamp})]);
 assert.ok(!at('1').checks.some(c=>c.id==='expired_deadline'));assert.ok(at('3').checks.some(c=>c.id==='expired_deadline'&&c.detail.includes('queried block clock')));
});
