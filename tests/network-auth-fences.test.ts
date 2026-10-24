import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildApp} from '../src/server/app.js';
import {createStore} from '../src/server/store.js';
import type {NetworkSnapshot} from '../src/server/networks.js';
const origin='https://walletshield.example',host='walletshield.example',address='0x'+'1'.repeat(40),chainId=1;
const configuration={apiKey:'',model:'offline-only',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{1:'https://offline.fixture.invalid'}};
const headers=(token:string)=>({origin,host,authorization:'Bearer '+token});
const snapshot=(sequence:number):NetworkSnapshot=>({chainId,network:'Offline',checkedAt:new Date().toISOString(),blockNumber:String(sequence),blockHash:'0x'+'a'.repeat(64),blockTime:new Date().toISOString(),latencyMs:0,account:{address,balanceWei:String(sequence),balanceEth:'0',hasCode:false,delegatedCode:false}});
async function fixture(phase:'config'|'probe',warm=false,probeFails=false){
 const store=createStore(':memory:');let entered!:()=>void,release!:()=>void,armed=!warm,paused=false,probeCalls=0;
 const started=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
 const pause=async(at:'config'|'probe')=>{if(armed&&!paused&&phase===at){paused=true;entered();await gate;}};
 const app=await buildApp(store,{service:{mode:'hosted',origin,origins:[origin],hosts:[host],walletDailyLimit:10,maxScans:3},security:{config:async()=>{await pause('config');return configuration;}},networkProbe:async()=>{probeCalls++;await pause('probe');if(probeFails&&probeCalls===1)throw Error('Offline provider failure');return snapshot(probeCalls);}});
 const seed=(character:string)=>{const token=character.repeat(64);store.authTokenSave({id:createHash('sha256').update(token).digest('hex'),address,kind:'web',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});return token;};
 const check=(token:string)=>app.inject({method:'POST',url:'/api/networks/check',headers:headers(token),payload:{chainId,address}});
 const invalidate=(token:string,action:'revoke'|'reports/delete')=>app.inject({method:'POST',url:'/api/wallet-auth/'+action,headers:headers(token),payload:action==='revoke'?{}:{confirm:true}});
 return {app,store,seed,check,invalidate,started,release,arm:()=>armed=true,probes:()=>probeCalls,close:async()=>{release();await app.close();store.close();}};
}

test('revocation or report deletion during configuration prevents the first network probe and returns 401',async()=>{
 for(const action of ['revoke','reports/delete'] as const){const f=await fixture('config');try{
  const token=f.seed('a'),pending=Promise.resolve(f.check(token));await f.started;assert.equal((await f.invalidate(token,action)).statusCode,200);f.release();const denied=await pending;assert.equal(denied.statusCode,401,denied.body);assert.equal(f.probes(),0);
  const fresh=f.seed('b'),response=await f.check(fresh);assert.equal(response.statusCode,200,response.body);assert.equal(response.json().cached,false);assert.equal(f.probes(),1);assert.equal((await f.check(token)).statusCode,401,'A populated cache must not revive revoked credentials.');
 }finally{await f.close();}}
});
test('revocation or report deletion during a network probe discards the response without adding it to cache',async()=>{
 for(const action of ['revoke','reports/delete'] as const){const f=await fixture('probe');try{
  const token=f.seed('a'),pending=Promise.resolve(f.check(token));await f.started;assert.equal(f.probes(),1);assert.equal((await f.invalidate(token,action)).statusCode,200);f.release();const denied=await pending;assert.equal(denied.statusCode,401,denied.body);assert.equal(denied.json().account,undefined);assert.equal(denied.json().blockHash,undefined);
  const fresh=f.seed('b'),response=await f.check(fresh);assert.equal(response.statusCode,200,response.body);assert.equal(response.json().cached,false,'An unauthorized in-flight result must not populate cache.');assert.equal(response.json().account.balanceWei,'2');assert.equal(f.probes(),2);
 }finally{await f.close();}}
});
test('an existing network cache cannot be read after revocation while configuration is awaited',async()=>{
 const f=await fixture('config',true);try{
  const token=f.seed('a');assert.equal((await f.check(token)).statusCode,200);assert.equal(f.probes(),1);f.arm();const pending=Promise.resolve(f.check(token));await f.started;assert.equal((await f.invalidate(token,'revoke')).statusCode,200);f.release();const denied=await pending;assert.equal(denied.statusCode,401);assert.equal(denied.json().account,undefined);assert.equal(f.probes(),1);
 }finally{await f.close();}
});
test('a revoked identity receives 401 even if its in-flight network probe fails, without leaking provider details',async()=>{
 const f=await fixture('probe',false,true);try{
  const token=f.seed('a'),pending=Promise.resolve(f.check(token));await f.started;assert.equal((await f.invalidate(token,'revoke')).statusCode,200);f.release();const denied=await pending;assert.equal(denied.statusCode,401);assert.ok(!denied.body.includes('provider failure'));
 }finally{await f.close();}
});
