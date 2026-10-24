import test from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../src/server/app.js';
import {createStore} from '../src/server/store.js';
import {networkList,probeNetwork,type NetworkSnapshot} from '../src/server/networks.js';
import {discoverWallets,defaultWallet,walletAccounts,walletChain,type WalletProvider} from '../web/src/wallet.js';
const config={apiKey:'do-not-expose-muse',model:'muse-wonder-1.0',aiEnabled:true,lookups:false,goPlusToken:'',rpc:{31337:'http://127.0.0.1:8545',1:'https://mainnet.infura.io/v3/do-not-expose-rpc',11155111:'https://sepolia.infura.io/v3/do-not-expose-rpc'}};
const origin='http://127.0.0.1:5173',address='0x1111111111111111111111111111111111111111';
const snapshot:NetworkSnapshot={chainId:11155111,network:'Sepolia',checkedAt:'2026-10-22T00:00:00Z',blockNumber:'100',blockHash:'0x'+'1'.repeat(64),blockTime:'2026-10-22T00:00:00Z',latencyMs:1};
test('public network listing distinguishes configuration from connection and never exposes RPC credentials or local lab',()=>{
 const list=networkList(config);assert.deepEqual(list.map(n=>n.chainId),[11155111,1]);assert.equal(list[0].testnet,true);assert.equal(list[1].testnet,false);assert.ok(!JSON.stringify(list).includes('do-not-expose'));
});
test('real network probe is read-only, verifies chain before querying an account, and pins account reads to the observed block',async()=>{
 const calls:{method:string;params:unknown[]}[]=[];
 const fetcher:typeof fetch=async(_url,init)=>{const request=JSON.parse(String(init?.body));calls.push(request);const result=request.method==='eth_chainId'?'0xaa36a7':request.method==='eth_getBlockByNumber'?{number:'0x64',timestamp:'0x68f7f100',hash:'0x'+'1'.repeat(64)}:request.method==='eth_getBalance'?'0xde0b6b3a7640000':'0xef0100'+'2'.repeat(40);return new Response(JSON.stringify({jsonrpc:'2.0',id:request.id,result}));};
 const result=await probeNetwork(config.rpc[11155111],11155111,address,fetcher);assert.equal(result.account?.balanceEth,'1');assert.equal(result.account?.delegatedCode,true);assert.deepEqual(calls.map(c=>c.method),['eth_chainId','eth_getBlockByNumber','eth_getBalance','eth_getCode','eth_call','eth_getBalance','debug_traceCall','trace_call']);assert.deepEqual(calls[2].params,[address,'0x64']);assert.deepEqual(calls[3].params,[address,'0x64']);assert.equal(result.capabilities?.historicalBlock,'0');assert.equal(result.capabilities?.callTrace,'unavailable','A hex response is not a usable call trace');
 let n=0;await assert.rejects(()=>probeNetwork(config.rpc[1],1,address,async(_url,init)=>{n++;const r=JSON.parse(String(init?.body));return new Response(JSON.stringify({jsonrpc:'2.0',id:r.id,result:'0xaa36a7'}));}),/wrong_chain/);assert.equal(n,1,'Wrong network must not receive the wallet address');
});
test('public network API rejects foreign origins, unconfigured networks, forged RPCs and local funding requests; status never generates AI scores',async()=>{
 const store=createStore(':memory:');let probes=0;
 const app=await buildApp(store,{security:{config:async()=>config},networkProbe:async(url,id,who)=>{probes++;assert.equal(url,config.rpc[11155111]);assert.equal(id,11155111);assert.equal(who,address);return snapshot;}});
 try{
  const list=await app.inject({url:'/api/networks'});assert.equal(list.statusCode,200);assert.ok(!list.body.includes('do-not-expose'));assert.equal(Object.hasOwn(list.json(),'evidenceConfiguration'),false);
  const status=await app.inject({url:'/api/security/status'});assert.equal(status.statusCode,200);assert.equal(Object.hasOwn(status.json(),'registry'),false);
  for(const [headers,payload,code] of [[{origin:'https://evil.example'},{chainId:11155111},403],[{}, {chainId:11155111},403],[{origin},{chainId:31337},400],[{origin},{chainId:8453},409],[{origin},{chainId:11155111,rpcUrl:'https://evil.example'},400],[{origin},{chainId:11155111,address:'0x1234'},400]] as const){assert.equal((await app.inject({method:'POST',url:'/api/networks/check',headers,payload})).statusCode,code);}
  for(let i=0;i<2;i++){const result=await app.inject({method:'POST',url:'/api/networks/check',headers:{origin},payload:{chainId:11155111,address}});assert.equal(result.statusCode,200);assert.equal(result.json().cached,i===1);assert.ok(!result.body.includes('do-not-expose'));}
  assert.equal(probes,1);assert.equal(store.securityAiCallsToday(),0);assert.equal(store.securityList().length,0);
 }finally{await app.close();store.close();}
});
test('network query errors do not echo provider URLs, secrets or arbitrary provider messages',async()=>{
 const store=createStore(':memory:');const app=await buildApp(store,{security:{config:async()=>config},networkProbe:async()=>{throw Error('https://provider.example/secret-key');}});
 try{const response=await app.inject({method:'POST',url:'/api/networks/check',headers:{origin},payload:{chainId:11155111}});assert.equal(response.statusCode,502);assert.ok(!response.body.includes('secret-key'));}finally{await app.close();store.close();}
});
test('loopback Host validation prevents DNS-rebinding access and legacy mutation APIs require local origin',async()=>{
 const store=createStore(':memory:'),app=await buildApp(store,{security:{config:async()=>config}});
 try{
  for(const host of ['evil.example','localhost.evil.example','127.0.0.1.evil.example'])assert.equal((await app.inject({url:'/api/security/records',headers:{host}})).statusCode,403);
  for(const url of ['/api/records','/api/scenarios','/api/local','/api/lab/status'])for(const origin of ['null','https://evil.example'])assert.equal((await app.inject({method:'GET',url,headers:{origin}})).statusCode,403);
  for(const url of ['/api/analyze','/api/demo/unknown','/api/records/unknown/demo-decision'])assert.equal((await app.inject({method:'POST',url,headers:{origin:'https://evil.example'},payload:{}})).statusCode,403);
  assert.equal((await app.inject({url:'/api/health',headers:{host:'127.0.0.1:8787'}})).statusCode,200);
 }finally{await app.close();store.close();}
});
test('EIP-6963 selects explicit provider objects, removes duplicate legacy provider and cleans up listeners',()=>{
 const target=new EventTarget(),legacy:WalletProvider={request:async()=>[]},flask:WalletProvider={request:async()=>[]};let latest:any[]=[];let requests=0;target.addEventListener('eip6963:requestProvider',()=>requests++);
 const stop=discoverWallets(target,legacy,w=>latest=w);assert.equal(latest[0].provider,legacy);assert.equal(requests,1);
 const announce=(provider:WalletProvider,uuid:string,rdns:string)=>target.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid,name:rdns,rdns},provider}}));
 announce(legacy,'11111111-1111-1111-1111-111111111111','io.metamask');assert.equal(latest.length,1);announce(flask,'22222222-2222-2222-2222-222222222222','io.metamask.flask');assert.equal(latest.length,2);assert.equal(defaultWallet(latest)?.provider,flask);
 announce(flask,'22222222-2222-2222-2222-222222222222','io.metamask.flask');assert.equal(latest.length,2);stop();announce({request:async()=>[]},'33333333-3333-3333-3333-333333333333','other');assert.equal(latest.length,2);
 assert.deepEqual(walletAccounts([address]),[address]);assert.throws(()=>walletAccounts(['invalid']));assert.equal(walletChain('0xaa36a7'),11155111);assert.equal(walletChain('11155111'),null);assert.equal(walletChain('0x20000000000000'),null);
});
