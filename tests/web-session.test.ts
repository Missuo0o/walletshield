import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebSessionStore,watchCredentialExpiry,setWebSession,webSession,subscribeWebSession,authHeaders,handleWebAuthFailure,type WebSession,type SessionChange} from '../web/src/session.js';
import {labApi} from '../web/src/WalletLab.js';

const account=`0x${'1'.repeat(40)}`,base=Date.parse('2026-10-24T12:00:00.000Z');
function credential(token='a'.repeat(64),expiresAt=base+1000):WebSession{return {token,address:account,expiresAt:new Date(expiresAt).toISOString()};}
function fakeClock(){
 let now=base,next=0;const active=new Map<number,{at:number;callback:()=>void}>(),history=new Map<number,()=>void>(),scheduled:number[]=[];
 const clock={now:()=>now,schedule(callback:()=>void,ms:number){const id=++next;scheduled.push(ms);active.set(id,{at:now+ms,callback});history.set(id,callback);return id as unknown as ReturnType<typeof setTimeout>;},cancel(timer:ReturnType<typeof setTimeout>){active.delete(timer as unknown as number);}};
 function advance(ms:number){const target=now+ms;for(let count=0;;count++){assert.ok(count<100,'expiry scheduler must remain bounded');const entry=[...active.entries()].filter(([,item])=>item.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;now=entry[1].at;active.delete(entry[0]);entry[1].callback();}now=target;}
 return {clock,active,scheduled,advance,fireOld:(id:number)=>history.get(id)?.(),jump:(ms:number)=>{now+=ms;}};
}

test('session expiry notifies subscribers automatically without a getter or another API request',()=>{
 const f=fakeClock(),store=createWebSessionStore(f.clock),changes:SessionChange[]=[];store.subscribe(change=>changes.push(change));
 store.set(credential());assert.deepEqual(changes.map(c=>c.reason),['updated']);f.advance(999);assert.equal(changes.length,1);
 f.advance(1);assert.deepEqual(changes.map(c=>c.reason),['updated','expired']);assert.equal(changes[1].session,null);assert.equal(f.active.size,0);assert.equal(store.current(),null);
 store.dispose();
});
test('replacing a credential cancels old expiry for different and identical token values',()=>{
 for(const replacement of ['b'.repeat(64),'a'.repeat(64)]){
  const f=fakeClock(),store=createWebSessionStore(f.clock),changes:SessionChange[]=[];store.subscribe(change=>changes.push(change));
  store.set(credential());f.advance(200);store.set(credential(replacement,base+2000));assert.equal(f.active.size,1);
  f.fireOld(1);f.advance(800);assert.equal(store.current()?.token,replacement);assert.equal(changes.filter(c=>c.reason==='expired').length,0);
  f.advance(1000);assert.equal(changes.at(-1)?.reason,'expired');assert.equal(changes.at(-1)?.session,null);store.dispose();
 }
});
test('explicit clearing cancels timers and invalid or already expired dates are never installed',()=>{
 const f=fakeClock(),store=createWebSessionStore(f.clock),changes:SessionChange[]=[];store.subscribe(change=>changes.push(change));
 store.set(credential());store.set(null);assert.equal(f.active.size,0);f.fireOld(1);assert.deepEqual(changes.map(c=>c.reason),['updated','cleared']);
 for(const expiresAt of ['not-a-date','',new Date(base).toISOString(),new Date(base-1).toISOString()]){
  store.set({...credential(),expiresAt});assert.equal(store.current(),null);assert.equal(changes.at(-1)?.reason,'expired');assert.equal(f.active.size,0);
 }
 store.dispose();
});
test('long expiry uses bounded timer chunks and rechecks the wall clock after browser suspension',()=>{
 const f=fakeClock(),ttl=30*24*60*60*1000;let expired=0;
 const cancel=watchCredentialExpiry(base+ttl,()=>expired++,f.clock);assert.deepEqual(f.scheduled,[2147483647]);
 f.advance(2147483647);assert.equal(expired,0);assert.deepEqual(f.scheduled,[2147483647,ttl-2147483647]);
 f.advance(ttl-2147483647);assert.equal(expired,1);f.fireOld(1);assert.equal(expired,1);cancel();
 const suspended=fakeClock();let afterWake=0;watchCredentialExpiry(base+1000,()=>afterWake++,suspended.clock);suspended.jump(5000);suspended.fireOld(1);assert.equal(afterWake,1);suspended.fireOld(1);assert.equal(afterWake,1);
});
test('expiry watcher rejects invalid deadlines immediately and disposal prevents late notifications',()=>{
 const f=fakeClock();let invalid=0;const stop=watchCredentialExpiry(Number.NaN,()=>invalid++,f.clock);assert.equal(invalid,1);assert.equal(f.active.size,0);stop();
 const store=createWebSessionStore(f.clock),changes:SessionChange[]=[];store.subscribe(change=>changes.push(change));store.set(credential());store.dispose();assert.equal(f.active.size,0);assert.equal(store.current(),null);
 f.fireOld(1);f.advance(2000);assert.equal(changes.length,1);
});
test('session snapshots are defensive copies and unsubscribed listeners receive no later changes',()=>{
 const f=fakeClock(),store=createWebSessionStore(f.clock),value=credential();let events=0;
 const unsubscribe=store.subscribe(change=>{events++;if(change.session)change.session.token='changed by listener';});store.set(value);value.token='changed by caller';
 const read=store.current()!;assert.equal(read.token,'a'.repeat(64));read.token='changed by consumer';assert.equal(store.current()?.token,'a'.repeat(64));
 unsubscribe();f.advance(1000);assert.equal(events,1);assert.equal(store.current(),null);store.dispose();
});
test('reentrant replacement and clearing do not schedule or publish stale sessions',()=>{
 for(const replacement of [credential('b'.repeat(64),base+2000),null]){
  const f=fakeClock(),store=createWebSessionStore(f.clock),observed:SessionChange[]=[];
  store.subscribe(change=>{if(change.reason==='updated'&&change.session?.token==='a'.repeat(64))store.set(replacement);});store.subscribe(change=>observed.push(change));
  store.set(credential());assert.equal(observed.length,1);assert.equal(observed[0].session?.token,replacement?.token);assert.equal(observed[0].reason,replacement?'updated':'cleared');assert.equal(f.active.size,replacement?1:0);
  f.advance(1000);assert.equal(observed.length,1);f.advance(1000);if(replacement)assert.equal(observed.at(-1)?.reason,'expired');else assert.equal(observed.length,1);store.dispose();
 }
});
test('store rejection only clears the active matching credential and notifies subscribers',()=>{
 const f=fakeClock(),store=createWebSessionStore(f.clock),changes:SessionChange[]=[];store.subscribe(change=>changes.push(change));store.set(credential());
 assert.equal(store.reject('b'.repeat(64)),false);assert.equal(changes.length,1);assert.equal(store.reject('a'.repeat(64)),true);assert.equal(changes.at(-1)?.reason,'rejected');assert.equal(f.active.size,0);assert.equal(store.reject('a'.repeat(64)),false);store.dispose();
});
function liveCredential(token='a'.repeat(64)){return credential(token,Date.now()+3600000);}
test('matching 401 responses on protected web routes clear the active credential before further reads',()=>{
 const paths=['/api/security/pair','/api/security/scan','/api/security/records?limit=10','/api/security/records/id','/api/security/records/id/evidence','/api/wallet-auth/status','/api/wallet-auth/logout','/api/wallet-auth/revoke','/api/wallet-auth/reports/delete','/api/networks/check'];
 const changes:SessionChange[]=[];const unsubscribe=subscribeWebSession(change=>changes.push(change));
 try{for(const path of paths){setWebSession(liveCredential());const authorization=authHeaders().Authorization;assert.equal(handleWebAuthFailure(401,authorization,path),true,path);assert.equal(changes.at(-1)?.reason,'rejected');assert.deepEqual(authHeaders(),{});assert.equal(webSession(),null);}}
 finally{unsubscribe();setWebSession(null);}
});
test('stale 401, other statuses, unauthenticated requests and public or login routes preserve a fresh session',()=>{
 try{
  setWebSession(liveCredential('b'.repeat(64)));assert.equal(handleWebAuthFailure(401,`Bearer ${'a'.repeat(64)}`,'/api/security/records'),false);
  for(const status of [200,400,403,404,429,500])assert.equal(handleWebAuthFailure(status,authHeaders().Authorization,'/api/security/records'),false,String(status));
  for(const path of ['/api/wallet-auth/challenge','/api/wallet-auth/verify','/api/health','/api/networks','/api/security/status','/api/security/coverage-guide','/api/lab/status'])assert.equal(handleWebAuthFailure(401,authHeaders().Authorization,path),false,path);
  for(const authorization of [undefined,'',`Bearer ${'a'.repeat(63)}`,`Basic ${'b'.repeat(64)}`])assert.equal(handleWebAuthFailure(401,authorization,'/api/security/records'),false);
  assert.equal(webSession()?.token,'b'.repeat(64));
 }finally{setWebSession(null);}
});
test('labApi clears a matching rejected credential before parsing even a malformed JSON response',async()=>{
 const original=globalThis.fetch;let parsed=false;
 try{
  setWebSession(liveCredential());globalThis.fetch=async(_input,init)=>{assert.equal((init?.headers as Record<string,string>).Authorization,`Bearer ${'a'.repeat(64)}`);const response=new Response('{',{status:401});response.json=async()=>{parsed=true;assert.equal(webSession(),null);throw new SyntaxError('Malformed rejection body');};return response;};
  await assert.rejects(labApi('/api/security/records'),/Malformed rejection body/);assert.equal(parsed,true);assert.equal(webSession(),null);
 }finally{globalThis.fetch=original;setWebSession(null);}
});
test('labApi does not let an old in-flight 401 clear a newly verified session',async()=>{
 const original=globalThis.fetch;let resolve!:(response:Response)=>void,entered!:()=>void;const started=new Promise<void>(yes=>entered=yes);
 try{
  setWebSession(liveCredential());globalThis.fetch=async()=>{entered();return new Promise<Response>(yes=>resolve=yes);};
  const request=labApi('/api/security/records');await started;setWebSession(liveCredential('b'.repeat(64)));resolve(new Response(JSON.stringify({error:'Old request rejected'}),{status:401}));
  await assert.rejects(request,/Old request rejected/);assert.equal(webSession()?.token,'b'.repeat(64));
 }finally{globalThis.fetch=original;setWebSession(null);}
});
