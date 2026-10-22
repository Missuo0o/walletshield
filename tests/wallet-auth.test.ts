import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify,{type FastifyInstance} from 'fastify';
import {privateKeyToAccount} from 'viem/accounts';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore,type Store} from '../src/server/store.js';
import {registerWalletAuth,WALLET_AUTH_LIMITS,type WalletAuth,type WalletPrincipal} from '../src/server/wallet-auth.js';
import type {SecurityReport} from '../src/security/types.js';
// Public, synthetic test-only keys. These never control a real wallet and all
// signing below is offline against the temporary test server's login message.
const alice=privateKeyToAccount(`0x${'1'.repeat(64)}`),bob=privateKeyToAccount(`0x${'2'.repeat(64)}`);
const origin='https://walletshield.example',baseTime=Date.parse('2030-01-01T12:00:00.000Z');
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
type Fixture={app:FastifyInstance;store:Store;auth:WalletAuth;time:{value:number};close:()=>Promise<void>};
async function fixture(path=':memory:',enabled=true):Promise<Fixture>{
 const store=createStore(path),app=Fastify(),time={value:baseTime},auth=registerWalletAuth(app,store,{origin,enabled,now:()=>time.value});
 app.get('/test/principal',async req=>auth.authenticate(req)??{authenticated:false});
 return {app,store,auth,time,close:async()=>{await app.close();store.close();}};
}
async function challenge(f:Fixture,account=alice,extra:Record<string,unknown>={}){
 const response=await f.app.inject({method:'POST',url:'/api/wallet-auth/challenge',headers:{origin},payload:{address:account.address,chainId:11155111,...extra}});
 assert.equal(response.statusCode,200,response.body);return response.json() as {id:string;message:string;expiresAt:string};
}
async function login(f:Fixture,account=alice){
 const c=await challenge(f,account),signature=await account.signMessage({message:c.message});
 const response=await f.app.inject({method:'POST',url:'/api/wallet-auth/verify',headers:{origin},payload:{id:c.id,signature}});
 assert.equal(response.statusCode,200,response.body);const result=response.json() as {token:string;expiresAt:string;address:string;kind:'web'};
 const p=await principal(f,result.token);assert.equal(p.address,account.address.toLowerCase());return {...result,principal:p};
}
async function principal(f:Fixture,token:string){
 const response=await f.app.inject({url:'/test/principal',headers:{authorization:`Bearer ${token}`}});return response.json() as WalletPrincipal;
}
const status=(f:Fixture,token:string,requestOrigin?:string)=>f.app.inject({url:'/api/wallet-auth/status',headers:{authorization:`Bearer ${token}`,...(requestOrigin?{origin:requestOrigin}:{})}});

test('EOA login uses exact domain/URI/nonce and stores only hashed bearer tokens',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'walletshield-auth-')),path=join(dir,'auth.sqlite'),f=await fixture(path);
 try{
  const c=await challenge(f);assert.ok(c.message.startsWith('walletshield.example wants you to sign in'));
  assert.ok(c.message.includes(`URI: ${origin}/`));assert.ok(c.message.includes('Chain ID: 11155111'));assert.ok(c.message.includes('does not authorize transfers, token approvals'));
  assert.match(c.message,/Nonce: [a-f0-9]{32}/);assert.equal(Date.parse(c.expiresAt)-f.time.value,300000);
  const signature=await alice.signMessage({message:c.message}),response=await f.app.inject({method:'POST',url:'/api/wallet-auth/verify',headers:{origin},payload:{id:c.id,signature}});
  assert.equal(response.statusCode,200);const result=response.json();assert.match(result.token,/^[a-f0-9]{64}$/);
  assert.equal(Date.parse(result.expiresAt)-f.time.value,8*60*60*1000);assert.equal(result.address,alice.address.toLowerCase());assert.equal(result.kind,'web');
  assert.equal(f.store.authTokenGet(result.token,new Date(f.time.value).toISOString()),null);
  assert.equal(f.store.authTokenGet(hash(result.token),new Date(f.time.value).toISOString())?.address,alice.address.toLowerCase());
  const state=await status(f,result.token);assert.equal(state.statusCode,200);assert.equal(state.headers['cache-control'],'no-store');assert.ok(!state.body.includes(result.token));assert.ok(!state.body.includes(hash(result.token)));
  // SQLite file/WAL are test-only artifacts, never the runtime .local database.
  for(const name of [path,`${path}-wal`]){let bytes:Buffer;try{bytes=await readFile(name);}catch{continue;}assert.equal(bytes.includes(Buffer.from(result.token)),false);assert.equal(bytes.includes(Buffer.from(signature)),false);}
 }finally{await f.close();await rm(dir,{recursive:true,force:true});}
});

test('verification rejects other signers, altered messages, client message injection, and replay',async()=>{
 const f=await fixture();try{
  const c=await challenge(f),wrong=await bob.signMessage({message:c.message});
  assert.equal((await f.app.inject({method:'POST',url:'/api/wallet-auth/verify',headers:{origin},payload:{id:c.id,signature:wrong}})).statusCode,401);
  const correct=await alice.signMessage({message:c.message});
  assert.equal((await f.app.inject({method:'POST',url:'/api/wallet-auth/verify',headers:{origin},payload:{id:c.id,signature:correct}})).statusCode,401,'failed verification consumes nonce');
  const d=await challenge(f),changed=await alice.signMessage({message:d.message.replace(origin,'https://evil.example')});
  assert.equal((await f.app.inject({method:'POST',url:'/api/wallet-auth/verify',headers:{origin},payload:{id:d.id,signature:changed}})).statusCode,401);
  const e=await challenge(f),signed=await alice.signMessage({message:e.message});
  assert.equal((await f.app.inject({method:'POST',url:'/api/wallet-auth/verify',headers:{origin},payload:{id:e.id,signature:signed,message:e.message}})).statusCode,400);
  const valid=await f.app.inject({method:'POST',url:'/api/wallet-auth/verify',headers:{origin},payload:{id:e.id,signature:signed}});assert.equal(valid.statusCode,200);
  assert.equal((await f.app.inject({method:'POST',url:'/api/wallet-auth/verify',headers:{origin},payload:{id:e.id,signature:signed}})).statusCode,401);
 }finally{await f.close();}
});

test('origin alone never authenticates, strict origins/body sizes reject unsafe requests',async()=>{
 const f=await fixture();try{
  for(const candidate of [undefined,'null','https://evil.example',`${origin}.evil.example`]){
   const r=await f.app.inject({method:'POST',url:'/api/wallet-auth/challenge',headers:candidate?{origin:candidate}:{},payload:{address:alice.address,chainId:1}});assert.equal(r.statusCode,403);
  }
  assert.equal((await f.app.inject({method:'POST',url:'/api/wallet-auth/challenge',headers:{origin},payload:{address:alice.address,chainId:1,rpc:'https://evil.example'}})).statusCode,400);
  assert.equal((await f.app.inject({method:'POST',url:'/api/wallet-auth/challenge',headers:{origin},payload:{address:'0x'+'0'.repeat(40),chainId:1}})).statusCode,400);
  assert.equal((await f.app.inject({method:'POST',url:'/api/wallet-auth/challenge',headers:{origin},payload:{address:alice.address,chainId:0}})).statusCode,400);
  assert.equal((await f.app.inject({method:'POST',url:'/api/wallet-auth/challenge',headers:{origin},payload:{address:'x'.repeat(3000),chainId:1}})).statusCode,413);
  assert.equal((await f.app.inject({url:'/api/wallet-auth/status',headers:{origin}})).statusCode,401);
  const web=await login(f);assert.equal((await status(f,web.token,origin)).statusCode,200);assert.equal((await status(f,web.token,'https://evil.example')).statusCode,401);
  assert.equal((await f.app.inject({url:'/test/principal',headers:{origin:'null',authorization:`Bearer ${web.token}`}})).json().address,alice.address.toLowerCase());
  assert.equal((await f.app.inject({url:'/test/principal',headers:{authorization:`Basic ${web.token}`}})).json().authenticated,false);
 }finally{await f.close();}
});

test('challenge, web session, and Snap session expiry fail closed at exact deadlines',async()=>{
 const f=await fixture();try{
  const c=await challenge(f),signature=await alice.signMessage({message:c.message});f.time.value+=300000;
  assert.equal((await f.app.inject({method:'POST',url:'/api/wallet-auth/verify',headers:{origin},payload:{id:c.id,signature}})).statusCode,401);
  const web=await login(f),snap=f.auth.issueSnap(web.principal);assert.equal(Date.parse(snap.expiresAt)-f.time.value,30*24*60*60*1000);
  assert.equal((await status(f,snap.token)).statusCode,200);f.time.value=Date.parse(web.expiresAt);
  assert.equal((await status(f,web.token)).statusCode,401);assert.throws(()=>f.auth.issueSnap(web.principal));assert.equal(f.auth.takeAttempt(web.principal,3),false);
  assert.equal((await status(f,snap.token)).statusCode,200);f.time.value=Date.parse(snap.expiresAt);assert.equal((await status(f,snap.token)).statusCode,401);
 }finally{await f.close();}
});

test('only active web sessions issue/revoke Snap tokens; logout/revocation persist',async()=>{
 const f=await fixture();try{
  const a=await login(f),b=await login(f,bob),one=f.auth.issueSnap(a.principal),two=f.auth.issueSnap(a.principal),other=f.auth.issueSnap(b.principal),snapPrincipal=await principal(f,one.token);
  assert.throws(()=>f.auth.issueSnap(snapPrincipal));assert.throws(()=>f.auth.issueSnap({...a.principal,address:b.principal.address}));
  const denied=await f.app.inject({method:'POST',url:'/api/wallet-auth/revoke',headers:{origin,authorization:`Bearer ${one.token}`},payload:{}});assert.equal(denied.statusCode,401);
  const revoked=await f.app.inject({method:'POST',url:'/api/wallet-auth/revoke',headers:{origin,authorization:`Bearer ${a.token}`},payload:{}});assert.equal(revoked.statusCode,200);
  assert.equal((await status(f,one.token)).statusCode,401);assert.equal((await status(f,two.token)).statusCode,401);assert.equal((await status(f,other.token)).statusCode,200);assert.equal((await status(f,a.token)).statusCode,200);
  assert.equal((await f.app.inject({method:'POST',url:'/api/wallet-auth/logout',headers:{origin,authorization:`Bearer ${a.token}`},payload:{}})).statusCode,200);assert.equal((await status(f,a.token)).statusCode,401);
  f.auth.revokeToken(other.token);assert.equal((await status(f,other.token)).statusCode,401);
 }finally{await f.close();}
});

test('two wallets cannot reassign or read one another reports; history filters before limit',async()=>{
 const f=await fixture();try{
  const a=await login(f),b=await login(f,bob);f.auth.reportOwner('alice-report',a.principal);f.auth.reportOwner('alice-report',a.principal);
  assert.equal(f.auth.ownsReport('alice-report',a.principal),true);assert.equal(f.auth.ownsReport('alice-report',b.principal),false);assert.throws(()=>f.auth.reportOwner('alice-report',b.principal));
  const report={id:'alice-report',createdAt:'2029-01-01'} as SecurityReport;f.store.securitySave(report);
  for(let i=0;i<105;i++){const id=`bob-${i}`;f.store.securitySave({id,createdAt:`2030-01-${String(i%28+1).padStart(2,'0')}`} as SecurityReport);f.auth.reportOwner(id,b.principal);}
  assert.deepEqual(f.store.authSecurityList(a.address).map(r=>r.id),['alice-report']);assert.equal(f.store.authSecurityList(b.address).length,100);
  f.auth.revokeToken(a.token);assert.equal(f.auth.ownsReport('alice-report',a.principal),false);
 }finally{await f.close();}
});

test('per-address UTC budgets are shared across web/Snap, isolated from other wallets, and persistent',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'walletshield-auth-budget-')),path=join(dir,'auth.sqlite');let f=await fixture(path);
 try{
  const a=await login(f),b=await login(f,bob),snap=f.auth.issueSnap(a.principal),snapPrincipal=await principal(f,snap.token);
  assert.equal(f.auth.takeAttempt(a.principal,2),true);assert.equal(f.auth.takeAttempt(snapPrincipal,2),true);assert.equal(f.auth.takeAttempt(a.principal,2),false);assert.equal(f.auth.takeAttempt(b.principal,2),true);
  assert.throws(()=>f.auth.takeAttempt(a.principal,0));assert.throws(()=>f.auth.takeAttempt(a.principal,1001));
  await f.close();f=await fixture(path);const persisted=await principal(f,snap.token);assert.equal(persisted.address,a.address);assert.equal(f.auth.takeAttempt(persisted,2),false);assert.equal(f.store.authAttemptsToday(a.address,new Date(f.time.value).toISOString()),2);
  f.time.value+=24*60*60*1000;assert.equal(f.auth.takeAttempt(persisted,2),true);assert.equal(f.store.authAttemptsToday(a.address,new Date(f.time.value).toISOString()),1);
 }finally{await f.close();await rm(dir,{recursive:true,force:true});}
});

test('bounded challenges and verification rate limits survive clock windows and restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'walletshield-auth-rate-')),path=join(dir,'auth.sqlite');let f=await fixture(path);
 try{
  for(let i=0;i<WALLET_AUTH_LIMITS.challengePerAddress;i++)await challenge(f);
  const blocked=()=>f.app.inject({method:'POST',url:'/api/wallet-auth/challenge',headers:{origin},payload:{address:alice.address,chainId:1}});
  assert.equal((await blocked()).statusCode,429);await f.close();f=await fixture(path);assert.equal((await blocked()).statusCode,429);
  f.time.value+=60000;assert.equal((await blocked()).statusCode,200);
  for(let i=0;i<WALLET_AUTH_LIMITS.verifyPerMinute;i++)assert.equal((await f.app.inject({method:'POST',url:'/api/wallet-auth/verify',headers:{origin},payload:{id:'00000000-0000-4000-8000-000000000001',signature:`0x${'0'.repeat(130)}`}})).statusCode,401);
  assert.equal((await f.app.inject({method:'POST',url:'/api/wallet-auth/verify',headers:{origin},payload:{}})).statusCode,429);
  const now=new Date(f.time.value).toISOString();for(let i=0;i<WALLET_AUTH_LIMITS.maxPending;i++)f.store.authChallengeSave({id:`capacity-${i}`,address:alice.address.toLowerCase(),chainId:1,origin,message:'test',createdAt:now,expiresAt:new Date(f.time.value+300000).toISOString()});
  f.time.value+=60000;assert.equal((await blocked()).statusCode,429,'pending challenge cap');f.time.value+=300000;assert.equal((await blocked()).statusCode,200,'expired challenges are pruned');
 }finally{await f.close();await rm(dir,{recursive:true,force:true});}
});

test('authentication routes stay unavailable when disabled and unsafe configured origins are rejected',async()=>{
 const f=await fixture(':memory:',false);try{
  for(const [method,url,payload] of [['POST','/api/wallet-auth/challenge',{address:alice.address,chainId:1}],['POST','/api/wallet-auth/verify',{}],['GET','/api/wallet-auth/status',undefined],['POST','/api/wallet-auth/logout',{}],['POST','/api/wallet-auth/revoke',{}]] as const){assert.equal((await f.app.inject({method,url,headers:{origin},...(payload?{payload}:{})})).statusCode,404);}
  const invalidApp=Fastify();for(const candidate of ['http://public.example',`${origin}/path`,`${origin}/`,`${origin}?query=x`,'https://user:secret@walletshield.example'])assert.throws(()=>registerWalletAuth(invalidApp,f.store,{origin:candidate,enabled:true}));await invalidApp.close();
 }finally{await f.close();}
});

test('pending challenges, consumed nonces and revoked sessions survive server restarts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'walletshield-auth-replay-')),path=join(dir,'auth.sqlite');let f=await fixture(path);
 try{
  const c=await challenge(f),signature=await alice.signMessage({message:c.message});await f.close();f=await fixture(path);
  const verified=await f.app.inject({method:'POST',url:'/api/wallet-auth/verify',headers:{origin},payload:{id:c.id,signature}});assert.equal(verified.statusCode,200);const {token}=verified.json();
  f.auth.revokeToken(token);await f.close();f=await fixture(path);
  assert.equal((await status(f,token)).statusCode,401);assert.equal((await f.app.inject({method:'POST',url:'/api/wallet-auth/verify',headers:{origin},payload:{id:c.id,signature}})).statusCode,401);
 }finally{await f.close();await rm(dir,{recursive:true,force:true});}
});

test('combined reservation never charges a wallet on global denial or global budget on wallet denial',async()=>{
 const f=await fixture();try{
  const a=await login(f),b=await login(f,bob),now=new Date(f.time.value).toISOString();
  assert.equal(f.auth.takeAttempt(a.principal,1,2),true);
  assert.equal(f.auth.takeAttempt(a.principal,1,2),false,'wallet quota denies without taking global slot');
  assert.equal(f.auth.takeAttempt(b.principal,2,2),true,'other wallet still has the second global slot');
  assert.equal(f.auth.takeAttempt(b.principal,2,2),false,'global denial does not charge second wallet slot');
  assert.equal(f.store.authAttemptsToday(a.address,now),1);assert.equal(f.store.authAttemptsToday(b.address,now),1);
  assert.throws(()=>f.auth.takeAttempt(b.principal,2,0));
  // Raising the global limit permits exactly the uncharged wallet slot.
  assert.equal(f.auth.takeAttempt(b.principal,2,3),true);assert.equal(f.store.authAttemptsToday(b.address,now),2);
 }finally{await f.close();}
});
