import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeRpcParams,sensitiveRpcField} from '../src/security/rpc-redaction.js';
import {normalizeProviderRequest} from '../src/integration/provider.js';
import {buildApp} from '../src/server/app.js';
import {createStore} from '../src/server/store.js';
import {evidencePacket} from '../src/security/ai.js';
import type {SecurityConfig} from '../src/security/config.js';
import type {SecurityRequest} from '../src/security/types.js';
const account=`0x${'11'.repeat(20)}`,target=`0x${'22'.repeat(20)}`,entryPoint=`0x${'33'.repeat(20)}`,headers={origin:'http://127.0.0.1:5173'},config:SecurityConfig={apiKey:'offline-test-key',model:'not-called',aiEnabled:true,lookups:false,goPlusToken:'',rpc:{}};
const secretKeys=['privateKey','private_key','secret','secretKey','mnemonic','password','passphrase','seed','seed_phrase','apiKey','accessToken','auth_token','bearerToken','refresh-token','sessionKey','session_key','signature','signatures','paymasterSignature','ownerSignature'];
const secrets=()=>Object.fromEntries(secretKeys.map((key,index)=>[key,`DO_NOT_RETAIN_SECRET_${index}`]));
const userOperation=()=>({sender:account,nonce:'0x0',initCode:'0x',callData:'0x12345678',callGasLimit:'0x1000',verificationGasLimit:'0x2000',preVerificationGas:'0x100',maxFeePerGas:'0x10',maxPriorityFeePerGas:'0x1',paymasterAndData:'0x',signature:'DO_NOT_RETAIN_USEROP_SIGNATURE'});
test('RPC sanitation removes known credentials and signature aliases while keeping exact public addresses and reporting every bound',()=>{
 const input={...secrets(),sessionKey:account,session_key:target,token:target,nested:[{...secrets(),publicKey:'0x1234'}]},copy=structuredClone(input),sanitized=sanitizeRpcParams(input);assert.equal(sanitized.removed,true);assert.equal(sanitized.truncated,false);assert.ok(!JSON.stringify(sanitized.params).includes('DO_NOT_RETAIN'));assert.equal((sanitized.params as any).sessionKey,account);assert.equal((sanitized.params as any).session_key,target);assert.equal((sanitized.params as any).token,target);assert.equal((sanitized.params as any).nested[0].publicKey,'0x1234');assert.deepEqual(input,copy);
 for(const key of secretKeys)assert.equal(sensitiveRpcField(key,'sensitive'),true,key);assert.equal(sensitiveRpcField('sessionKey',account),false);
 const wide=sanitizeRpcParams({items:Array.from({length:65},(_,index)=>index)});assert.equal(wide.truncated,true);assert.equal((wide.params as any).items.length,64);
 const many=sanitizeRpcParams({rows:Array.from({length:64},()=>Object.fromEntries(Array.from({length:64},(_,index)=>[`field${index}`,index])))});assert.equal(many.truncated,true,'Total node count must be bounded as well as each container.');
 let deep:any={leaf:'unobserved'};for(let i=0;i<10;i++)deep={next:deep};assert.equal(sanitizeRpcParams(deep).truncated,true);
});
test('SDK connection, permission and UserOperation inputs are sanitized without introducing signature validity claims',()=>{
 const context={chainId:1,account,origin:'https://dapp.example'};
 for(const [method,params] of [['wallet_grantPermissions',[{owner:account,...secrets(),sessionKey:target}]],['eth_sendUserOperation',[{...userOperation(),...secrets()},entryPoint]]] as const){const normalized=normalizeProviderRequest({method,params:[...params]},context),serialized=JSON.stringify(normalized);assert.ok(!serialized.includes('DO_NOT_RETAIN'));assert.ok(!serialized.includes('signature'));assert.equal(normalized.kind,method==='eth_sendUserOperation'?'user_operation':'permission');}
 const connect=normalizeProviderRequest({method:'eth_requestAccounts'},context);assert.deepEqual(connect.kind==='permission'?connect.params:null,[]);
});
test('API sanitizes new non-signature RPC requests before collectors, persistence and model packets; oversized structures remain explicit unknown',async()=>{
 const store=createStore(':memory:'),collected:SecurityRequest[]=[],modelPackets:any[]=[];
 const app=await buildApp(store,{security:{config:async()=>config,collect:async request=>{collected.push(structuredClone(request));assert.ok(!JSON.stringify(request).includes('DO_NOT_RETAIN'));return [];},score:async report=>{modelPackets.push(evidencePacket(report));assert.ok(!JSON.stringify(report.request).includes('DO_NOT_RETAIN'));assert.ok(!JSON.stringify(evidencePacket(report)).includes('DO_NOT_RETAIN'));return {status:'not_configured',message:'Offline injected scorer; no provider call.'};}}});
 try{
  const payloads:Extract<SecurityRequest,{kind:'permission'|'user_operation'|'wallet_rpc'}>[]=[{kind:'permission',chainId:1,origin:'https://dapp.example',method:'wallet_grantPermissions',params:[{owner:account,...secrets(),sessionKey:target}]},{kind:'user_operation',chainId:1,method:'eth_sendUserOperation',params:[{...userOperation(),nested:{...secrets()}},entryPoint]},{kind:'permission',chainId:1,method:'wallet_createSession',params:[{owner:account,grants:Array.from({length:65},()=>({target,value:'1'}))}]}];
  for(const payload of payloads){const response=await app.inject({method:'POST',url:'/api/security/scan',headers,payload});assert.equal(response.statusCode,200,response.body);assert.ok(!response.body.includes('DO_NOT_RETAIN'));const result=response.json(),redaction=result.checks.find((check:any)=>check.id==='unsigned_input_redaction');assert.ok(redaction);assert.equal(redaction.status,'unknown');assert.equal(result.score,null);assert.equal(result.scoreSource,'none');assert.equal(redaction.data.signatureValidationPerformed,false);if(payload.method==='wallet_createSession'){assert.equal(redaction.data.structureTruncated,true);assert.equal(result.complete,false);}else assert.equal(redaction.data.sensitiveFieldsRemoved,true);}
  assert.equal(collected.length,3);assert.equal(modelPackets.length,3);assert.equal(store.securityList().length,3);for(const record of store.securityList()){const full=store.securityGet(record.id)!;assert.ok(!JSON.stringify(full).includes('DO_NOT_RETAIN'));const saved=JSON.stringify(full.request);assert.ok(!saved.includes('signature'));}
 }finally{await app.close();store.close();}
});
