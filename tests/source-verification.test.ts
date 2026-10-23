import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sourceVerificationEvidence} from '../src/security/source-verification.js';
import {loadSecurityConfig,type SecurityConfig} from '../src/security/config.js';
import type {SecurityRequest,Operation,Evidence} from '../src/security/types.js';

const owner='0x1111111111111111111111111111111111111111',target='0x2222222222222222222222222222222222222222',token='0x4444444444444444444444444444444444444444';
const request:SecurityRequest={kind:'transaction',chainId:1,origin:'https://attacker-url.fixture.invalid',transaction:{from:owner,to:target,data:'0x',value:'0x0'}};
const op:Operation={category:'token_transfer',label:'Fixture',decoded:true,token,targets:[],fields:{}};
const config=(extra:Partial<SecurityConfig>={}):SecurityConfig=>({apiKey:'',model:'fixture',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{},...extra});
const find=(checks:Evidence[],id:string)=>{const row=checks.find(check=>check.id===id);assert.ok(row,id);return row;};
const sourceResponse=(address:string,chainId:number|string=1)=>({chainId,address,runtimeMatch:'exact_match',verifiedAt:'2026-01-01T00:00:00Z'});

test('source verification is separately opt-in and disabled collection emits no registry or price checks',async()=>{
 let calls=0;const fetcher:typeof fetch=async()=>{calls++;throw Error('Not enabled');};
 for(const cfg of [config(),config({lookups:true,sourceVerification:false})])assert.deepEqual(await sourceVerificationEvidence(request,op,cfg,fetcher),[]);
 assert.equal(calls,0,'GoPlus enablement does not enable a separate source service');
});

test('source lookup is fixed-host and chain/address bound; mismatches and unusable runtime records stay unknown',async()=>{
 for(const [index,response] of [sourceResponse(target),sourceResponse(target,10),{...sourceResponse(target),runtimeMatch:'creation-only'},sourceResponse(token),{}].entries()){
  const candidate='0x'+(1000+index).toString(16).padStart(40,'0'),req={...request,transaction:{...request.transaction,to:candidate}};
  const fetcher:typeof fetch=async(input,init)=>{const u=new URL(String(input));assert.equal(u.origin,'https://sourcify.dev');assert.equal(u.pathname,`/server/v2/contract/1/${candidate}`);assert.equal(u.searchParams.get('fields'),'match,creationMatch,runtimeMatch,verifiedAt');assert.equal(init?.redirect,'error');assert.ok(init?.signal);return new Response(JSON.stringify({...response,...(index===0?{address:candidate}:{})}));};
  const checks=await sourceVerificationEvidence(req,{...op,token:undefined},config({sourceVerification:true}),fetcher),row=find(checks,'registry_source_0');assert.equal(row.status,index===0?'pass':'unknown');
  if(index===0){assert.equal(row.data?.safetyCertified,false);assert.equal(row.data?.chainId,1);assert.equal(row.data?.address,candidate);assert.equal(row.data?.providerAsOf,null);}
  assert.equal(checks.length,1);
 }
});

test('source lookup normalizes and deduplicates decoded addresses and queries at most two without client URLs or RPC',async()=>{
 const second='0xABCDEF1234567890ABCDEF1234567890ABCDEF12',third='0x5555555555555555555555555555555555555555',urls:string[]=[];
 const fetcher:typeof fetch=async input=>{const url=new URL(String(input));urls.push(String(input));return new Response(JSON.stringify(sourceResponse(url.pathname.split('/').at(-1)!)));};
 const operation={...op,token:target,targets:[second,second.toLowerCase(),third,'https://attacker-url.fixture.invalid/data'],fields:{sourceUrl:'https://attacker-url.fixture.invalid/source',rpcUrl:'https://attacker-url.fixture.invalid/rpc'}};
 const checks=await sourceVerificationEvidence(request,operation,config({sourceVerification:true,rpc:{1:'https://configured-rpc.fixture.invalid'}}),fetcher);
 assert.equal(urls.length,2);assert.deepEqual(checks.map(check=>check.data?.address),[target,second.toLowerCase()]);assert.ok(checks.every(check=>check.status==='pass'));assert.ok(urls.every(url=>new URL(url).origin==='https://sourcify.dev'));
});

test('invalid, malformed, oversized and failed source responses never establish a runtime match',async()=>{
 for(const fetcher of [async()=>new Response('Unavailable',{status:503}),async()=>new Response('{'),async()=>new Response('null'),async()=>new Response(JSON.stringify({...sourceResponse(target),padding:' '.repeat(40001)})),async()=>{throw Error('Redirect or timeout');}] as (typeof fetch)[]){
  const checks=await sourceVerificationEvidence(request,{...op,token:undefined},config({sourceVerification:true}),fetcher);assert.equal(find(checks,'registry_source_0').status,'unknown');assert.equal(checks[0].data?.runtimeMatch,undefined);
 }
});

test('a typed-data domain supplies a missing chain, but no source lookup runs for invalid or absent chain identity',async()=>{
 let calls=0;const fetcher:typeof fetch=async input=>{calls++;const url=new URL(String(input));assert.ok(url.pathname.startsWith('/server/v2/contract/10/'));return new Response(JSON.stringify(sourceResponse(target,10)));};
 const req:SecurityRequest={kind:'signature',chainId:0,signature:{from:owner,method:'eth_signTypedData_v4',data:{}}};
 const checks=await sourceVerificationEvidence(req,{...op,token:undefined,fields:{domainChainId:'10',verifyingContract:target}},config({sourceVerification:true}),fetcher);assert.equal(find(checks,'registry_source_0').status,'pass');
 for(const chain of ['','not-a-chain','0','-1','1.5',String(Number.MAX_SAFE_INTEGER+1)])assert.deepEqual(await sourceVerificationEvidence(req,{...op,fields:{domainChainId:chain}},config({sourceVerification:true}),fetcher),[]);
 assert.equal(calls,1);
});

test('legacy registry files are ignored regardless of old deployment/feed/route values or malformed contents',async()=>{
 const root=await mkdtemp(join(tmpdir(),'walletshield-legacy-registry-'));try{
  await mkdir(join(root,'.local'));
  const baseline=await loadSecurityConfig({root,env:{}});
  for(const body of ['{"version":1,"deployments":"not-an-array"}',' '.repeat(200001),JSON.stringify({version:1,deployments:[{chainId:1,address:target}],priceFeeds:[{asset:token,feed:target}],bridgeRoutes:[{sourceChainId:1,destinationChainId:10}]})]){
   await writeFile(join(root,'.local/registry.json'),body);const cfg=await loadSecurityConfig({root,env:{}});assert.deepEqual(cfg,baseline);assert.equal(cfg.apiKey,'');assert.equal(cfg.sourceVerification,false);
   for(const removed of ['trustedDeployments','priceFeeds','bridgeRoutes','registryError'])assert.equal(Object.hasOwn(cfg,removed),false);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});

test('source cache coalesces chain/address work, expires success after five minutes and errors after one minute, and stays bounded',async()=>{
 const originalNow=Date.now;let clock=originalNow(),calls=0,fail=false;Date.now=()=>clock;
 const fetcher:typeof fetch=async input=>{calls++;const parts=new URL(String(input)).pathname.split('/'),address=parts.at(-1)!,chainId=parts.at(-2)!;return fail?new Response('Unavailable',{status:503}):new Response(JSON.stringify(sourceResponse(address,chainId)));};
 const cfg=config({sourceVerification:true}),operation={...op,token:undefined},observe=(chainId=1,at=target)=>sourceVerificationEvidence({...request,chainId,transaction:{...request.transaction,to:at}},operation,cfg,fetcher);
 try{await Promise.all([observe(),observe()]);assert.equal(calls,1,'in-flight same-subject lookups are coalesced');clock+=299999;await observe();assert.equal(calls,1);clock+=1;await observe();assert.equal(calls,2);await observe(10);assert.equal(calls,3,'same address on another chain never reuses source identity');
  fail=true;const failedAt='0x9999999999999999999999999999999999999999';assert.equal(find(await observe(1,failedAt),'registry_source_0').status,'unknown');assert.equal(calls,4);clock+=59999;await observe(1,failedAt);assert.equal(calls,4);clock+=1;fail=false;assert.equal(find(await observe(1,failedAt),'registry_source_0').status,'pass');assert.equal(calls,5);
  const before=calls,first='0x'+(20000).toString(16).padStart(40,'0');for(let i=0;i<129;i++)await observe(1,'0x'+(20000+i).toString(16).padStart(40,'0'));assert.equal(calls,before+129);await observe(1,first);assert.equal(calls,before+130,'at most 128 source subjects are retained per fetch transport');
 }finally{Date.now=originalNow;}
});
