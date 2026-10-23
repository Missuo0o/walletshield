import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {createHash} from 'node:crypto';
import {createStore} from '../src/server/store.js';
import {registerWalletAuth} from '../src/server/wallet-auth.js';
import {registerSecurity} from '../src/security/api.js';
import type {Collector} from '../src/security/providers.js';
const origin='https://walletshield.example',address='0x'+'1'.repeat(40),token='a'.repeat(64),headers={origin,authorization:`Bearer ${token}`};
const payload={kind:'transaction',chainId:1,transaction:{from:address,to:'0x'+'2'.repeat(40),data:'0x'}};
async function fixture(collect:Collector,score?:()=>Promise<any>){
 const store=createStore(':memory:'),app=Fastify(),auth=registerWalletAuth(app,store,{enabled:true,origin});
 const principal={id:createHash('sha256').update(token).digest('hex'),address,kind:'web' as const,expiresAt:new Date(Date.now()+3600000).toISOString()};store.authTokenSave({...principal,createdAt:new Date().toISOString()});
 registerSecurity(app,store,{access:{service:{mode:'hosted',origin,origins:[origin],hosts:['walletshield.example'],walletDailyLimit:10,maxScans:3,scanWalletDailyLimit:1},auth},config:async()=>({apiKey:score?'offline-fixture':'',model:'muse-wonder-1.0',aiEnabled:!!score,lookups:false,goPlusToken:'',rpc:{}}),collect,score});
 return {app,store,scan:()=>app.inject({method:'POST',url:'/api/security/scan',headers,payload}),remove:()=>app.inject({method:'POST',url:'/api/wallet-auth/reports/delete',headers,payload:{confirm:true}}),revoke:()=>app.inject({method:'POST',url:'/api/wallet-auth/revoke',headers,payload:{}}),close:async()=>{await app.close();store.close();}};
}
test('hosted evidence quota is reserved before any RPC, fork or model work',async()=>{
 let calls=0;const f=await fixture(async()=>{calls++;return [];});try{assert.equal((await f.scan()).statusCode,200);assert.equal(calls,1);const denied=await f.scan();assert.equal(denied.statusCode,429);assert.match(denied.json().error,/No evidence collection/);assert.equal(calls,1);assert.equal(f.store.securityList().length,1);}finally{await f.close();}
});
test('revocation during collection prevents owner insertion, report writes and model work',async()=>{
 let entered!:()=>void,release!:()=>void,modelCalls=0;const started=new Promise<void>(resolve=>entered=resolve),gate=new Promise<void>(resolve=>release=resolve);
 const f=await fixture(async()=>{entered();await gate;return [];},async()=>{modelCalls++;return {status:'disabled',message:'Offline only'};});
 try{const running=f.scan();await started;assert.equal((await f.revoke()).statusCode,200);release();assert.equal((await running).statusCode,401);assert.equal(modelCalls,0);assert.deepEqual(f.store.securityList(),[]);}finally{release();await f.close();}
});
test('confirmed deletion during an in-flight model request cannot resurrect reports or return its output',async()=>{
 let entered!:()=>void,release!:()=>void;const started=new Promise<void>(resolve=>entered=resolve),gate=new Promise<void>(resolve=>release=resolve);
 const f=await fixture(async()=>[],async()=>{entered();await gate;return {status:'disabled',message:'Offline only'};});
 try{const running=f.scan();await started;assert.equal(f.store.securityList().length,1);const removed=await f.remove();assert.equal(removed.statusCode,200);assert.equal(removed.json().reportsDeleted,1);release();assert.equal((await running).statusCode,401);assert.deepEqual(f.store.securityList(),[]);}finally{release();await f.close();}
});
