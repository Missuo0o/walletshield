import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createStore,type WalletAuthToken} from '../src/server/store.js';
import {registerWalletAuth,SNAP_PAIRING_LIMITS,type WalletPrincipal} from '../src/server/wallet-auth.js';
import {registerSecurity} from '../src/security/api.js';
import type {SecurityConfig} from '../src/security/config.js';
const origin='https://walletshield.example',base=Date.parse('2030-01-01T12:00:00.000Z');
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
const config:SecurityConfig={apiKey:'',model:'muse-wonder-1.0',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{},monitorEnabled:false};
async function fixture(path=':memory:',time={value:base}){
 const app=Fastify(),store=createStore(path),auth=registerWalletAuth(app,store,{origin,enabled:true,now:()=>time.value});
 registerSecurity(app,store,{access:{service:{mode:'hosted',origin,origins:[origin],hosts:['walletshield.example'],walletDailyLimit:20,maxScans:3},auth},config:async()=>config});
 function owner(n:number){const token=n.toString(16).padStart(64,'0'),address=`0x${n.toString(16).padStart(40,'0')}`,createdAt=new Date(base).toISOString(),expiresAt=new Date(base+366*24*60*60*1000).toISOString(),id=hash(token);const principal:WalletPrincipal={id,address,kind:'web',expiresAt};if(!store.authTokenGet(id,createdAt))store.authTokenSave({...principal,createdAt});return {token,principal};}
 const pair=(token:string,ip='192.0.2.1')=>app.inject({method:'POST',url:'/api/security/pair',remoteAddress:ip,headers:{origin,authorization:`Bearer ${token}`},payload:{}});
 const valid=(token:string)=>store.authTokenGet(hash(token),new Date(time.value).toISOString());
 return {app,store,auth,time,owner,pair,valid,close:async()=>{await app.close();store.close();}};
}
test('hosted pair route enforces an atomic per-address issuance cap, retaining old credentials on denial',async()=>{
 const f=await fixture();try{
  const owner=f.owner(1),responses=await Promise.all(Array.from({length:SNAP_PAIRING_LIMITS.addressPerMinute+3},()=>f.pair(owner.token)));
  const accepted=responses.filter(r=>r.statusCode===200),denied=responses.filter(r=>r.statusCode===429);assert.equal(accepted.length,SNAP_PAIRING_LIMITS.addressPerMinute);assert.equal(denied.length,3);
  for(const response of accepted){assert.match(response.json().token,/^[a-f0-9]{64}$/);assert.equal(f.valid(response.json().token)?.address,owner.principal.address);assert.equal(response.headers['cache-control'],'no-store');}
  for(const response of denied){assert.equal(response.headers['retry-after'],'60');assert.match(response.json().error,/No existing pairing was changed/);}
  assert.ok(f.valid(owner.token),'issuing or denying Snap tokens does not revoke the web login');
  f.time.value+=60000;assert.equal((await f.pair(owner.token)).statusCode,200,'a normal reload works again in the next minute');
 }finally{await f.close();}
});
test('pairing IP and global issuance limits cannot be bypassed by switching authenticated addresses',async()=>{
 const f=await fixture();try{
  for(let address=1;address<=3;address++){const web=f.owner(address);for(let i=0;i<4;i++)assert.equal((await f.pair(web.token)).statusCode,200);}
  assert.equal((await f.pair(f.owner(4).token)).statusCode,429,'same observed IP has at most twelve successful issues');
  f.time.value+=60000;
  for(let address=1;address<=15;address++){const web=f.owner(address);for(let i=0;i<4;i++)assert.equal((await f.pair(web.token,`192.0.2.${address}`)).statusCode,200);}
  assert.equal((await f.pair(f.owner(16).token,'198.51.100.1')).statusCode,429,'the global cap survives independent peers and addresses');
 }finally{await f.close();}
});
test('reload rotation bounds active credentials per wallet without revoking another owner',async()=>{
 const f=await fixture();try{
  const alice=f.owner(1),bob=f.owner(2),other=(await f.pair(bob.token)).json().token,tokens:string[]=[];
  for(let i=0;i<7;i++){f.time.value+=60001;const response=await f.pair(alice.token);assert.equal(response.statusCode,200);tokens.push(response.json().token);}
  assert.deepEqual(tokens.map(token=>!!f.valid(token)),[false,false,false,true,true,true,true]);assert.ok(f.valid(other),'rotation never evicts another wallet');
  assert.equal((await f.app.inject({method:'POST',url:'/api/wallet-auth/revoke',headers:{origin,authorization:`Bearer ${alice.token}`},payload:{}})).statusCode,200);
  for(const token of tokens)assert.equal(f.valid(token),null);assert.ok(f.valid(other));
 }finally{await f.close();}
});
test('issuance capacity and authentication are checked before rotation, and denied reservations charge no other buckets',async()=>{
 const f=await fixture();try{
  const alice=f.owner(1),bob=f.owner(2),carol=f.owner(3),limits={ipKey:'fixture-peer',addressPerMinute:10,ipPerMinute:10,globalPerMinute:10,maxPerAddress:2,maxGlobal:2};let serial=0;
  function issue(owner:typeof alice,overrides:Partial<typeof limits>={}){const createdAt=new Date(f.time.value++).toISOString(),token:WalletAuthToken={id:hash(`synthetic-pair-${++serial}`),address:owner.principal.address,kind:'snap',createdAt,expiresAt:new Date(f.time.value+60000).toISOString()};return {token,ok:f.store.authIssueSnap(token,owner.principal.id,createdAt,{...limits,...overrides})};}
  const first=issue(alice),other=issue(bob);assert.equal(first.ok,true);assert.equal(other.ok,true);
  assert.equal(issue(carol).ok,false);assert.ok(f.store.authTokenGet(first.token.id,new Date(f.time.value).toISOString()));assert.ok(f.store.authTokenGet(other.token.id,new Date(f.time.value).toISOString()));
  assert.equal(issue(carol,{maxGlobal:3,globalPerMinute:3}).ok,true,'capacity denial did not spend a global issuance reservation');
  const rotated=issue(alice,{maxGlobal:3});assert.equal(rotated.ok,true);assert.equal(f.store.authTokenGet(first.token.id,new Date(f.time.value).toISOString()),null);assert.ok(f.store.authTokenGet(other.token.id,new Date(f.time.value).toISOString()));
  f.store.authTokenRevoke(alice.principal.id);assert.equal(issue(alice,{maxGlobal:3}).ok,false);assert.ok(f.store.authTokenGet(rotated.token.id,new Date(f.time.value).toISOString()),'revoked web credentials cannot delete/rotate valid Snap tokens');
 }finally{await f.close();}
});
test('pairing rate state persists across restart; expiry cleanup is indexed and removes expired credential rows',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'walletshield-pairing-')),path=join(dir,'auth.sqlite'),time={value:base};let f=await fixture(path,time);
 try{
  let web=f.owner(1);for(let i=0;i<4;i++)assert.equal((await f.pair(web.token)).statusCode,200);
  await f.close();f=await fixture(path,time);web=f.owner(1);assert.equal((await f.pair(web.token)).statusCode,429);
  time.value+=30*24*60*60*1000+1;assert.equal((await f.pair(web.token)).statusCode,200);
  await f.close();const db=new DatabaseSync(path);try{assert.equal(Number(db.prepare("SELECT count(*) AS n FROM wallet_auth_tokens WHERE kind='snap'").get()?.n),1);const indexes=db.prepare("PRAGMA index_list('wallet_auth_tokens')").all().map(r=>r.name);assert.ok(indexes.includes('wallet_auth_tokens_expiry'));assert.ok(indexes.includes('wallet_auth_tokens_owner_expiry'));assert.equal(Number(db.prepare('SELECT count(*) AS n FROM wallet_auth_rates WHERE bucket<?').get(Math.floor(time.value/60000)-2)?.n),0);}finally{db.close();}
  f=await fixture(path,time);
 }finally{await f.close();await rm(dir,{recursive:true,force:true});}
});
