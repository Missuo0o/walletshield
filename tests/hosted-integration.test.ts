import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {buildApp} from '../src/server/app.js';
import {createStore} from '../src/server/store.js';
import type {ServiceConfig} from '../src/server/service-config.js';
import type {AIState,SecurityRequest} from '../src/security/types.js';
import {AI_DIMENSIONS} from '../src/security/types.js';
import type {SecurityOptions} from '../src/security/api.js';
import type {SecurityConfig} from '../src/security/config.js';
// Synthetic offline accounts. These tests never access real wallets, RPCs, or AI.
const accounts=[1,2,3,4].map(n=>privateKeyToAccount(`0x${String(n).repeat(64)}` as `0x${string}`));
const origin='https://walletshield.example',host='walletshield.example';
const service:ServiceConfig={mode:'hosted',origin,origins:[origin],hosts:[host],walletDailyLimit:1,maxScans:3};
const configuration:SecurityConfig={apiKey:'mock-model-key-only',model:'muse-wonder-1.0',aiEnabled:true,aiDailyLimit:100,lookups:false,goPlusToken:'',forkEnabled:false,rpc:{11155111:'https://rpc.fixture.invalid'},snapToken:'f'.repeat(64)};
const webHeaders=(token?:string)=>({host,origin,...(token?{authorization:`Bearer ${token}`}:{})});
const snapHeaders=(token:string)=>({host,origin:'null',authorization:`Bearer ${token}`});
function request(account=accounts[0]):SecurityRequest{return {kind:'transaction',chainId:11155111,origin:'https://external-dapp.example',transaction:{from:account.address,to:accounts[3].address,data:'0x',value:'0x1'}};}
function completed():AIState{return {status:'completed',message:'Synthetic model output; no external call.',result:{score:33,assessment:'review',summary:'Offline hosted integration fixture.',reasons:[{text:'Synthetic evidence only.',evidence_ids:['operation']}],missing_data:[],suggested_action:'Inspect the actual request.',honeypot:'unknown',model:'muse-wonder-1.0',generatedAt:new Date().toISOString(),evidence_confidence:'limited',dimensions:AI_DIMENSIONS.map(dimension=>({dimension,assessment:'unknown',reason:'Synthetic integration result.',evidence_ids:['operation']}))}};}
async function fixture(options:{collect?:SecurityOptions['collect'];aiDailyLimit?:number;maxScans?:number;walletDailyLimit?:number}={}){
 const store=createStore(':memory:');let scoreCalls=0,collectCalls=0,networkCalls=0;
 const app=await buildApp(store,{service:{...service,...(options.maxScans?{maxScans:options.maxScans}:{}),...(options.walletDailyLimit?{walletDailyLimit:options.walletDailyLimit}:{})},security:{config:async()=>({...configuration,aiDailyLimit:options.aiDailyLimit??100}),collect:async(req,op)=>{collectCalls++;return options.collect?options.collect(req,op):[];},score:async()=>{scoreCalls++;return completed();}},networkProbe:async(_url,chainId,address)=>{networkCalls++;return {chainId,network:'Sepolia',checkedAt:new Date().toISOString(),blockNumber:'1',blockHash:'0x'+'a'.repeat(64),blockTime:new Date().toISOString(),latencyMs:1,...(address?{account:{address,balanceWei:'0',balanceEth:'0',hasCode:false,delegatedCode:false}}:{})};}});
 return {app,store,counts:()=>({scoreCalls,collectCalls,networkCalls}),close:async()=>{await app.close();store.close();}};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function signup(f:Fixture,account=accounts[0]){
 const c=await f.app.inject({method:'POST',url:'/api/wallet-auth/challenge',headers:webHeaders(),payload:{address:account.address,chainId:11155111}});assert.equal(c.statusCode,200,c.body);
 const challenge=c.json(),signature=await account.signMessage({message:challenge.message});
 const verified=await f.app.inject({method:'POST',url:'/api/wallet-auth/verify',headers:webHeaders(),payload:{id:challenge.id,signature}});assert.equal(verified.statusCode,200,verified.body);
 const web=verified.json();const pair=await f.app.inject({method:'POST',url:'/api/security/pair',headers:webHeaders(web.token),payload:{}});assert.equal(pair.statusCode,200,pair.body);
 const snap=pair.json();assert.notEqual(snap.token,web.token);assert.equal(snap.address,account.address.toLowerCase());return {web,snap,account};
}

test('hosted signup→web session→Snap pairing→actual capture binds the authenticated wallet',async()=>{
 const f=await fixture();try{
  const identity=await signup(f),health=await f.app.inject({url:'/api/security/pair/status',headers:snapHeaders(identity.snap.token)});
  assert.equal(health.statusCode,200,health.body);assert.equal(health.json().paired,true);assert.equal(health.json().mode,'hosted');assert.equal(health.json().address,identity.account.address.toLowerCase());assert.equal(health.headers['cache-control'],'no-store');assert.ok(!health.body.includes(identity.snap.token));
  assert.equal((await f.app.inject({url:'/api/security/pair/status',headers:webHeaders(identity.web.token)})).statusCode,401,'web token is not a paired Snap token');
  assert.equal((await f.app.inject({method:'POST',url:'/api/security/pair',headers:webHeaders(identity.snap.token),payload:{}})).statusCode,401,'Snap cannot mint a fresh pair token');
  const mismatch=await f.app.inject({method:'POST',url:'/api/security/scan',headers:snapHeaders(identity.snap.token),payload:request(accounts[1])});assert.equal(mismatch.statusCode,403);assert.equal(f.counts().collectCalls,0);
  const scan=await f.app.inject({method:'POST',url:'/api/security/scan',headers:snapHeaders(identity.snap.token),payload:request(identity.account)});assert.equal(scan.statusCode,200,scan.body);
  const report=scan.json();assert.equal(report.score,33);assert.equal(report.scoreSource,'ai');assert.equal(report.capture.channel,'paired-snap');assert.equal(report.capture.wallet,identity.account.address.toLowerCase());assert.ok(!scan.body.includes(identity.snap.token));assert.ok(!scan.body.includes(identity.web.token));assert.equal(f.counts().scoreCalls,1);
  const manual=await f.app.inject({method:'POST',url:'/api/security/scan',headers:webHeaders(identity.web.token),payload:request(identity.account)});assert.equal(manual.statusCode,200);assert.equal(manual.json().capture.channel,'workbench');assert.equal(manual.json().score,null,'same wallet cannot evade daily quota by switching token kind');
 }finally{await f.close();}
});

test('hosted history and evidence are isolated by wallet, with no Origin-only authentication',async()=>{
 const f=await fixture();try{
  const alice=await signup(f),bob=await signup(f,accounts[1]);
  for(const [method,url,payload] of [['POST','/api/security/pair',{}],['POST','/api/security/scan',request()],['GET','/api/security/records',undefined],['POST','/api/networks/check',{chainId:11155111,address:accounts[0].address}]] as const){assert.equal((await f.app.inject({method,url,headers:webHeaders(),...(payload?{payload}:{})})).statusCode,401,`${method} ${url}`);}
  const a=await f.app.inject({method:'POST',url:'/api/security/scan',headers:snapHeaders(alice.snap.token),payload:request(alice.account)}),b=await f.app.inject({method:'POST',url:'/api/security/scan',headers:snapHeaders(bob.snap.token),payload:request(bob.account)});assert.equal(a.statusCode,200);assert.equal(b.statusCode,200);
  const aid=a.json().id,bid=b.json().id;
  const listA=await f.app.inject({url:'/api/security/records',headers:webHeaders(alice.web.token)}),listB=await f.app.inject({url:'/api/security/records',headers:webHeaders(bob.web.token)});
  assert.deepEqual(listA.json().map((r:any)=>r.id),[aid]);assert.deepEqual(listB.json().map((r:any)=>r.id),[bid]);
  for(const suffix of ['', '/evidence']){assert.equal((await f.app.inject({url:`/api/security/records/${aid}${suffix}`,headers:webHeaders(alice.web.token)})).statusCode,200);assert.equal((await f.app.inject({url:`/api/security/records/${aid}${suffix}`,headers:webHeaders(bob.web.token)})).statusCode,404);assert.equal((await f.app.inject({url:`/api/security/records/${aid}${suffix}`,headers:webHeaders()})).statusCode,404);}
  assert.equal((await f.app.inject({method:'POST',url:'/api/security/scan',headers:{host,origin:'https://evil.example',authorization:`Bearer ${alice.web.token}`},payload:request()})).statusCode,401);
  assert.equal((await f.app.inject({url:'/api/security/records',headers:{host:'attacker.example',origin,authorization:`Bearer ${alice.web.token}`}})).statusCode,403);
  assert.equal((await f.app.inject({method:'POST',url:'/api/networks/check',headers:webHeaders(alice.web.token),payload:{chainId:11155111,address:bob.account.address}})).statusCode,401);
  assert.equal((await f.app.inject({method:'POST',url:'/api/networks/check',headers:webHeaders(alice.web.token),payload:{chainId:11155111,address:alice.account.address}})).statusCode,200);assert.equal(f.counts().networkCalls,1);
 }finally{await f.close();}
});

test('hosted mode disables lab, legacy, demonstrations, monitors and synthetic model tests',async()=>{
 const f=await fixture();try{
  const identity=await signup(f);
  const routes=[['GET','/api/lab/status'],['POST','/api/lab/prepare'],['POST','/api/lab/begin'],['GET','/api/local'],['POST','/api/local/fund'],['GET','/api/workflow/records'],['POST','/api/workflow/begin'],['GET','/api/records'],['POST','/api/analyze'],['POST','/api/demo/approve'],['GET','/api/scenarios'],['GET','/api/security/examples'],['POST','/api/security/demo/approve'],['GET','/api/security/monitor'],['POST','/api/security/monitor/check'],['GET','/api/security/coverage-guide'],['POST','/api/security/ai/test']] as const;
  for(const [method,url] of routes)for(const suffix of ['', '?x=1']){const r=await f.app.inject({method,url:url+suffix,headers:webHeaders(identity.web.token),...(method==='POST'?{payload:{}}:{})});assert.equal(r.statusCode,404,`${method} ${url}${suffix}: ${r.body}`);}
  for(const url of ['/api/%72ecords','/%61pi/records','/api/security/%6donitor','/api/security/%61i/test'])for(const method of ['GET','POST'] as const){const r=await f.app.inject({method,url,headers:webHeaders(),...(method==='POST'?{payload:{}}:{})});assert.equal(r.statusCode,400,`${method} ${url}`);}
  assert.deepEqual(f.counts(),{scoreCalls:0,collectCalls:0,networkCalls:0});
 }finally{await f.close();}
});

test('hosted local-chain scans are rejected; manual RPC summaries are authenticated web analysis only',async()=>{
 const f=await fixture();try{
  const identity=await signup(f);
  const local=await f.app.inject({method:'POST',url:'/api/security/scan',headers:snapHeaders(identity.snap.token),payload:{...request(),chainId:31337}});assert.equal(local.statusCode,400);assert.equal(f.counts().collectCalls,0);
  const summary={kind:'permission',chainId:1,method:'wallet_requestPermissions',params:[{eth_accounts:{}}]};
  assert.equal((await f.app.inject({method:'POST',url:'/api/security/scan',headers:snapHeaders(identity.snap.token),payload:summary})).statusCode,403);
  const manual=await f.app.inject({method:'POST',url:'/api/security/scan',headers:webHeaders(identity.web.token),payload:summary});assert.equal(manual.statusCode,200);assert.equal(manual.json().capture.channel,'workbench');assert.equal(manual.json().capture.wallet,identity.account.address.toLowerCase());
 }finally{await f.close();}
});

test('hosted revocation makes Snap health and later scans fail, without affecting the web session',async()=>{
 const f=await fixture();try{
  const identity=await signup(f);const revoked=await f.app.inject({method:'POST',url:'/api/wallet-auth/revoke',headers:webHeaders(identity.web.token),payload:{}});assert.equal(revoked.statusCode,200);
  assert.equal((await f.app.inject({url:'/api/security/pair/status',headers:snapHeaders(identity.snap.token)})).statusCode,401);
  assert.equal((await f.app.inject({method:'POST',url:'/api/security/scan',headers:snapHeaders(identity.snap.token),payload:request()})).statusCode,401);
  assert.equal((await f.app.inject({url:'/api/wallet-auth/status',headers:webHeaders(identity.web.token)})).statusCode,200);assert.equal(f.counts().scoreCalls,0);
 }finally{await f.close();}
});

test('per-wallet and global model caps prevent actual scorer calls after either budget is spent',async()=>{
 const f=await fixture({aiDailyLimit:2});try{
  const alice=await signup(f),bob=await signup(f,accounts[1]),charlie=await signup(f,accounts[2]);
  const scan=async(identity:typeof alice)=>{const r=await f.app.inject({method:'POST',url:'/api/security/scan',headers:snapHeaders(identity.snap.token),payload:request(identity.account)});assert.equal(r.statusCode,200,r.body);return r.json();};
  assert.equal((await scan(alice)).score,33);assert.equal((await scan(alice)).score,null);assert.equal(f.counts().scoreCalls,1);
  assert.equal((await scan(bob)).score,33);const overGlobal=await scan(charlie);assert.equal(overGlobal.score,null);assert.equal(overGlobal.ai.status,'disabled');assert.equal(f.counts().scoreCalls,2);assert.equal(f.store.securityAiCallsToday(),2);
  assert.equal(f.store.authAttemptsToday(alice.account.address.toLowerCase()),1);assert.equal(f.store.authAttemptsToday(bob.account.address.toLowerCase()),1);
  assert.equal(f.store.authAttemptsToday(charlie.account.address.toLowerCase()),0,'global denial must not charge the wallet');
 }finally{await f.close();}
});

test('hosted concurrency permits different wallets up to cap and rejects duplicate-wallet work',async()=>{
 let release!:()=>void,started!:()=>void,count=0;
 const gate=new Promise<void>(resolve=>{release=resolve;}),threeStarted=new Promise<void>(resolve=>{started=resolve;});
 const f=await fixture({collect:async()=>{count++;if(count===3)started();await gate;return [];}});let pending:Promise<{statusCode:number}>[]=[];
 try{
  const identities=[];for(const account of accounts)identities.push(await signup(f,account));
  pending=identities.slice(0,3).map(identity=>f.app.inject({method:'POST',url:'/api/security/scan',headers:snapHeaders(identity.snap.token),payload:request(identity.account)}));
  let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([threeStarted,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('three independent scans did not enter collector')),2000);})]);}finally{if(timer)clearTimeout(timer);}
  assert.equal((await f.app.inject({method:'POST',url:'/api/security/scan',headers:snapHeaders(identities[0].snap.token),payload:request(identities[0].account)})).statusCode,429);
  assert.equal((await f.app.inject({method:'POST',url:'/api/security/scan',headers:snapHeaders(identities[3].snap.token),payload:request(identities[3].account)})).statusCode,429);
  release();const results=await Promise.all(pending);assert.ok(results.every(r=>r.statusCode===200));assert.equal(f.counts().scoreCalls,3);
  assert.equal((await f.app.inject({method:'POST',url:'/api/security/scan',headers:snapHeaders(identities[3].snap.token),payload:request(identities[3].account)})).statusCode,200);assert.equal(f.counts().scoreCalls,4);
 }finally{release();await Promise.allSettled(pending);await f.close();}
});
