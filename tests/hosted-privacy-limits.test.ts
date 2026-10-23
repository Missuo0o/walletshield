import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createStore,type EvidenceScanLimits} from '../src/server/store.js';
import {registerWalletAuth,type WalletPrincipal} from '../src/server/wallet-auth.js';
import {serviceConfig} from '../src/server/service-config.js';
import type {SecurityReport} from '../src/security/types.js';
const origin='https://walletshield.example',start=Date.parse('2030-01-02T12:00:00.000Z');
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
async function fixture(path=':memory:',retentionDays=0){
 const store=createStore(path),app=Fastify(),time={value:start},auth=registerWalletAuth(app,store,{origin,enabled:true,now:()=>time.value,retentionDays});let serial=0;
 function identity(n:number,kind:'web'|'snap'='web'){
  const token=String(++serial).padStart(64,'0'),address='0x'+String(n).padStart(40,'0'),id=hash(token),expiresAt=new Date(start+86400000).toISOString(),principal:WalletPrincipal={id,address,kind,expiresAt};
  store.authTokenSave({...principal,createdAt:new Date(time.value).toISOString()});return {token,principal};
 }
 const request=(url:string,token:string,payload:Record<string,unknown>={},requestOrigin=origin)=>app.inject({method:'POST',url,headers:{origin:requestOrigin,authorization:`Bearer ${token}`},payload});
 return {store,app,auth,time,identity,request,close:async()=>{await app.close();store.close();}};
}
const report=(id:string,createdAt=new Date(start).toISOString())=>({id,createdAt,request:{kind:'signature',chainId:0,signature:{from:'0x'+'1'.repeat(40),method:'personal_sign',data:'private unsigned message'}}} as SecurityReport);
const limits:EvidenceScanLimits={walletPerMinute:10,ipPerMinute:10,globalPerMinute:10,walletPerDay:10,ipPerDay:10,globalPerDay:10};
test('wallet-wide revocation removes every web and Snap credential, pending login challenges, and rejects remint/backfill',async()=>{
 const f=await fixture();try{
  const a=f.identity(1),second=f.identity(1),snap=f.identity(1,'snap'),b=f.identity(2);
  f.store.authChallengeSave({id:'pending-a',address:a.principal.address,chainId:1,origin,message:'stored login',createdAt:new Date(start).toISOString(),expiresAt:new Date(start+60000).toISOString()});
  assert.equal(f.auth.saveReport(report('a'),a.principal),true);assert.equal(f.auth.saveReport(report('b'),b.principal),true);
  assert.equal((await f.request('/api/wallet-auth/revoke',a.token)).statusCode,200);
  for(const owner of [a,second,snap]){assert.equal(f.auth.active(owner.principal),false);assert.equal(f.auth.saveReport(report('late-'+owner.principal.id),owner.principal),false);assert.equal(f.auth.takeEvidenceAttempt(owner.principal,'192.0.2.1'),false);}
  assert.throws(()=>f.auth.issueSnap(second.principal));assert.equal(f.store.authChallengeConsume('pending-a',new Date(start).toISOString()),null);
  assert.equal(f.auth.active(b.principal),true);assert.ok(f.store.securityGet('a'));assert.ok(f.store.securityGet('b'));
 }finally{await f.close();}
});
test('confirmed report deletion is owner-only, origin-protected, revokes all owner sessions and preserves other owners and usage budgets',async()=>{
 const f=await fixture();try{
  const a=f.identity(1),second=f.identity(1),snap=f.identity(1,'snap'),b=f.identity(2);
  assert.equal(f.auth.saveReport(report('a1'),a.principal),true);assert.equal(f.auth.saveReport(report('a2'),a.principal),true);assert.equal(f.auth.saveReport(report('b'),b.principal),true);
  assert.equal(f.auth.takeAttempt(a.principal,3,10),true);
  assert.equal((await f.request('/api/wallet-auth/reports/delete',a.token,{confirm:true},'https://evil.example')).statusCode,401);
  assert.equal((await f.request('/api/wallet-auth/reports/delete',snap.token,{confirm:true})).statusCode,401);
  assert.equal((await f.request('/api/wallet-auth/reports/delete',a.token,{})).statusCode,400);
  assert.equal((await f.request('/api/wallet-auth/reports/delete',a.token,{confirm:true,address:b.principal.address})).statusCode,400);
  assert.ok(f.store.securityGet('a1'));
  const response=await f.request('/api/wallet-auth/reports/delete',a.token,{confirm:true});assert.equal(response.statusCode,200);assert.equal(response.headers['cache-control'],'no-store');assert.equal(response.json().reportsDeleted,2);
  assert.equal(f.store.securityGet('a1'),null);assert.equal(f.store.securityGet('a2'),null);assert.ok(f.store.securityGet('b'));assert.deepEqual(f.store.authSecurityList(b.principal.address).map(r=>r.id),['b']);
  for(const owner of [a,second,snap])assert.equal(f.auth.saveReport(report('a1'),owner.principal),false);
  assert.equal(f.store.authAttemptsToday(a.principal.address,new Date(start).toISOString()),1);assert.equal(f.auth.active(b.principal),true);
 }finally{await f.close();}
});
test('atomic report saves cannot overwrite foreign ownership and respect revocation across store connections',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'walletshield-save-fence-')),path=join(dir,'state.sqlite'),f=await fixture(path),other=createStore(path);
 try{
  const a=f.identity(1),b=f.identity(2);assert.equal(f.auth.saveReport(report('owned'),a.principal),true);assert.equal(f.auth.saveReport({...report('owned'),title:'forged'},b.principal),false);assert.equal(f.store.securityGet('owned')?.title,undefined);
  assert.notEqual(other.authRevokeAll(a.principal.address,a.principal.id,new Date(start).toISOString()),null);
  assert.equal(f.auth.saveReport({...report('owned'),title:'late model'},a.principal),false);assert.equal(f.store.securityGet('owned')?.title,undefined);
 }finally{other.close();await f.close();await rm(dir,{recursive:true,force:true});}
});
test('retention prunes only bounded expired hosted reports and leaves recent/local records and budget state intact',async()=>{
 const f=await fixture();try{
  const a=f.identity(1),b=f.identity(2),old='2029-12-01T00:00:00.000Z';
  for(let i=0;i<5;i++)assert.equal(f.auth.saveReport(report('old-'+i,old),i%2?a.principal:b.principal),true);
  assert.equal(f.auth.saveReport(report('recent'),a.principal),true);f.store.securitySave(report('unowned-local',old));f.auth.takeAttempt(a.principal,3,10);
  assert.equal(f.store.pruneHostedReports('2030-01-01T00:00:00.000Z',2),2);assert.equal(f.store.securityList().filter(r=>r.id.startsWith('old-')).length,3);
  assert.equal(f.store.pruneHostedReports('2030-01-01T00:00:00.000Z',2),2);assert.equal(f.store.pruneHostedReports('2030-01-01T00:00:00.000Z',2),1);assert.equal(f.store.pruneHostedReports('2030-01-01T00:00:00.000Z',2),0);
  assert.ok(f.store.securityGet('recent'));assert.ok(f.store.securityGet('unowned-local'));assert.equal(f.auth.active(a.principal),true);assert.equal(f.store.authAttemptsToday(a.principal.address,new Date(start).toISOString()),1);
  assert.throws(()=>f.store.pruneHostedReports('bad date'));assert.throws(()=>f.store.pruneHostedReports(old,501));
 }finally{await f.close();}
});
test('retention stays off by default and opt-in registration prunes one bounded startup batch',async()=>{
 for(const retentionDays of [0,1]){const f=await fixture(':memory:',retentionDays);try{const a=f.identity(1);assert.equal(f.auth.saveReport(report('old','2029-01-01T00:00:00.000Z'),a.principal),true);await f.app.ready();assert.equal(!!f.store.securityGet('old'),retentionDays===0);}finally{await f.close();}}
});
test('evidence reservations atomically enforce wallet, IP and global budgets without charging denied scopes',async()=>{
 const f=await fixture();try{
  const a=f.identity(1),snap=f.identity(1,'snap'),b=f.identity(2),c=f.identity(3);
  const reserve=(owner:typeof a,ip:string,extra:Partial<EvidenceScanLimits>={})=>f.auth.takeEvidenceAttempt(owner.principal,ip,{...limits,...extra});
  assert.equal(reserve(a,'192.0.2.1',{walletPerDay:1}),true);assert.equal(reserve(snap,'192.0.2.2',{walletPerDay:1}),false,'web and Snap share the same wallet budget');
  assert.equal(reserve(b,'192.0.2.2',{globalPerDay:2}),true,'wallet denial did not charge IP/global budgets');
  assert.equal(reserve(c,'192.0.2.3',{globalPerDay:2}),false);assert.equal(reserve(c,'192.0.2.3',{globalPerDay:3,ipPerDay:1}),true,'global denial did not charge the new IP');
 }finally{await f.close();}
});
test('evidence IP cap survives address switching, expiry resets windows, and counters persist across restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'walletshield-evidence-budget-')),path=join(dir,'state.sqlite');let f=await fixture(path);
 try{
  const a=f.identity(1),b=f.identity(2),shared={...limits,ipPerMinute:1,globalPerDay:3};assert.equal(f.auth.takeEvidenceAttempt(a.principal,'192.0.2.1',shared),true);assert.equal(f.auth.takeEvidenceAttempt(b.principal,'192.0.2.1',shared),false);
  await f.close();f=await fixture(path);assert.equal(f.auth.takeEvidenceAttempt(b.principal,'192.0.2.1',shared),false);
  f.time.value+=60000;assert.equal(f.auth.takeEvidenceAttempt(b.principal,'192.0.2.1',shared),true);assert.equal(f.auth.takeEvidenceAttempt(a.principal,'192.0.2.2',{...shared,globalPerDay:2}),false);
  f.time.value=start+86400000;assert.equal(f.auth.takeEvidenceAttempt(a.principal,'192.0.2.2',shared),false,'expired credentials cannot consume a new daily allowance');
 }finally{await f.close();await rm(dir,{recursive:true,force:true});}
});
test('hosted configuration bounds upstream budgets and leaves report retention explicitly disabled',()=>{
 const env={WALLETSHIELD_SERVICE_MODE:'hosted',WALLETSHIELD_APP_ORIGIN:origin};const config=serviceConfig(env);assert.equal(config.reportRetentionDays,0);assert.equal(config.scanWalletDailyLimit,100);assert.equal(config.scanIpDailyLimit,300);assert.equal(config.scanGlobalDailyLimit,1000);
 assert.equal(serviceConfig({...env,WALLETSHIELD_REPORT_RETENTION_DAYS:'30'}).reportRetentionDays,30);
 for(const [key,value] of [['WALLETSHIELD_REPORT_RETENTION_DAYS','3651'],['WALLETSHIELD_REPORT_RETENTION_DAYS','-1'],['WALLETSHIELD_SCAN_WALLET_DAILY_LIMIT','0'],['WALLETSHIELD_SCAN_IP_DAILY_LIMIT','100001'],['WALLETSHIELD_SCAN_GLOBAL_DAILY_LIMIT','NaN']])assert.throws(()=>serviceConfig({...env,[key]:value}));
});
