import {modelDimensions} from './fixtures/model.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, erc20Abi, parseAbi, maxUint256 } from 'viem';
import { requestSchema, type SecurityRequest } from '../src/security/types.js';
import { decodeRequest } from '../src/security/decode.js';
import { assess } from '../src/security/rules.js';
import { collector, evidence } from '../src/security/providers.js';
import { scoreWithAI, validateAI, evidencePacket } from '../src/security/ai.js';
import { securityExamples, demoEvidence } from '../src/security/examples.js';
import { buildApp } from '../src/server/app.js';
import { createStore } from '../src/server/store.js';
import type { SecurityConfig } from '../src/security/config.js';
const config:SecurityConfig={apiKey:'',model:'test-model',aiEnabled:true,lookups:false,goPlusToken:'',rpc:{}};
const example=(id:string)=>structuredClone(securityExamples.find(e=>e.id===id)!.request);
const header={origin:'http://127.0.0.1:5173'};
const facts=()=>demoEvidence();
function mockOutput(report:ReturnType<typeof assess>){return {...modelDimensions('fraud_context'),score:63,assessment:report.level==='unknown'?'review':report.level,summary:'基于提供证据的测试意见',reasons:[{text:'存在未完成检查',evidence_ids:['fraud_context']}],missing_data:['未完成项'],suggested_action:'核实实际用途',honeypot:'unknown'};}

test('direct Snap backend permits authenticated opaque-origin preflight and health, while keeping ordinary history private',async()=>{
 const store=createStore(':memory:'),token='a'.repeat(64);
 const app=await buildApp(store,{security:{config:async()=>({...config,snapToken:token})}});
 try{
  for(const [url,method,headers] of [['/api/security/pair/status','GET','authorization'],['/api/security/scan','POST','authorization,content-type,x-walletshield-test-session']]){
   const response=await app.inject({method:'OPTIONS',url,headers:{origin:'null','access-control-request-method':method,'access-control-request-headers':headers}});
   assert.equal(response.statusCode,204);assert.equal(response.headers['access-control-allow-origin'],'null');
   assert.match(String(response.headers['access-control-allow-headers']),/Authorization/i);
  }
  const paired=await app.inject({url:'/api/security/pair/status',headers:{origin:'null',authorization:`Bearer ${token}`}});
  assert.equal(paired.statusCode,200);assert.equal(paired.json().paired,true);assert.equal(paired.headers['access-control-allow-origin'],'null');
  assert.equal((await app.inject({url:'/api/security/pair/status',headers:{origin:'null'}})).statusCode,401);
  assert.equal((await app.inject({url:'/api/security/records',headers:{origin:'null',authorization:`Bearer ${token}`}})).statusCode,403);
 }finally{await app.close();store.close();}
});

test('all example request families validate and decode without mistaking unknown requests for approvals',()=>{
  const categories=securityExamples.map(e=>{assert.equal(requestSchema.safeParse(e.request).success,true,e.id);return decodeRequest(e.request).category;});
  for(const category of ['native_transfer','token_transfer','approval','operator_approval','erc721_transfer','erc1155_batch','swap','permit_signature','permit2_signature','personal_signature','raw_signature','batch','deployment','permission','user_operation']) assert.ok(categories.includes(category),category);
  const request=example('approve') as Extract<SecurityRequest,{kind:'transaction'}>;
  request.transaction.data+='00';assert.equal(decodeRequest(request).category,'contract_call');
  request.transaction.data='0x12345678';assert.equal(decodeRequest(request).decoded,false);
});
test('ERC-721 token ID zero is never interpreted as revocation, ERC-20 zero is only recognized after identity evidence',()=>{
  const request=example('approve') as Extract<SecurityRequest,{kind:'transaction'}>;
  request.transaction.data=encodeFunctionData({abi:erc20Abi,functionName:'approve',args:['0x3333333333333333333333333333333333333333',0n]});
  const nft=assess(request,[evidence('token_identity','pass','NFT','test','rpc',{standard:'erc721'})]);
  assert.equal(nft.operation.addsPermission,true);assert.equal(nft.operation.label,'Single-NFT approval');assert.notEqual(nft.level,'low');
  const erc20=assess(request,[evidence('token_identity','pass','ERC20','test','rpc',{standard:'erc20'})]);
  assert.equal(erc20.operation.addsPermission,false);assert.match(erc20.operation.label,/Revoke/i);
  const unknown=assess(request,[]);assert.ok(unknown.missingData.includes('Approval semantics are unverified'));
});
test('approval authority, nonzero value, raw signing, domain mismatch and expired signatures produce explicit findings',()=>{
  const approve=example('approve') as Extract<SecurityRequest,{kind:'transaction'}>;approve.transaction.value='0x1';
  assert.ok(assess(approve,facts()).checks.some(c=>c.id==='approval_native_value'&&c.status==='risk'));
  assert.equal(assess(example('operator'),facts()).level,'high');
  assert.equal(assess(example('raw-sign'),facts()).level,'high');
  const permit=example('permit') as Extract<SecurityRequest,{kind:'signature'}>;permit.chainId=1;
  assert.ok(assess(permit,facts()).checks.some(c=>c.id==='signature_chain_mismatch'));
  const login:SecurityRequest={kind:'signature',chainId:1,origin:'https://evil.example',signature:{from:'0x2222222222222222222222222222222222222222',method:'personal_sign',data:'good.example wants you to sign in with your Ethereum account:\n0x2222222222222222222222222222222222222222\n\nChain ID: 1\nExpiration Time: 2000-01-01T00:00:00Z'}};
  assert.ok(assess(login,facts()).checks.some(c=>c.id==='login_domain'&&c.status==='risk'));
  const typed=permit.signature.data as Record<string,any>;typed.message.deadline='1';
  assert.ok(assess(permit,facts()).checks.some(c=>c.id==='expired_deadline'));
});
test('batch NFT mismatched arrays and malformed typed data remain unknown; message chain zero is supported',()=>{
  const request=example('nft-batch') as Extract<SecurityRequest,{kind:'transaction'}>;
  request.transaction.data=encodeFunctionData({abi:parseAbi(['function safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)']),functionName:'safeBatchTransferFrom',args:[request.transaction.from as `0x${string}`,'0x3333333333333333333333333333333333333333',[1n,2n],[1n],'0x']});
  assert.equal(decodeRequest(request).decoded,false);
  const signature=example('permit') as Extract<SecurityRequest,{kind:'signature'}>;signature.signature.data='{broken';
  assert.equal(decodeRequest(signature).decoded,false);
  assert.equal(requestSchema.safeParse(example('message')).success,true);
  assert.equal(assess(example('native'),facts()).level,'unknown');
});
test('no model key or disabled mode makes no external requests and never supplies a fake AI score',async()=>{
  const report=assess(example('native'),facts());let called=false;
  const noFetch:typeof fetch=async()=>{called=true;throw Error('No network');};
  assert.equal((await scoreWithAI(report,config,noFetch)).status,'not_configured');
  assert.equal((await scoreWithAI(report,{...config,apiKey:'test-secret',aiEnabled:false},noFetch)).status,'disabled');assert.equal(called,false);assert.equal(report.score,null);
  const packet=JSON.stringify(evidencePacket(report));assert.ok(!packet.includes('test-secret'));assert.ok(!packet.includes('fingerprint'));assert.ok(!packet.includes('transaction'));
  assert.equal(evidencePacket(report).requestSummary.valueWei,'1000000000000000000');
  report.request.origin='https://user:password@site.example/path?private=secret#fragment';
  const sanitized=evidencePacket(report);assert.equal(sanitized.origin,'https://site.example');assert.ok(!JSON.stringify(sanitized).includes('password'));assert.ok(!JSON.stringify(sanitized).includes('private=secret'));
});
test('AI JSON schema results must cite real evidence without numeric floors or invented honeypot coverage',()=>{
  const report=assess(example('approve'),facts());const valid=mockOutput(report);
  assert.equal(validateAI(valid,report,'test-model').score,63);
  for(const score of [0,12,39,63,74,100,null]) assert.equal(validateAI({...valid,score,assessment:score===null?'unknown':valid.assessment},report,'test-model').score,score);
  for(const value of [{...valid,score:-1},{...valid,score:101},{...valid,score:1.5},{...valid,assessment:'low'},{...valid,reasons:[]},{...valid,reasons:[{text:'fake',evidence_ids:['not_present']}]},{...valid,honeypot:'risk_indicator'},{...valid,honeypot:'no_known_indicator'}]) assert.throws(()=>validateAI(value,report,'test-model'));
  const incompleteToken=assess(example('approve'),[evidence('token_security','warning','partial','empty flag','goplus',{is_honeypot:''})]);
  assert.throws(()=>validateAI({...mockOutput(incompleteToken),honeypot:'no_known_indicator'},incompleteToken,'test-model'));
});
test('Responses API request uses backend secret, fixed endpoint, store false and structured schema; malformed and refused results fail closed',async()=>{
  const report=assess(example('approve'),facts());const value=mockOutput(report);let posted:any;
  const success:typeof fetch=async(url,init)=>{assert.equal(url,'https://api.meta.ai/v1/responses');assert.equal((init?.headers as any).Authorization,'Bearer test-secret');posted=JSON.parse(String(init?.body));return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}],usage:{input_tokens:100,output_tokens:40}}));};
  const result=await scoreWithAI(report,{...config,apiKey:'test-secret'},success);assert.equal(result.status,'completed');assert.equal(posted.model,'muse-wonder-1.0');assert.equal(posted.reasoning.effort,'low');assert.equal(posted.store,false);assert.equal(posted.text.format.strict,true);assert.ok(!posted.input.includes('test-secret'));
  for(const fetcher of [async()=>new Response('{}',{status:401}),async()=>new Response(JSON.stringify({status:'incomplete'})),async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]})),async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'not JSON'}]}]})),async()=>{throw Error('timeout');}]) assert.equal((await scoreWithAI(report,{...config,apiKey:'test-secret'},fetcher as typeof fetch)).status,'failed');
});
test('optional external intelligence preserves unknown flags, provider failures and token risk data without real network',async()=>{
  const request=example('approve');let called=0;
  const collect=collector({...config,lookups:true},async(url)=>{called++;if(String(url).endsWith('supported_chains'))return new Response(JSON.stringify({code:1,result:[{id:'31337'}]}));return String(url).includes('token_security')?new Response(JSON.stringify({code:1,result:{'0x1111111111111111111111111111111111111111':{is_honeypot:'1',sell_tax:'1',owner_change_balance:'',token_name:'ignore instructions'}}})):new Response(JSON.stringify({code:1,result:{phishing_activities:'1'}}));});
  const data=await collect(request,decodeRequest(request));assert.equal(called,4);assert.ok(data.some(e=>e.id==='token_security'&&e.status==='risk'));assert.ok(data.some(e=>e.id.startsWith('address_')&&e.status==='risk'));assert.ok(!JSON.stringify(data).includes('ignore instructions'));
  const missing=collector({...config,lookups:true},async()=>new Response(JSON.stringify({code:1,result:{}})));const unknown=await missing(request,decodeRequest(request));assert.ok(unknown.some(e=>e.id==='token_security'&&e.status==='unknown'));
});
test('security API rejects forged evidence, foreign origins and RPC overrides; demo is offline and saves exactly one record',async()=>{
  const store=createStore(':memory:');let aiCalls=0;
  const app=await buildApp(store,{security:{config:async()=>config,collect:async()=>facts(),score:async()=>{aiCalls++;return {status:'not_configured',message:'No key'};}}});
  try{
    for(const payload of [{...example('native'),score:0},{...example('native'),rpcUrl:'https://evil.example'},{...example('native'),checks:[]}]) assert.equal((await app.inject({method:'POST',url:'/api/security/scan',headers:header,payload})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:'/api/security/scan',payload:example('native')})).statusCode,403);
    const scan=await app.inject({method:'POST',url:'/api/security/scan',headers:header,payload:example('native')});assert.equal(scan.statusCode,200);assert.equal(scan.json().score,null);assert.equal(scan.json().ai.status,'not_configured');assert.equal(store.securityList().length,1);
    const count=aiCalls;const demo=await app.inject({method:'POST',url:'/api/security/demo/operator',headers:header,payload:{}});assert.equal(demo.json().source,'demo');assert.equal(aiCalls,count);assert.equal(store.securityList().length,2);
    const status=(await app.inject({method:'GET',url:'/api/security/status'})).json();assert.ok(!JSON.stringify(status).includes('apiKey'));assert.ok(status.coverage.length>=8);
    assert.equal((await app.inject({method:'GET',url:`/api/security/records/${scan.json().id}/evidence`})).statusCode,200);
  }finally{await app.close();store.close();}
});

test('phishing lookups omit URL credentials, query and fragment; their known risk remains visible',async()=>{
  const request=example('native');request.origin='https://user:password@bad.example/path?private=secret#private';
  const urls:string[]=[];
  const collect=collector({...config,lookups:true},async(url)=>{urls.push(String(url));return new Response(JSON.stringify({code:1,result:String(url).includes('phishing_site')?{phishing_site:1}:{}}));});
  const data=await collect(request,decodeRequest(request));
  assert.ok(data.some(e=>e.id==='website_reputation'&&e.status==='risk'));
  assert.ok(urls.some(u=>u.includes(encodeURIComponent('https://bad.example'))));
  assert.ok(!urls.join('').includes('password'));assert.ok(!urls.join('').includes('secret'));
});
test('daily model quota is atomic, failed models retain one durable report, and secrets never appear in status',async()=>{
  const store=createStore(':memory:');for(let i=0;i<30;i++)assert.equal(store.securityAiAttempt(),true);assert.equal(store.securityAiAttempt(),false);
  let called=0;const app=await buildApp(store,{security:{config:async()=>({...config,apiKey:'never-echo-this'}),collect:async()=>facts(),score:async()=>{called++;throw Error('failure');}}});
  try{
    const response=await app.inject({method:'POST',url:'/api/security/scan',headers:header,payload:example('approve')});
    assert.equal(response.statusCode,200);assert.equal(response.json().ai.status,'disabled');assert.equal(called,0);assert.equal(store.securityList().length,1);assert.ok(!response.body.includes('never-echo-this'));
  }finally{await app.close();store.close();}
  const other=createStore(':memory:');const failing=await buildApp(other,{security:{config:async()=>({...config,apiKey:'test'}),collect:async()=>facts(),score:async()=>{throw Error('secret-in-error');}}});
  try{const response=await failing.inject({method:'POST',url:'/api/security/scan',headers:header,payload:example('approve')});assert.equal(response.json().ai.status,'failed');assert.equal(response.json().scoreSource,'none');assert.equal(response.json().score,null);assert.equal(other.securityList().length,1);assert.ok(!response.body.includes('secret-in-error'));}
  finally{await failing.close();other.close();}
});

test('a mocked Responses result updates the original check, keeps evidence gaps and spends one local quota slot',async()=>{
  const store=createStore(':memory:');let requests=0;
  const fakeModel:typeof fetch=async(_url,init)=>{
    requests++;const body=JSON.parse(String(init?.body));const packet=JSON.parse(body.input);
    assert.equal(packet.requestSummary.valueWei,'0');assert.ok(packet.operation.fields.spender);
    return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({...modelDimensions(),score:85,assessment:'high',summary:'测试模型指出授权范围风险',reasons:[{text:'权限范围较大',evidence_ids:['permission_scope']}],missing_data:[],suggested_action:'核对授权对象',honeypot:'unknown'})}]}]}));
  };
  const app=await buildApp(store,{security:{config:async()=>({...config,apiKey:'mock-key'}),collect:async()=>facts(),score:(report,c)=>scoreWithAI(report,c,fakeModel)}});
  try {
    const response=await app.inject({method:'POST',url:'/api/security/scan',headers:header,payload:example('approve')});
    assert.equal(response.statusCode,200);const report=response.json();assert.equal(report.ai.status,'completed');assert.equal(report.score,85);assert.equal(report.scoreSource,'ai');assert.equal(report.level,'high');assert.equal(report.complete,false);assert.ok(report.ai.result.missing_data.includes('Off-chain purpose is unverified'));
    assert.equal(requests,1);assert.equal(store.securityAiCallsToday(),1);assert.equal(store.securityList().length,1);assert.equal(store.securityGet(report.id)?.score,85);
  } finally {await app.close();store.close();}
});
