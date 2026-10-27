import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {privateKeyToAccount} from 'viem/accounts';
import {validLabRpc,registerHostedLabRpc} from '../src/testing/hosted-rpc.js';
import {hostedLabAccess} from '../src/testing/hosted-access.js';
import {createStore} from '../src/server/store.js';
import type {WalletAuth,WalletPrincipal} from '../src/server/wallet-auth.js';
import {newLabSession} from '../src/testing/sessions.js';
import {registerLab} from '../src/testing/api.js';
const alice=privateKeyToAccount(('0x'+'ab'.repeat(32)) as `0x${string}`),bob=privateKeyToAccount(('0x'+'cd'.repeat(32)) as `0x${string}`);
const rpc=(method:string,params:unknown[]=[])=>({jsonrpc:'2.0',id:1,method,params});
const p=(address:string,kind:'web'|'snap'='web',chainId?:number):WalletPrincipal=>({address:address.toLowerCase(),id:'a'.repeat(64),kind,expiresAt:'2100-01-01T00:00:00Z',...(chainId?{chainId}:{})});

test('test RPC rejects management, unlocked sends, batching and state overrides',()=>{
 for(const method of ['anvil_setBalance','anvil_reset','anvil_impersonateAccount','eth_sendTransaction','debug_traceCall','evm_mine','eth_accounts','eth_sign','wallet_requestPermissions'])assert.equal(validLabRpc(rpc(method)),false,method);
 assert.equal(validLabRpc([rpc('eth_chainId')]),false);
 assert.equal(validLabRpc({...rpc('eth_chainId'),url:'http://evil.example'}),false);
 assert.equal(validLabRpc(rpc('eth_call',[{to:alice.address},'latest',{}])),false);
 assert.equal(validLabRpc(rpc('eth_call',[{to:alice.address,gas:'0xffffff'}])),false);
 assert.equal(validLabRpc(rpc('eth_getLogs',[{fromBlock:'0x0',toBlock:'latest'}])),false);
 assert.equal(validLabRpc(rpc('eth_getLogs',[{fromBlock:'0x0',toBlock:'0xffff'}])),false);
 assert.equal(validLabRpc(rpc('eth_call',[{to:alice.address},'latest'])),true);
 assert.equal(validLabRpc(rpc('eth_chainId')),true);
});

test('shared test lease is account scoped and expires; Snap and foreign contract identities cannot manage assets',()=>{
 const store=createStore(':memory:');let time=1000;let who:WalletPrincipal|null=p(alice.address);
 const access=hostedLabAccess({authenticate:()=>who} as unknown as WalletAuth,store,()=>time);
 try{
  assert.equal(access.owns({} as any,bob.address),false);
  assert.equal(access.takeLease(alice.address),true);assert.equal(access.maySend(alice.address),true);
  assert.equal(access.takeLease(bob.address),false);assert.equal(access.maySend(bob.address),false);
  time+=15*60*1000+1;assert.equal(access.maySend(alice.address),false);assert.equal(access.takeLease(bob.address),true);
  who=p(alice.address,'snap');assert.equal(access.principal({} as any),null);
  who=p(alice.address,'web',1);assert.equal(access.principal({} as any),null);
  who=p(alice.address,'web',31338);assert.equal(access.owns({} as any,alice.address),true);
  for(let i=0;i<4;i++)assert.equal(access.mutation(alice.address),true);assert.equal(access.mutation(alice.address),false);
 }finally{store.close();}
});

test('hosted lab history is private and asset operations require authenticated same-account origin',async()=>{
 const store=createStore(':memory:'),app=Fastify();let who:WalletPrincipal|null=null;
 const access=hostedLabAccess({authenticate:()=>who} as unknown as WalletAuth,store);
 registerLab(app,store,{hosted:{origin:'https://walletshield.example',access}});
 const mine=newLabSession('test',{kind:'transaction',chainId:31338,transaction:{from:alice.address,to:bob.address,data:'0x'}}).session;
 const other=newLabSession('test',{kind:'transaction',chainId:31338,transaction:{from:bob.address,to:alice.address,data:'0x'}}).session;
 store.labSave(mine);store.labSave(other);
 try{
  assert.equal((await app.inject({url:'/api/lab/sessions'})).statusCode,401);
  who=p(alice.address);
  const list=await app.inject({url:'/api/lab/sessions'});assert.deepEqual(list.json().map((s:any)=>s.id),[mine.id]);
  assert.equal((await app.inject({url:'/api/lab/sessions/'+other.id})).statusCode,404);
  assert.equal((await app.inject({url:'/api/lab/inventory?address='+bob.address})).statusCode,403);
  for(const origin of ['https://foreign.example',undefined])assert.equal((await app.inject({method:'POST',url:'/api/lab/clear',headers:origin?{origin}:{},payload:{address:alice.address,confirm:true}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/api/lab/clear',headers:{origin:'https://walletshield.example'},payload:{address:bob.address,confirm:true}})).statusCode,403);
 }finally{await app.close();store.close();}
});

test('RPC forwards fixed endpoint only and sends signed transactions only for leased account on sandbox chain',async()=>{
 const app=Fastify();let calls=0,allow=true;
 registerHostedLabRpc(app,{maySend:a=>a.toLowerCase()===alice.address.toLowerCase(),takeRate:()=>allow,fetcher:(async(url,init)=>{
  calls++;assert.equal(url,'http://127.0.0.1:8546');const body=JSON.parse(String(init?.body));return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result:body.method==='eth_chainId'?'0x7a6a':'0x'+'1'.repeat(64)}));
 }) as typeof fetch});
 try{
  const send=(payload:unknown)=>app.inject({method:'POST',url:'/api/test-rpc',payload:payload as object});
  assert.equal((await send(rpc('anvil_reset'))).json().error.code,-32601);assert.equal(calls,0);
  assert.equal((await send(rpc('eth_chainId'))).json().result,'0x7a6a');
  const signed=async(account:typeof alice,chainId:number)=>account.signTransaction({chainId,to:bob.address,value:1n,gas:21000n,gasPrice:1n,nonce:0});
  assert.ok((await send(rpc('eth_sendRawTransaction',[await signed(alice,1)]))).json().error);
  assert.ok((await send(rpc('eth_sendRawTransaction',[await signed(bob,31338)]))).json().error);
  assert.ok((await send(rpc('eth_sendRawTransaction',[await signed(alice,31338)]))).json().result);
  assert.equal(calls,2);
  allow=false;assert.equal((await send(rpc('eth_chainId'))).statusCode,429);assert.equal(calls,2);
 }finally{await app.close();}
});
