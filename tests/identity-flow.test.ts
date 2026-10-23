import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticateWallet} from '../web/src/identity.js';
const account='0x1111111111111111111111111111111111111111';
const credential={token:'a'.repeat(64),address:account,expiresAt:new Date(Date.now()+3600000).toISOString()};
test('wallet identity cannot complete when provider/account changes during backend verification',async()=>{
 let current=true,release:()=>void=()=>{},entered:()=>void=()=>{};const started=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
 const provider={request:async({method}:{method:string})=>method==='eth_accounts'?[account]:method==='eth_chainId'?'0x1':`0x${'a'.repeat(130)}`};
 const api=async<T>(path:string)=>{if(path.endsWith('challenge'))return {id:'id',message:'WalletShield login only'} as T;entered();await gate;return credential as T;};
 const result=authenticateWallet(provider,account,()=>current,api);await started;current=false;release();await assert.rejects(result,/changed/);
});
test('identity flow commits only a current matching account and never accepts a server address substitution',async()=>{
 const methods:string[]=[];const provider={request:async({method}:{method:string})=>{methods.push(method);return method==='eth_accounts'?[account]:method==='eth_chainId'?'0x1':`0x${'a'.repeat(130)}`;}};
 const api=async<T>(path:string)=>path.endsWith('challenge')?{id:'id',message:'WalletShield login only'} as T:credential as T;
 assert.equal((await authenticateWallet(provider,account,()=>true,api)).address,account);assert.deepEqual(methods,['eth_accounts','eth_chainId','personal_sign','eth_accounts']);
 await assert.rejects(()=>authenticateWallet(provider,account,()=>true,async<T>(path:string)=>path.endsWith('challenge')?{id:'id',message:'login'} as T:{...credential,address:'0x2222222222222222222222222222222222222222'} as T),/invalid/);
});
test('contract-wallet login validates its verified chain and rechecks the wallet after signing',async()=>{
 let chain='0x1';
 const provider={request:async({method}:{method:string})=>method==='eth_accounts'?[account]:method==='eth_chainId'?chain:`0x${'a'.repeat(130)}`};
 const apiFor=(chainId:unknown,switched=false)=>async<T>(path:string)=>{
  if(path.endsWith('challenge'))return {id:'id',message:'WalletShield login only'} as T;
  if(switched)chain='0xa';return {...credential,chainId} as T;
 };
 assert.equal((await authenticateWallet(provider,account,()=>true,apiFor(1))).chainId,1);
 for(const invalid of [null,'1',0,-1,10,Number.MAX_SAFE_INTEGER+1]){
  chain='0x1';await assert.rejects(()=>authenticateWallet(provider,account,()=>true,apiFor(invalid)),/different network/);
 }
 chain='0x1';await assert.rejects(()=>authenticateWallet(provider,account,()=>true,apiFor(1,true)),/network changed/);
});
