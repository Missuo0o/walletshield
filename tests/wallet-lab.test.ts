import test from 'node:test';
import assert from 'node:assert/strict';
import {WALLET_CASES,UNAVAILABLE_WALLET_TESTS,buildWalletCase} from '../src/testing/cases.js';
import {compileLabArtifacts,labClient,type LabDeployment} from '../src/testing/contracts.js';
import {COVERAGE_PROFILES} from '../src/security/coverage.js';
import {newLabSession,matchLabReport,comparableRequest,validLabToken,publicLabSession} from '../src/testing/sessions.js';
import {securityExamples,demoEvidence} from '../src/security/examples.js';
import {assess} from '../src/security/rules.js';
import {createStore} from '../src/server/store.js';
import {buildApp} from '../src/server/app.js';
import {decodeFunctionData,encodeFunctionData,hashTypedData,maxUint256,parseAbi} from 'viem';
import {decodeRequest} from '../src/security/decode.js';
import {signatureStructure} from '../src/security/signatures.js';
import {requestSchema,type SecurityRequest} from '../src/security/types.js';
const request=()=>structuredClone(securityExamples.find(e=>e.id==='approve')!.request);
test('V3 tuple overloads and zero-argument deposit preserve exact selectors while rejecting trailing bytes',()=>{
 const address='0x1111111111111111111111111111111111111111';
 for(const deadline of [true,false]){
  const abi=parseAbi([`function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,${deadline?'uint256 deadline,':''}uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params)`]);
  const data=encodeFunctionData({abi,functionName:'exactInputSingle',args:[{tokenIn:address,tokenOut:address,fee:3000,recipient:address,...(deadline?{deadline:2000000000n}:{}),amountIn:1n,amountOutMinimum:0n,sqrtPriceLimitX96:0n}]});
  const req:SecurityRequest={kind:'transaction',chainId:31337,transaction:{from:address,to:address,data}};
  assert.equal(decodeRequest(req).category,'swap_v3');req.transaction.data+='00';assert.equal(decodeRequest(req).category,'contract_call');
 }
 assert.equal(decodeRequest({kind:'transaction',chainId:31337,transaction:{from:address,to:address,data:encodeFunctionData({abi:parseAbi(['function deposit()']),functionName:'deposit'})}}).category,'wrap');
});
test('wallet catalog uses real wallet entry types and names excluded operations separately',()=>{
 assert.equal(new Set(WALLET_CASES.map(c=>c.id)).size,WALLET_CASES.length);
 assert.ok(WALLET_CASES.length>40);
 for(const c of WALLET_CASES){assert.ok(['transaction','signature'].includes(c.kind));assert.ok(COVERAGE_PROFILES.some(p=>p.id===c.profile),c.profile);}
 for(const name of ['Permit2','EIP-7702','UserOperation'])assert.ok([...WALLET_CASES.map(c=>c.name),...UNAVAILABLE_WALLET_TESTS.map(c=>c.name)].some(n=>n.includes(name)));
 assert.ok(!WALLET_CASES.some(c=>c.id==='raw-sign'));
});
test('lab matches exact wallet operations while allowing wallet fee enrichment; ambiguity never creates a false match',()=>{
 const req=request();const {session,token}=newLabSession('approve-unlimited',req);assert.equal(validLabToken(session,token),true);assert.equal(validLabToken(session,'wrong'),false);assert.equal(Object.hasOwn(publicLabSession(session),'tokenHash'),false);
 const report=assess(req,demoEvidence());report.createdAt=new Date(Date.parse(session.createdAt)+1).toISOString();
 const withFees=structuredClone(report);if(withFees.request.kind==='transaction')withFees.request.transaction.gas='0x5208';
 assert.equal(matchLabReport([session],withFees)?.reportId,report.id);
 assert.equal(matchLabReport([session,{...session,id:'duplicate'}],report),null);
 const other=structuredClone(report);if(other.request.kind==='transaction')other.request.transaction.value='0x1';assert.equal(matchLabReport([session],other),null);
 assert.equal(matchLabReport([{...session,reportId:'already-linked'}],report),null);
 assert.equal(matchLabReport([{...session,createdAt:new Date(Date.parse(report.createdAt)-600001).toISOString()}],report),null);
});
test('structured signature matching is stable across JSON formatting but not across distinct payloads',()=>{
 const object=structuredClone(securityExamples.find(e=>e.id==='permit')!.request) as Extract<SecurityRequest,{kind:'signature'}>;
 const string=structuredClone(object);string.signature.data=JSON.stringify(object.signature.data,null,2);
 assert.equal(comparableRequest(object),comparableRequest(string));string.signature.data='{"different":true}';assert.notEqual(comparableRequest(object),comparableRequest(string));
});
test('only authenticated Snap scans attach reports; webpage scans and arbitrary outcomes do not fabricate wallet acceptance',async()=>{
 const store=createStore(':memory:'),snapToken='b'.repeat(64);
 const app=await buildApp(store,{security:{config:async()=>({apiKey:'',model:'muse-wonder-1.0',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{},snapToken}),collect:async()=>demoEvidence()}});
 try{
  const {session}=newLabSession('approve-unlimited',request());store.labSave(session);
  await app.inject({method:'POST',url:'/api/security/scan',headers:{origin:'http://127.0.0.1:5173'},payload:session.request});assert.equal(store.labGet(session.id)?.reportId,undefined);
  const scan=await app.inject({method:'POST',url:'/api/security/scan',headers:{origin:'null',authorization:`Bearer ${snapToken}`},payload:session.request});assert.equal(scan.statusCode,200);assert.equal(store.labGet(session.id)?.reportId,scan.json().id);
  const a=newLabSession('approve-unlimited',request()),b=newLabSession('approve-unlimited',request());store.labSave(a.session);store.labSave(b.session);
  const exact=await app.inject({method:'POST',url:'/api/security/scan',headers:{origin:'null',authorization:`Bearer ${snapToken}`,'X-WalletShield-Test-Session':b.session.id},payload:b.session.request});
  assert.equal(store.labGet(b.session.id)?.reportId,exact.json().id);assert.equal(store.labGet(a.session.id)?.reportId,undefined);
  const exposed=(await app.inject({method:'GET',url:`/api/lab/sessions/${session.id}`})).json();assert.ok(!JSON.stringify(exposed).includes(session.tokenHash));assert.equal(exposed.report.id,scan.json().id);
  assert.equal((await app.inject({method:'POST',url:'/api/lab/prepare',headers:{origin:'https://evil.example'},payload:{address:'0x'+'1'.repeat(40)}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/api/lab/begin',headers:{origin:'http://127.0.0.1:5173'},payload:{caseId:'unknown-client-method',address:'0x'+'1'.repeat(40)}})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:`/api/lab/sessions/${session.id}/result`,headers:{origin:'http://127.0.0.1:5173'},payload:{token:'x'.repeat(30),status:'confirmed'}})).statusCode,400);
 }finally{await app.close();store.close();}
});

const optionalAccountCases=['account-threshold','account-module-enable','account-module-disable','account-guard-set','account-guard-remove','account-fallback-set','account-fallback-remove','account-call'];
const candidateSignatureCases=['dai-allow','dai-revoke','erc3009-transfer','erc3009-receive'];
const compiled=compileLabArtifacts();
function fixtureDeployment():LabDeployment {
 const address=(digit:string)=>('0x'+digit.repeat(40)) as `0x${string}`;
 return {version:1,chainId:31337,baseToken:address('1'),owner:address('2'),recipient:address('3'),deployedAt:'2026-10-22T00:00:00.000Z',contracts:Object.fromEntries([['token','4'],['actions','5'],['account','6']].map(([key,digit])=>[key,{address:address(digit),codeHash:('0x'+'a'.repeat(64)) as `0x${string}`}]))};
}
test('the optional account artifact compiles and new wallet cases contain real canonical control/CALL transactions',async()=>{
 const artifacts=await compiled,d=fixtureDeployment();
 assert.ok(artifacts.LabAccount.bytecode.length>100);
 for(const id of optionalAccountCases) {
  const item=WALLET_CASES.find(value=>value.id===id)!;assert.equal(item.kind,'transaction');assert.match(item.boundary!,/No production multisig signatures/);
  const request=await buildWalletCase(id,d.owner,d,artifacts);assert.equal(requestSchema.safeParse(request).success,true,id);
  assert.equal(request.kind,'transaction');if(request.kind!=='transaction')throw Error('Expected transaction');
  assert.equal(request.transaction.to,d.contracts.account.address);
  const operation=decodeRequest(request);assert.equal(operation.category,id==='account-call'?'account_execution':'account_control',id);
  assert.ok(COVERAGE_PROFILES.find(profile=>profile.id===item.profile)?.categories.includes(operation.category),id);
  const decoded=decodeFunctionData({abi:artifacts.LabAccount.abi,data:request.transaction.data as `0x${string}`});
  if(id==='account-call'){
   assert.equal(decoded.functionName,'execTransaction');
   const args=decoded.args as readonly unknown[];assert.equal(args[0],d.contracts.token.address);assert.equal(args[1],0n);assert.equal(args[3],0);assert.equal(args[9],'0x');
   const inner=decodeFunctionData({abi:artifacts.LabToken.abi,data:args[2] as `0x${string}`});assert.equal(inner.functionName,'mint');assert.deepEqual(inner.args,[d.owner,1000000n]);
  }
 }
});
test('an older lab remains usable but optional account cases give an actionable deployment instruction',async()=>{
 const artifacts=await compiled,d=fixtureDeployment();delete d.contracts.account;
 for(const id of optionalAccountCases)await assert.rejects(buildWalletCase(id,d.owner,d,artifacts),/Run npm run deploy:lab/);
 const existing=await buildWalletCase('token-transfer',d.owner,d,artifacts);
 assert.equal(existing.kind,'transaction');assert.equal(decodeRequest(existing).category,'token_transfer');
});
test('DAI-shaped local signature candidates query only the holder nonce and preserve grant versus revocation semantics',async(t)=>{
 const artifacts=await compiled,d=fixtureDeployment();let calls=0;
 t.mock.method(labClient,'readContract',async(params:Record<string,unknown>)=>{calls++;assert.equal(params.address,d.contracts.token.address);assert.equal(params.functionName,'nonces');assert.deepEqual(params.args,[d.owner]);return 7n;});
 for(const id of ['dai-allow','dai-revoke']) {
  const request=await buildWalletCase(id,d.owner,d,artifacts),operation=decodeRequest(request);
  assert.equal(requestSchema.safeParse(request).success,true);assert.equal(operation.category,'dai_permit_signature');
  assert.equal(operation.fields.allowed,id==='dai-allow');assert.equal(operation.fields.amount,id==='dai-allow'?String(maxUint256):'0');
  assert.equal(operation.addsPermission,id==='dai-allow');
  if(request.kind!=='signature')throw Error('Expected signature');const typed=request.signature.data as any;
  assert.equal(typed.message.holder,d.owner);assert.equal(typed.message.nonce,'7');assert.equal(typed.domain.verifyingContract,d.contracts.token.address);
  assert.match(hashTypedData(typed),/^0x[\da-f]{64}$/);assert.ok(signatureStructure(request).some(fact=>fact.id==='typed_structure'&&fact.status==='pass'));
  assert.match(WALLET_CASES.find(item=>item.id===id)!.boundary!,/does not implement this signature-consumption method/);
 }
 assert.equal(calls,2);
});
test('ERC-3009 local candidates use unique committed bytes32 nonces without inventing an authorization-state getter',async(t)=>{
 const artifacts=await compiled,d=fixtureDeployment();
 t.mock.method(labClient,'readContract',async()=>{throw Error('ERC-3009 request construction must not borrow the sequential nonce getter');});
 const nonces=new Set<string>();
 for(const id of ['erc3009-transfer','erc3009-receive']) {
  const request=await buildWalletCase(id,d.owner,d,artifacts),operation=decodeRequest(request);
  assert.equal(requestSchema.safeParse(request).success,true);assert.equal(operation.category,'transfer_authorization');assert.equal(operation.addsPermission,false);
  if(request.kind!=='signature')throw Error('Expected signature');const typed=request.signature.data as any;
  assert.equal(typed.primaryType,id==='erc3009-transfer'?'TransferWithAuthorization':'ReceiveWithAuthorization');
  assert.equal(typed.message.from,d.owner);assert.equal(typed.message.to,d.recipient);assert.equal(typed.message.value,'1000000');
  assert.equal(typed.message.validAfter,'0');assert.ok(BigInt(typed.message.validBefore)>BigInt(Math.floor(Date.now()/1000)));
  assert.match(typed.message.nonce,/^0x[\da-f]{64}$/);nonces.add(typed.message.nonce);
  assert.match(hashTypedData(typed),/^0x[\da-f]{64}$/);
  assert.equal(operation.fields.relayerRestriction,id==='erc3009-transfer'?'any_submitter':'caller_must_be_recipient');
  assert.equal(comparableRequest(request),comparableRequest(structuredClone(request)),'The generated nonce stays committed to its stored request.');
  assert.match(WALLET_CASES.find(item=>item.id===id)!.boundary!,/no future acceptance, ERC-3009 authorizationState or token movement is established/);
 }
 assert.equal(nonces.size,2);
 assert.equal(WALLET_CASES.filter(item=>optionalAccountCases.includes(item.id)).length,8);
 assert.equal(WALLET_CASES.filter(item=>candidateSignatureCases.includes(item.id)).length,4);
});
