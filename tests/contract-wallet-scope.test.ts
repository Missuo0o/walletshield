import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm,stat,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {buildApp} from '../src/server/app.js';
import {createStore,walletIdentityKey,type WalletAuthToken} from '../src/server/store.js';
import type {ServiceConfig} from '../src/server/service-config.js';
import type {SecurityConfig} from '../src/security/config.js';
import type {SecurityReport} from '../src/security/types.js';
const origin='https://walletshield.example',host='walletshield.example',address='0x'+'1'.repeat(40),to='0x'+'2'.repeat(40);
const service:ServiceConfig={mode:'hosted',origin,origins:[origin],hosts:[host],walletDailyLimit:20,maxScans:3};
const config:SecurityConfig={apiKey:'',model:'muse-wonder-1.0',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{1:'https://one.fixture.invalid',10:'https://ten.fixture.invalid'},snapToken:'f'.repeat(64)};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
async function fixture(options:{collect?:()=>Promise<[]>;aiEnabled?:boolean;scanWalletDailyLimit?:number;scanGlobalDailyLimit?:number}={}){
 const store=createStore(':memory:');let collected=0,probed=0,scored=0,serial=0;
 const app=await buildApp(store,{service:{...service,walletDailyLimit:1,...(options.scanWalletDailyLimit?{scanWalletDailyLimit:options.scanWalletDailyLimit}:{}),...(options.scanGlobalDailyLimit?{scanGlobalDailyLimit:options.scanGlobalDailyLimit}:{})},security:{config:async()=>({...config,...(options.aiEnabled?{aiEnabled:true,apiKey:'synthetic-offline-model-key',aiDailyLimit:100}:{})}),collect:async()=>{collected++;return options.collect?options.collect():[];},score:async()=>{scored++;return {status:'disabled',message:'Offline test result; no model call.'};}},networkProbe:async(_url,chainId)=>{probed++;return {chainId,network:'offline fixture',checkedAt:new Date().toISOString(),blockNumber:'1',blockHash:'0x'+'a'.repeat(64),blockTime:new Date().toISOString(),latencyMs:1};}});
 function identity(chainId?:number,kind:'web'|'snap'='web'){
  const token=String(++serial).padStart(64,'0'),record:WalletAuthToken={id:hash(token),address,kind,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),...(chainId!==undefined?{chainId}:{})};store.authTokenSave(record);return {token,record};
 }
 const headers=(token:string)=>({host,origin,authorization:'Bearer '+token});
 const request=(chainId:number)=>({kind:'transaction',chainId,transaction:{from:address,to,data:'0x',value:'0x0'}});
 const scan=async(token:string,chainId:number)=>app.inject({method:'POST',url:'/api/security/scan',headers:headers(token),payload:request(chainId)});
 return {app,store,identity,headers,scan,counts:()=>({collected,probed,scored}),close:async()=>{await app.close();store.close();}};
}
test('same-address contract identities cannot scan, read, overwrite or probe another chain',async()=>{
 const f=await fixture();try{
  const one=f.identity(1),ten=f.identity(10),eoa=f.identity();
  const a=await f.scan(one.token,1),b=await f.scan(ten.token,10);assert.equal(a.statusCode,200,a.body);assert.equal(b.statusCode,200,b.body);
  assert.equal((await f.scan(one.token,10)).statusCode,403);assert.equal((await f.scan(ten.token,1)).statusCode,403);assert.equal(f.counts().collected,2,'denied chain requests never collect evidence');
  for(const own of [one,ten]){
   const list=await f.app.inject({url:'/api/security/records',headers:f.headers(own.token)});assert.equal(list.statusCode,200);assert.deepEqual(list.json().map((r:any)=>r.request.chainId),[own.record.chainId]);
   const foreign=own===one?b.json().id:a.json().id;
   for(const suffix of ['', '/evidence'])assert.equal((await f.app.inject({url:'/api/security/records/'+foreign+suffix,headers:f.headers(own.token)})).statusCode,404);
   const state=await f.app.inject({url:'/api/wallet-auth/status',headers:f.headers(own.token)});assert.equal(state.json().chainId,own.record.chainId);
  }
  assert.equal((await f.app.inject({url:'/api/security/records',headers:f.headers(eoa.token)})).json().length,2,'EOA remains the same key across EVM chains');
  assert.equal(f.store.authSaveSecurityReport({...b.json(),request:{...b.json().request,chainId:1}},address,one.record.id,new Date().toISOString()),false,'a scoped caller cannot reassign a same-address foreign-chain report ID');
  assert.equal((await f.app.inject({method:'POST',url:'/api/networks/check',headers:f.headers(one.token),payload:{chainId:10,address}})).statusCode,401);assert.equal(f.counts().probed,0);
  assert.equal((await f.app.inject({method:'POST',url:'/api/networks/check',headers:f.headers(one.token),payload:{chainId:1,address}})).statusCode,200);
  assert.equal((await f.scan(eoa.token,10)).statusCode,200);
 }finally{await f.close();}
});
test('paired contract credentials retain chain scope and rotation cannot evict same-address foreign-chain pairings',async()=>{
 const f=await fixture();try{
  const one=f.identity(1),ten=f.identity(10,'snap'),unscoped=f.identity(undefined,'snap');
  const pair=async()=>f.app.inject({method:'POST',url:'/api/security/pair',headers:f.headers(one.token),payload:{}});
  const first=await pair();assert.equal(first.statusCode,200,first.body);assert.equal(first.json().chainId,1);
  const health=await f.app.inject({url:'/api/security/pair/status',headers:{host,origin:'null',authorization:'Bearer '+first.json().token}});assert.equal(health.json().chainId,1);
  let latest=first.json();for(let i=0;i<3;i++){const next=await pair();assert.equal(next.statusCode,200);latest=next.json();}
  assert.ok(f.store.authTokenGet(ten.record.id,new Date().toISOString()));assert.ok(f.store.authTokenGet(unscoped.record.id,new Date().toISOString()));
  assert.equal((await f.scan(latest.token,10)).statusCode,403);
 }finally{await f.close();}
});
test('same-address contract identities have independent pairing and model budgets while service caps remain shared',async()=>{
 const f=await fixture({aiEnabled:true});try{
  const one=f.identity(1),ten=f.identity(10);
  const pairs=async(token:string)=>f.app.inject({method:'POST',url:'/api/security/pair',headers:f.headers(token),payload:{}});
  for(let i=0;i<4;i++)assert.equal((await pairs(one.token)).statusCode,200);assert.equal((await pairs(one.token)).statusCode,429);
  const foreign=await pairs(ten.token);assert.equal(foreign.statusCode,200,'another chain has its own identity pairing allowance');assert.equal(foreign.json().chainId,10);
  for(const identity of [one,ten])for(let i=0;i<2;i++)assert.equal((await f.scan(identity.token,identity.record.chainId!)).statusCode,200);
  assert.equal(f.counts().scored,2,'one model attempt per chain-scoped identity, not one per shared address');
  const now=new Date().toISOString();for(const chainId of [1,10])assert.equal(f.store.authAttemptsToday(walletIdentityKey(address,chainId),now),1);
  assert.equal(f.store.securityAiCallsToday(),2,'the global model reservation still counts both identities');
 }finally{await f.close();}
});
test('same-address evidence quotas are chain-scoped and do not bypass shared global or peer-IP protection',async()=>{
 const f=await fixture({scanWalletDailyLimit:1,scanGlobalDailyLimit:2});try{
  const one=f.identity(1),ten=f.identity(10),eoa=f.identity();
  assert.equal((await f.scan(one.token,1)).statusCode,200);assert.equal((await f.scan(one.token,1)).statusCode,429);
  assert.equal((await f.scan(ten.token,10)).statusCode,200,'foreign chain allowance remains available');
  assert.equal((await f.scan(eoa.token,1)).statusCode,429,'a new identity cannot bypass the global two-scan cap');assert.equal(f.counts().collected,2);
 }finally{await f.close();}
});
test('same-address contracts on different chains can collect concurrently without bypassing the global concurrency cap',async()=>{
 let release!:()=>void,entered!:()=>void,count=0;const gate=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
 const f=await fixture({collect:async()=>{if(++count===2)entered();await gate;return [];}});let pending:Promise<{statusCode:number}>[]=[];
 try{const one=f.identity(1),ten=f.identity(10);pending=[f.scan(one.token,1),f.scan(ten.token,10)];await Promise.race([started,new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(Error('different-chain identity was incorrectly blocked')),1000);timer.unref();})]);assert.equal(f.counts().collected,2);assert.equal((await f.scan(one.token,1)).statusCode,429,'same-identity overlap remains blocked');release();assert.ok((await Promise.all(pending)).every(result=>result.statusCode===200));}finally{release();await Promise.allSettled(pending);await f.close();}
});
test('contract report deletion and revocation affect only the verified chain, including pending login tickets',async()=>{
 for(const action of ['revoke','reports/delete']){const f=await fixture();try{
  const one=f.identity(1),same=f.identity(1,'snap'),ten=f.identity(10),otherSnap=f.identity(10,'snap'),eoa=f.identity();
  const a=await f.scan(one.token,1),b=await f.scan(ten.token,10);assert.equal(a.statusCode,200);assert.equal(b.statusCode,200);
  const now=new Date().toISOString(),expiresAt=new Date(Date.now()+60000).toISOString();
  for(const chainId of [1,10]){f.store.authChallengeSave({id:'ticket-'+chainId,address,chainId,origin,message:'offline exact stored challenge',createdAt:now,expiresAt});assert.ok(f.store.authChallengeConsume('ticket-'+chainId,now));}
  const response=await f.app.inject({method:'POST',url:'/api/wallet-auth/'+action,headers:f.headers(one.token),payload:action==='revoke'?{}:{confirm:true}});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().chainId,1);
  for(const identity of [one,same])assert.equal(f.store.authTokenGet(identity.record.id,now),null);
  for(const identity of [ten,otherSnap,eoa])assert.ok(f.store.authTokenGet(identity.record.id,now),'foreign-chain/unscoped credentials must remain active');
  assert.equal(f.store.authIssueWeb({...one.record,id:'new-one'},'ticket-1',now),false);assert.equal(f.store.authIssueWeb({...ten.record,id:'new-ten'},'ticket-10',now),true);
  assert.ok(f.store.securityGet(b.json().id));assert.equal(!!f.store.securityGet(a.json().id),action==='revoke');
 }finally{await f.close();}}
});
test('identity policy migration invalidates unscoped legacy credentials once and preserves reports',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'walletshield-identity-migration-')),path=join(dir,'legacy.sqlite');
 const legacy=new DatabaseSync(path),createdAt=new Date().toISOString(),expiresAt=new Date(Date.now()+60000).toISOString(),token:WalletAuthToken={id:'old',address,kind:'web',createdAt,expiresAt};
 legacy.exec('CREATE TABLE wallet_auth_tokens(token_hash TEXT PRIMARY KEY,address TEXT NOT NULL,kind TEXT NOT NULL,expires_at TEXT NOT NULL,payload TEXT NOT NULL)');legacy.prepare('INSERT INTO wallet_auth_tokens VALUES(?,?,?,?,?)').run(token.id,address,token.kind,expiresAt,JSON.stringify(token));legacy.close();
 let store=createStore(path);try{assert.equal(store.authTokenGet('old',createdAt),null);store.authTokenSave({...token,id:'new',chainId:1});store.securitySave({id:'kept',createdAt} as SecurityReport);store.close();store=createStore(path);assert.ok(store.authTokenGet('new',createdAt),'subsequent connections do not repeat migration');assert.ok(store.securityGet('kept'));}finally{store.close();await rm(dir,{recursive:true,force:true});}
});
test('database, WAL and shared-memory permissions are private even with a permissive process umask',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'walletshield-private-sqlite-')),path=join(dir,'reports.sqlite'),mask=process.umask(0);let store:ReturnType<typeof createStore>|undefined;
 try{store=createStore(path);for(const suffix of ['','-wal','-shm'])assert.equal((await stat(path+suffix)).mode&0o777,0o600);store.close();store=undefined;await chmod(path,0o644);store=createStore(path);assert.equal((await stat(path)).mode&0o777,0o600,'existing files are tightened too');}finally{process.umask(mask);store?.close();await rm(dir,{recursive:true,force:true});}
});
