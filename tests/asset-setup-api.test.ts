import test from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../src/server/app.js';
import {createStore} from '../src/server/store.js';
import type {LabOptions} from '../src/testing/api.js';
import type {ServiceConfig} from '../src/server/service-config.js';

const address=('0x'+'1'.repeat(40)) as `0x${string}`,token=('0x'+'2'.repeat(40)) as `0x${string}`;
const headers={origin:'http://127.0.0.1:5173'};
const security={config:async()=>({apiKey:'',model:'unused',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{}})};
const inventory={account:address,chainId:31337,blockNumber:'10',eth:'9.9987',ready:true,assets:[],nfts:[],positions:{vaultSharesRaw:'0',collateralRaw:'0',debtRaw:'0',stakedRaw:'0',liquidityUnitsRaw:'0',controlOwner:address},note:'Synthetic offline inventory'};
const funds={chainId:31337,address,token,eth:'10000000000000000000',testUsd:'5000000000',mintTransaction:null,source:'local-anvil' as const};
const assets={address,inventory,token,quote:token,nft:token,scope:'local-fixtures',message:'Synthetic offline preparation result'};
const cleared={address,account:address,chainId:31337 as const,cleared:true as const,sink:token,blockNumber:'11',transactionCount:1,clearedNftIds:[],balances:{eth:'0',base:'0',token:'0',quote:'0',honey:'0',wrapped:'0',nft:'0',multi1:'0',multi2:'0'},positionsUnchanged:true as const,erc20AllowancesUnchanged:true as const,operatorApprovalsUnchanged:true as const,nftTokenApprovalsClearedByTransfer:false,inventory:{...inventory,eth:'0',ready:false},scope:'local-wallet-balances' as const,message:'Synthetic offline clear result'};
function stubs(events:string[]):LabOptions {
 return {
  preflight:async()=>{events.push('preflight');return {deployment:{},artifacts:{}} as Awaited<ReturnType<NonNullable<LabOptions['preflight']>>>;},
  prepareFunds:async target=>{assert.equal(target,address);events.push('fund');return funds;},
  prepareAssets:async target=>{assert.equal(target,address);events.push('prepare');return assets;},
  clearAssets:async target=>{assert.equal(target,address);events.push('clear');return cleared;},
  inventory:async target=>{assert.equal(target,address);events.push('inventory');return inventory;}
 };
}
const payload=(route:string)=>route==='/api/lab/clear'?{address,confirm:true}:{address};
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}

test('asset preparation preflights before any funding and returns final formatted inventory ETH',async()=>{
 const store=createStore(':memory:'),events:string[]=[],lab=stubs(events);
 const app=await buildApp(store,{security,lab});
 try{
  const response=await app.inject({method:'POST',url:'/api/lab/prepare',headers,payload:{address}});
  assert.equal(response.statusCode,200);assert.deepEqual(events,['preflight','fund','prepare']);
  assert.equal(response.json().eth,inventory.eth);assert.equal(response.json().inventory.eth,inventory.eth);
  assert.notEqual(response.json().eth,funds.eth,'A pre-write wei balance must not replace the final formatted ETH inventory.');
 }finally{await app.close();store.close();}
});

test('preflight failure prevents funding and preparation writes; a later retry can acquire the lock',async()=>{
 const store=createStore(':memory:'),events:string[]=[],lab=stubs(events);let fail=true;
 lab.preflight=async()=>{events.push('preflight');if(fail)throw Error('Fixture artifact missing');return {deployment:{},artifacts:{}} as Awaited<ReturnType<NonNullable<LabOptions['preflight']>>>;};
 const app=await buildApp(store,{security,lab});
 try{
  const failed=await app.inject({method:'POST',url:'/api/lab/prepare',headers,payload:{address}});
  assert.equal(failed.statusCode,503);assert.deepEqual(events,['preflight']);
  fail=false;events.length=0;
  assert.equal((await app.inject({method:'POST',url:'/api/lab/prepare',headers,payload:{address}})).statusCode,200);
  assert.deepEqual(events,['preflight','fund','prepare']);
 }finally{await app.close();store.close();}
});

test('invalid or foreign asset mutation requests are rejected before any dependency is invoked',async()=>{
 const store=createStore(':memory:'),events:string[]=[],app=await buildApp(store,{security,lab:stubs(events),fund:async()=>{events.push('standalone-fund');return funds;}});
 try{
  for(const route of ['/api/local/fund','/api/lab/prepare','/api/lab/clear']) {
   for(const origin of [undefined,'https://foreign.example','null'])assert.equal((await app.inject({method:'POST',url:route,headers:origin?{origin}:{},payload:payload(route)})).statusCode,403,route);
   for(const invalid of [{address:'not-an-address'},{address:'0x'+'0'.repeat(40)},{...payload(route),rpcUrl:'https://untrusted.example'}])assert.equal((await app.inject({method:'POST',url:route,headers,payload:invalid})).statusCode,400,route);
  }
  for(const invalid of [{address},{address,confirm:false},{address,confirm:'true'},{address,confirm:true,allAccounts:true}])assert.equal((await app.inject({method:'POST',url:'/api/lab/clear',headers,payload:invalid})).statusCode,400);
  assert.deepEqual(events,[]);
 }finally{await app.close();store.close();}
});

test('fund, prepare and clear share one mutation lock in every direction and release it after completion',async()=>{
 const routes=['/api/local/fund','/api/lab/prepare','/api/lab/clear'];
 for(const active of routes) {
  const store=createStore(':memory:'),events:string[]=[],lab=stubs(events),started=deferred(),release=deferred();
  const block=async()=>{started.resolve();await release.promise;};
  const fund=async()=>{events.push('standalone-fund');if(active==='/api/local/fund')await block();return funds;};
  if(active==='/api/lab/prepare')lab.prepareAssets=async()=>{events.push('prepare');await block();return assets;};
  if(active==='/api/lab/clear')lab.clearAssets=async()=>{events.push('clear');await block();return cleared;};
  const app=await buildApp(store,{security,lab,fund});
  let pending:Promise<unknown>|undefined;
  try{
   const response=app.inject({method:'POST',url:active,headers,payload:payload(active)}).then(result=>result);
   pending=response;await started.promise;const before=[...events];
   for(const blocked of routes)assert.equal((await app.inject({method:'POST',url:blocked,headers,payload:payload(blocked)})).statusCode,409,`${active} must block ${blocked}`);
   assert.deepEqual(events,before,'Rejected requests must not enter mutation dependencies.');
   release.resolve();assert.equal((await response).statusCode,200);
   assert.equal((await app.inject({method:'POST',url:'/api/lab/prepare',headers,payload:{address}})).statusCode,200,'The completed mutation must release the lock.');
  }finally{release.resolve();await pending;await app.close();store.close();}
 }
});

test('clear calls only the selected-account cleanup dependency and releases the lock on failure',async()=>{
 const store=createStore(':memory:'),events:string[]=[],lab=stubs(events);let fail=true;
 lab.clearAssets=async target=>{assert.equal(target,address);events.push('clear');if(fail)throw Error('Cleanup receipt reverted');return cleared;};
 const app=await buildApp(store,{security,lab});
 try{
  const failed=await app.inject({method:'POST',url:'/api/lab/clear',headers,payload:{address,confirm:true}});
  assert.equal(failed.statusCode,503);assert.deepEqual(events,['clear']);
  fail=false;assert.equal((await app.inject({method:'POST',url:'/api/lab/clear',headers,payload:{address,confirm:true}})).statusCode,200);
  assert.deepEqual(events,['clear','clear']);
 }finally{await app.close();store.close();}
});

test('inventory uses the injected read-only provider and rejects invalid addresses',async()=>{
 const store=createStore(':memory:'),events:string[]=[],app=await buildApp(store,{security,lab:stubs(events)});
 try{
  const result=await app.inject({url:`/api/lab/inventory?address=${address}`,headers});assert.equal(result.statusCode,200);assert.equal(result.json().eth,inventory.eth);
  assert.equal((await app.inject({url:'/api/lab/inventory?address=invalid',headers})).statusCode,400);assert.deepEqual(events,['inventory']);
 }finally{await app.close();store.close();}
});

test('hosted mode does not expose local clear, prepare or funding routes',async()=>{
 const store=createStore(':memory:'),events:string[]=[],service:ServiceConfig={mode:'hosted',origin:'https://walletshield.example',origins:['https://walletshield.example'],hosts:['walletshield.example'],walletDailyLimit:20,maxScans:1};
 const app=await buildApp(store,{security,service,lab:stubs(events),fund:async()=>{events.push('standalone-fund');return funds;}});
 try{
  for(const route of ['/api/local/fund','/api/lab/prepare','/api/lab/clear'])assert.equal((await app.inject({method:'POST',url:route,headers:{host:'walletshield.example',origin:service.origin},payload:payload(route)})).statusCode,404);
  assert.deepEqual(events,[]);
 }finally{await app.close();store.close();}
});
