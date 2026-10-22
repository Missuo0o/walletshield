import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, encodeFunctionResult, decodeFunctionData, parseAbi } from 'viem';
import { decodeRequest } from '../src/security/decode.js';
import { extendedAbi, rpcSummary } from '../src/security/operations.js';
import { planRequest } from '../src/security/routing.js';
import { protocolEvidence } from '../src/security/protocols.js';
import { assess } from '../src/security/rules.js';
import { evidencePacket, scoreWithAI } from '../src/security/ai.js';
import { securityExamples } from '../src/security/examples.js';
import { requestSchema, type SecurityRequest } from '../src/security/types.js';
import type { SecurityConfig } from '../src/security/config.js';
import { createStore } from '../src/server/store.js';
import { buildApp } from '../src/server/app.js';
import { coverageForCategory } from '../src/security/coverage.js';
import { operationLines, missingLines } from '../src/security/display.js';
const config:SecurityConfig={apiKey:'',model:'fixture',aiEnabled:true,lookups:false,goPlusToken:'',rpc:{31337:'http://127.0.0.1:9999'}};
const from='0x2222222222222222222222222222222222222222',to='0x1111111111111111111111111111111111111111';
const example=(id:string)=>structuredClone(securityExamples.find(e=>e.id===id)!.request);
const tx=(method:string,args:readonly unknown[]):SecurityRequest=>({kind:'transaction',chainId:31337,transaction:{from,to,data:encodeFunctionData({abi:extendedAbi,functionName:method as any,args:args as any})}});
const readAbi=parseAbi(['function owner() view returns(address)','function paused() view returns(bool)','function asset() view returns(address)','function totalAssets() view returns(uint256)','function totalSupply() view returns(uint256)','function previewDeposit(uint256) view returns(uint256)','function maxDeposit(address) view returns(uint256)','function getUserAccountData(address) view returns(uint256,uint256,uint256,uint256,uint256,uint256)','function getConfiguration(address) view returns((uint256 data))']);
function rpcFixture(overrides:Record<string,unknown>={},badChain=false){const calls:any[]=[];const fetcher:typeof fetch=async(url,init)=>{
 assert.equal(url,config.rpc[31337]);const body=JSON.parse(String(init?.body));calls.push(body);assert.ok(['eth_chainId','eth_blockNumber','eth_getCode','eth_getStorageAt','eth_call'].includes(body.method));
 let result:unknown=body.method==='eth_chainId'?(badChain?'0x1':'0x7a69'):body.method==='eth_blockNumber'?'0x2a':body.method==='eth_getCode'?'0x6000':`0x${'00'.repeat(32)}`;
 if(body.method==='eth_call'){assert.equal(body.params[1],'0x2a');const d=decodeFunctionData({abi:readAbi,data:body.params[0].data});const values:Record<string,unknown>={owner:from,paused:false,asset:to,totalAssets:1000n,totalSupply:900n,previewDeposit:90n,maxDeposit:100000n,getUserAccountData:[2000n,1000n,100n,8000n,7500n,900000000000000000n],getConfiguration:{data:1n},...overrides};if(values[d.functionName]===null)return new Response(JSON.stringify({error:{code:-32000}}));result=encodeFunctionResult({abi:readAbi,functionName:d.functionName,result:values[d.functionName] as any});}
 if(['eth_getCode','eth_getStorageAt'].includes(body.method))assert.equal(body.params.at(-1),'0x2a');return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result}));};return {calls,fetcher};}

test('all example families choose an AI route; unknown calldata and RPC never bypass the plan',()=>{
 assert.equal(securityExamples.length,25);
 for(const {id,request} of securityExamples){assert.ok(requestSchema.safeParse(request).success,id);const op=decodeRequest(request),plan=planRequest(request,op,config);assert.ok((plan.data?.tools as any[]).some(t=>t.tool==='ai_assessment'&&t.selected),id);}
 const unknown=example('native') as Extract<SecurityRequest,{kind:'transaction'}>;unknown.transaction.data='0x12345678';assert.equal(decodeRequest(unknown).decoded,false);assert.ok(assess(unknown,[]).checks.some(c=>c.id==='tool_plan'));
});
test('protocol candidates select separate evidence and ABI appearance never asserts identity',()=>{
 for(const [id,tool] of [['vault','vault_preview'],['lending','lending_account'],['staking','protocol_limits'],['bridge','protocol_limits']]){const r=example(id),op=decodeRequest(r);assert.ok(op.decoded);assert.match(String(op.fields.protocolIdentity),/unverified/);assert.ok((planRequest(r,op).data?.tools as any[]).find(t=>t.tool===tool)?.selected);}
 const mint=decodeRequest(tx('mint',[from,7n]));assert.equal(mint.category,'mint_burn');assert.equal(mint.fields.amountOrId,'7');
 const vault=decodeRequest(tx('mint',[7n,from]));assert.equal(vault.category,'vault');
 const bad=tx('deposit',[100n,from]) as Extract<SecurityRequest,{kind:'transaction'}>;bad.transaction.data+='00';assert.equal(decodeRequest(bad).decoded,false);
});
test('V3 single and packed reverse paths preserve direction, limits, and malformed paths remain unknown',()=>{
 const request=tx('exactInputSingle',[{tokenIn:to,tokenOut:from,fee:3000,recipient:from,amountIn:100n,amountOutMinimum:99n,sqrtPriceLimitX96:0n}]);assert.equal(decodeRequest(request).category,'swap_v3');assert.equal(decodeRequest(request).fields.amountOutMinimum,'99');
 const path=`${to}000bb8${from.slice(2)}`;const reverse=decodeRequest(tx('exactOutput',[{path,recipient:from,deadline:2000000000n,amountOut:1n,amountInMaximum:100n}]));assert.deepEqual(reverse.fields.tokens,[from,to]);
 assert.equal(decodeRequest(tx('exactInput',[{path:'0x1234',recipient:from,deadline:2000000000n,amountIn:1n,amountOutMinimum:0n}])).decoded,false);
});
test('wallet parameters retain network origins, session scope and financial claims without raw bytes or secrets',()=>{
 const op=rpcSummary('wallet_addEthereumChain',{chainId:'0x1',rpcUrls:['https://user:password@node.example/private?apikey=secret'],permissions:{scope:'transfer',limit:'100',expiry:'2000000000'},calls:[{to,data:'0x12345678aabb'}],privateKey:'DO_NOT_SEND',signature:'SIGNED_BYTES'});
 const text=JSON.stringify(op);assert.ok(text.includes('https://node.example'));assert.ok(text.includes('limit=100'));assert.ok(text.includes('selector=0x12345678'));for(const secret of ['password','apikey','DO_NOT_SEND','SIGNED_BYTES','12345678aabb'])assert.ok(!text.includes(secret));assert.equal(op.category,'network_config');assert.ok(op.decoded===false);
 assert.equal(rpcSummary('wallet_getCapabilities',{}).category,'read_only');assert.equal(rpcSummary('wallet_grantPermissions',{}).addsPermission,true);
});
test('vault collection verifies chain, pins every read and retains independent actual return values',async()=>{
 const fixture=rpcFixture();const request=example('vault'),checks=await protocolEvidence(request,decodeRequest(request),config,fixture.fetcher);const context=checks.find(c=>c.id==='vault_context')!;
 assert.equal(context.status,'pass');assert.equal(context.data?.previewDeposit,'90');assert.equal(context.data?.totalAssets,'1000');assert.equal(context.data?.identityVerified,false);assert.equal(context.data?.blockNumber,'42');assert.ok(checks.some(c=>c.id==='contract_controls'&&c.data?.codeHash));assert.ok(fixture.calls.every(c=>!c.method.includes('send')));
 const packet=evidencePacket(assess(request,checks));assert.ok(JSON.stringify(packet).includes('previewDeposit'));assert.notEqual(assess(request,checks).level,'low');
});
test('failed vault interfaces and wrong networks remain unknown instead of guessed previews',async()=>{
 const request=example('vault');const missing=await protocolEvidence(request,decodeRequest(request),config,rpcFixture({previewDeposit:null}).fetcher);assert.equal(missing.find(c=>c.id==='vault_context')?.status,'unknown');
 const wrong=rpcFixture({},true);const checks=await protocolEvidence(request,decodeRequest(request),config,wrong.fetcher);assert.ok(checks.some(c=>c.status==='unknown'));assert.equal(wrong.calls.length,1);
});
test('lending reads pre-operation health factor and distinguishes liquidation signal from a future guarantee',async()=>{
 const request=example('lending');const checks=await protocolEvidence(request,decodeRequest(request),config,rpcFixture().fetcher);assert.equal(checks.find(c=>c.id==='lending_context')?.data?.healthFactor,'900000000000000000');assert.ok(checks.some(c=>c.id==='liquidation_risk'&&c.status==='risk'));assert.match(checks.find(c=>c.id==='lending_context')!.detail,/does not calculate post-operation/);assert.equal(assess(request,checks).level,'high');
});
test('generic RPC requests are summarized, never sent to an execution or external endpoint',async()=>{
 let calls=0;for(const id of ['send-calls','network','unknown-rpc','permission','user-operation']){const r=example(id);const checks=await protocolEvidence(r,decodeRequest(r),config,async()=>{calls++;throw Error('Forbidden');});assert.ok(checks.some(c=>c.id==='rpc_semantics'&&c.status==='unknown'));}assert.equal(calls,0);
});
test('fee parameters reach the model packet as exact integers; absent and excessive budgets are explicit',()=>{
 const r=example('native') as Extract<SecurityRequest,{kind:'transaction'}>;r.transaction.gas='0x5208';r.transaction.maxFeePerGas='0xffffffffffffffffffff';const report=assess(r,[]);assert.equal(evidencePacket(report).feeParameters?.maxFeePerGas,String(BigInt(r.transaction.maxFeePerGas)));assert.ok(report.checks.some(c=>c.id==='fee_budget'));
 assert.ok(assess(example('native'),[]).checks.some(c=>c.id==='fee_budget'&&c.status==='unknown'));
});
test('API sends unknown, vault and permission evidence to the scoring stage, saves one report per operation and never auto-signs',async()=>{
 const store=createStore(':memory:');const seen:string[]=[];const app=await buildApp(store,{security:{config:async()=>({...config,apiKey:'fixture-key'}),collect:async(r,op)=>[planRequest(r,op,config)],score:async(report)=>{seen.push(report.operation.category);return {status:'completed',message:'mocked',result:{score:80,assessment:'high',summary:'fixture',reasons:[{text:'缺少协议证据',evidence_ids:['tool_plan']}],missing_data:report.missingData,suggested_action:'核实',honeypot:'unknown',model:'fixture',generatedAt:new Date().toISOString()}};}}});
 try{for(const id of ['unknown-rpc','vault','permission']){const response=await app.inject({method:'POST',url:'/api/security/scan',headers:{origin:'http://127.0.0.1:5173'},payload:example(id)});assert.equal(response.statusCode,200);assert.equal(response.json().scoreSource,'ai');assert.equal(response.json().score,80);}assert.deepEqual(seen,['wallet_rpc','vault','permission']);assert.equal(store.securityList().length,3);}finally{await app.close();store.close();}
});
test('API failures map only safe error codes and never disclose provider messages or pretend a score exists',async()=>{
 const report=assess(example('native'),[]);const result=await scoreWithAI(report,{...config,apiKey:'fixture-key'},async()=>new Response(JSON.stringify({error:{code:'insufficient_quota',message:'DO_NOT_ECHO_ACCOUNT_DETAILS'}}),{status:429}));assert.equal(result.status,'failed');assert.match(result.message,/quota is insufficient/);assert.ok(!result.message.includes('DO_NOT_ECHO'));assert.ok(!result.result);
});

test('coverage descriptions distinguish automatic wallet hooks from manual requests and keep unsupported semantics explicit',()=>{
 for(const id of ['native','token-transfer','approve','vault','lending','bridge'])assert.equal(coverageForCategory(decodeRequest(example(id)).category).entry,'transaction',id);
 for(const id of ['permit','permit2','message'])assert.equal(coverageForCategory(decodeRequest(example(id)).category).entry,'signature',id);
 for(const id of ['permission','user-operation','network'])assert.equal(coverageForCategory(decodeRequest(example(id)).category).entry,'manual',id);
 assert.equal(coverageForCategory('unimplemented-future-protocol').id,'unknown');
 assert.match(coverageForCategory('swap_v3').uncertain,/V3 round trips/);assert.match(coverageForCategory('bridge').uncertain,/Destination chain ID, arrival/);
});
test('wallet display bounds facts and preserves exact raw units and total missing count without showing raw calldata',()=>{
 const lines=operationLines({fields:{recipient:from,amount:'900719925474099300000',data:'DO_NOT_SHOW',messagePreview:'DO_NOT_SHOW',tokens:Array(10).fill(to),deadline:'2',method:'long'.repeat(100),action:'deposit',owner:to}});
 assert.ok(lines.length<=6);assert.ok(lines.some(v=>v.includes('900719925474099300000')));assert.ok(lines.every(v=>v.length<210));assert.ok(!lines.join('').includes('DO_NOT_SHOW'));
 const missing=missingLines({checks:[],missingData:['a','b','c','d','e','f','g'],ai:{result:{missing_data:['a','h']}}});assert.equal(missing.total,8);assert.equal(missing.items.length,6);
});
test('coverage guide downloads current case explanations without invoking tools, AI or adding a wallet record',async()=>{
 const store=createStore(':memory:');let called=0;const app=await buildApp(store,{security:{config:async()=>config,collect:async()=>{called++;return [];},score:async()=>{called++;throw Error('Forbidden');}}});
 try{const r=await app.inject({method:'GET',url:'/api/security/coverage-guide',headers:{origin:'http://127.0.0.1:5173'}});assert.equal(r.statusCode,200);assert.match(r.headers['content-type']!,/text\/markdown/);assert.match(String(r.headers['content-disposition']),/attachment/);assert.ok(r.body.includes('future'));assert.ok(r.body.includes('Read-only wallet RPC'));assert.ok(r.body.includes('0.4.1'));assert.equal(called,0);assert.equal(store.securityList().length,0);assert.equal((await app.inject({method:'GET',url:'/api/security/coverage-guide',headers:{origin:'https://foreign.example'}})).statusCode,403);}finally{await app.close();store.close();}
});
