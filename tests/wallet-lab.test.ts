import test from 'node:test';
import assert from 'node:assert/strict';
import {WALLET_CASES,UNAVAILABLE_WALLET_TESTS} from '../src/testing/cases.js';
import {COVERAGE_PROFILES} from '../src/security/coverage.js';
import {newLabSession,matchLabReport,comparableRequest,validLabToken,publicLabSession} from '../src/testing/sessions.js';
import {securityExamples,demoEvidence} from '../src/security/examples.js';
import {assess} from '../src/security/rules.js';
import {createStore} from '../src/server/store.js';
import {buildApp} from '../src/server/app.js';
import {encodeFunctionData,parseAbi} from 'viem';
import {decodeRequest} from '../src/security/decode.js';
import type {SecurityRequest} from '../src/security/types.js';
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
