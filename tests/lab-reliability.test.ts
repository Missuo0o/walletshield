import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Fastify from 'fastify';
import {createStore} from '../src/server/store.js';
import {buildApp} from '../src/server/app.js';
import {hostedLabAccess} from '../src/testing/hosted-access.js';
import {registerLab} from '../src/testing/api.js';
import {matchLabReport,newLabSession} from '../src/testing/sessions.js';
import {assess} from '../src/security/rules.js';
import type {SecurityRequest} from '../src/security/types.js';
import type {WalletAuth,WalletPrincipal} from '../src/server/wallet-auth.js';

const alice='0x'+'a'.repeat(40),bob='0x'+'b'.repeat(40);
const request=(from=alice,chainId=31338):SecurityRequest=>({kind:'signature',chainId,origin:'https://walletshield.example',signature:{from,method:'personal_sign',data:'0x6869'}});

test('lab daily mutation cap survives login cleanup and restart, then resets on the next UTC day',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'walletshield-lab-budget-')),path=join(dir,'state.sqlite');
 let store=createStore(path),time=Date.parse('2030-01-01T12:00:00Z');
 try{
  let access=hostedLabAccess({} as WalletAuth,store,()=>time);
  for(let i=0;i<40;i++){
   if(i%4===0)time+=60000;
   store.authPrune(new Date(time).toISOString());
   assert.equal(access.mutation(alice),true);
  }
  time+=60000;store.authPrune(new Date(time).toISOString());
  assert.equal(access.mutation(alice),false,'a login must not erase the daily limit');
  store.close();store=createStore(path);access=hostedLabAccess({} as WalletAuth,store,()=>time);
  assert.equal(access.mutation(alice),false,'budget survives restart');
  assert.equal(access.mutation(bob),true,'independent wallet budget');
  time=Date.parse('2030-01-02T00:00:00Z');store.authPrune(new Date(time).toISOString());
  assert.equal(access.mutation(alice),true);
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});

test('surviving legacy daily counters migrate before auth pruning',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'walletshield-lab-migration-')),path=join(dir,'state.sqlite');
 let store=createStore(path);const now=Date.parse('2030-01-01T12:00:00Z'),day=Math.floor(now/86400000);
 try{
  for(let i=0;i<40;i++)assert.equal(store.authRateAttempt('test-lab:daily:'+alice,day,40),true);
  store.close();store=createStore(path);store.authPrune(new Date(now).toISOString());
  assert.equal(store.labDailyAttempt(alice,day,40),false);
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});

test('hosted lab returns a wallet history even after more than 100 other-wallet sessions',async()=>{
 const store=createStore(':memory:'),app=Fastify();
 const principal:WalletPrincipal={address:alice,id:'1'.repeat(64),kind:'web',expiresAt:'2100-01-01T00:00:00Z'};
 const access=hostedLabAccess({authenticate:()=>principal} as unknown as WalletAuth,store);
 registerLab(app,store,{hosted:{origin:'https://walletshield.example',access}});
 const mine=newLabSession('message',request()).session;mine.createdAt='2030-01-01T00:00:00Z';store.labSave(mine);
 for(let i=0;i<105;i++){const s=newLabSession('message',request(bob)).session;s.createdAt='2030-01-02T00:00:00Z';store.labSave(s);}
 try{
  const response=await app.inject({url:'/api/lab/sessions'});
  assert.equal(response.statusCode,200);assert.deepEqual(response.json().map((s:any)=>s.id),[mine.id]);
  assert.equal(store.labList(bob).length,100);
 }finally{await app.close();store.close();}
});

test('lab signature reports cannot cross explicit network bindings',()=>{
 const {session}=newLabSession('message',request(alice,1));
 const report=assess(request(alice,11155111),[]);report.createdAt=new Date(Date.parse(session.createdAt)+1).toISOString();
 assert.equal(matchLabReport([session],report),null);
 report.request.chainId=1;assert.equal(matchLabReport([session],report)?.reportId,report.id);
 report.request.chainId=0;assert.equal(matchLabReport([session],report),null);
 session.request.chainId=0;assert.equal(matchLabReport([session],report)?.reportId,report.id);
});

test('a late wallet result preserves an attached report and cannot overwrite an earlier outcome',()=>{
 const store=createStore(':memory:'),{session}=newLabSession('message',request());
 try{
  store.labSave(session);
  const first={...session,status:'signed' as const},late={...session,status:'rejected' as const};
  store.labSave({...session,reportId:'actual-snap-report'});
  assert.equal(store.labFinish(first)?.reportId,'actual-snap-report');
  assert.equal(store.labFinish(late),null);
  assert.equal(store.labGet(session.id)?.status,'signed');
  assert.equal(store.labGet(session.id)?.reportId,'actual-snap-report');
  assert.equal(store.labFinish({...late,id:'nonexistent'}),null);
  assert.throws(()=>store.labFinish(session),/completed wallet outcome/);
 }finally{store.close();}
});

test('an explicit Snap session can link beyond the global latest-100 window without linking a different request',async()=>{
 const store=createStore(':memory:'),snapToken='b'.repeat(64);
 const app=await buildApp(store,{security:{config:async()=>({apiKey:'',model:'muse-wonder-1.0',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{},snapToken}),collect:async()=>[]}});
 try{
  const {session}=newLabSession('message',request());session.createdAt=new Date(Date.now()-1000).toISOString();store.labSave(session);
  for(let i=0;i<105;i++)store.labSave(newLabSession('message',request(bob)).session);
  assert.ok(!store.labList().some(s=>s.id===session.id));
  const headers={origin:'null',authorization:`Bearer ${snapToken}`,'X-WalletShield-Test-Session':session.id};
  const wrong=await app.inject({method:'POST',url:'/api/security/scan',headers,payload:request(bob)});
  assert.equal(wrong.statusCode,200);assert.equal(store.labGet(session.id)?.reportId,undefined);
  const scan=await app.inject({method:'POST',url:'/api/security/scan',headers,payload:session.request});
  assert.equal(scan.statusCode,200);assert.equal(store.labGet(session.id)?.reportId,scan.json().id);
 }finally{await app.close();store.close();}
});
