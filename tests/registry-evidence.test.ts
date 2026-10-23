import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decodeFunctionData,encodeFunctionResult,keccak256,parseAbi,type Hex} from 'viem';
import {registrySchema,verifyTrustedDeployment,registryEvidence,type TrustedDeployment,type PriceFeed} from '../src/security/registry.js';
import {loadSecurityConfig,type SecurityConfig} from '../src/security/config.js';
import {pinnedRpc} from '../src/security/trusted-rpc.js';
import type {SecurityRequest,Operation,Evidence} from '../src/security/types.js';
const owner='0x1111111111111111111111111111111111111111',target='0x2222222222222222222222222222222222222222',implementation='0x3333333333333333333333333333333333333333',token='0x4444444444444444444444444444444444444444',feed='0x5555555555555555555555555555555555555555',secondFeed='0x6666666666666666666666666666666666666666',code='0x6000',implementationCode='0x6001',url='https://configured-rpc.fixture.invalid',sourceUrl='https://primary.fixture.invalid/source',blockHash=('0x'+'aa'.repeat(32)) as Hex;
const record:TrustedDeployment={chainId:1,address:target,protocol:'fixture',version:'1',role:'router',codeHash:keccak256(code),sourceUrl};
const price:PriceFeed={chainId:1,asset:token,feed,codeHash:keccak256(code),currency:'USD',assetDecimals:6,maxAgeSeconds:100,expectedDescription:'TOKEN / USD',sourceUrl};
const request:SecurityRequest={kind:'transaction',chainId:1,origin:'https://attacker-url.fixture.invalid',transaction:{from:owner,to:target,data:'0x',value:'0x0'}};
const op:Operation={category:'token_transfer',label:'Fixture',decoded:true,token,targets:[],fields:{}};
const config=(extra:Partial<SecurityConfig>={}):SecurityConfig=>({apiKey:'',model:'fixture',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{1:url},trustedDeployments:[record],priceFeeds:[],...extra});
const feeds=parseAbi(['function decimals() view returns(uint8)','function description() view returns(string)','function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)']);
type Call={method:string;params:any[];name?:string;target?:string};
function rpc(change?:(call:Call,result:any)=>any){const calls:Call[]=[];const fetcher:typeof fetch=async(input,init)=>{assert.equal(String(input),url,'only configured RPC is queried');const body=JSON.parse(String(init?.body)),call:Call=body;calls.push(call);let result:any=body.method==='eth_chainId'?'0x1':body.method==='eth_getBlockByNumber'?{number:'0x2a',hash:blockHash,timestamp:'0x3e8'}:body.method==='eth_getCode'?body.params[0]===implementation?implementationCode:code:body.method==='eth_getStorageAt'?'0x'+'0'.repeat(24)+implementation.slice(2):undefined;
  if(body.method==='eth_call'){const decoded=decodeFunctionData({abi:feeds,data:body.params[0].data});call.name=decoded.functionName;call.target=body.params[0].to;result=encodeFunctionResult({abi:feeds,functionName:decoded.functionName,result:(decoded.functionName==='decimals'?8:decoded.functionName==='description'?'TOKEN / USD':[5n,123456789n,980n,990n,5n]) as never});}
  if(change)result=change(call,result);return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,...(result===undefined?{error:{code:-32000,message:'Fixture unavailable'}}:{result})}));};return {calls,fetcher};}
const find=(checks:Evidence[],id:string)=>{const row=checks.find(check=>check.id===id);assert.ok(row,id);return row;};
test('maintained registry schema rejects unsafe URLs, duplicate chain subjects and unbounded/invalid bridge/feed declarations',()=>{
 const base={version:1,deployments:[record],priceFeeds:[price]};assert.equal(registrySchema.safeParse(base).success,true);
 for(const bad of [{...base,deployments:[record,{...record,address:record.address.toUpperCase().replace('0X','0x')}]},{...base,deployments:[{...record,sourceUrl:'https://user:password@primary.fixture.invalid'}]},{...base,deployments:[{...record,sourceUrl:sourceUrl+'?key=secret'}]},{...base,deployments:[{...record,chainId:0}]},{...base,priceFeeds:[{...price,assetDecimals:37}]},{...base,priceFeeds:[price,price]},{...base,unknownField:true},{...base,bridgeRoutes:[{adapter:'op-standard-bridge-v1',sourceChainId:1,destinationChainId:1,sourceBridge:target,destinationBridge:implementation,sourceMessenger:token,destinationMessenger:feed,sourceUrl}]}])assert.equal(registrySchema.safeParse(bad).success,false);
 assert.equal(registrySchema.safeParse({...base,deployments:Array.from({length:129},(_,i)=>({...record,address:'0x'+(i+1).toString(16).padStart(40,'0')}))}).success,false);
});
test('runtime/proxy deployment verification pins both code hashes and exact EIP1967 implementation address',async()=>{
 const fixture=rpc(),client=await pinnedRpc(config(),1,fixture.fetcher),proxy={...record,implementation:{address:implementation,codeHash:keccak256(implementationCode)}};assert.equal((await verifyTrustedDeployment(client,proxy)).matched,true);
 assert.ok(fixture.calls.filter(call=>['eth_getCode','eth_getStorageAt'].includes(call.method)).every(call=>call.params.at(-1)==='0x2a'));
 assert.equal((await verifyTrustedDeployment(client,{...proxy,chainId:10})).matched,false);
 for(const mutate of [(call:Call,result:any)=>call.method==='eth_getCode'&&call.params[0]===target?'0x6002':result,(call:Call,result:any)=>call.method==='eth_getStorageAt'?'0x01'+'0'.repeat(62):result,(call:Call,result:any)=>call.method==='eth_getCode'&&call.params[0]===implementation?'0x6002':result]){const changed=rpc(mutate),pinned=await pinnedRpc(config(),1,changed.fetcher);assert.equal((await verifyTrustedDeployment(pinned,proxy)).matched,false);}
});
test('registry RPC chain errors and independent deployment read failures remain unknown without discarding valid records',async()=>{
 const wrong=rpc((call,result)=>call.method==='eth_chainId'?'0xa':result),checks=await registryEvidence(request,op,config(),wrong.fetcher);assert.equal(find(checks,'registry_rpc').status,'unknown');assert.equal(wrong.calls.length,1);
 const cfg=config({trustedDeployments:[record,{...record,address:token}]}),partial=await registryEvidence(request,op,cfg,rpc((call,result)=>call.method==='eth_getCode'&&call.params[0]===target?undefined:result).fetcher);assert.equal(find(partial,'registry_deployment_0').status,'unknown');assert.equal(find(partial,'registry_deployment_1').status,'pass');assert.equal(find(partial,'registry_deployment_1').data?.safetyCertified,false);
});
test('USD reference observations retain actual oracle units, configured token units and reference-only limits',async()=>{
 const fixture=rpc(),checks=await registryEvidence(request,op,config({priceFeeds:[price]}),fixture.fetcher),value=find(checks,'price_reference_0');assert.equal(value.status,'pass');assert.equal(value.data?.priceRaw,'123456789');assert.equal(value.data?.priceDecimals,8);assert.equal(value.data?.assetDecimals,6);assert.equal(value.data?.referenceOnly,true);assert.equal(value.data?.lossEstimateEstablished,false);assert.equal(value.data?.blockHash,blockHash);assert.equal(value.data?.updatedAtSeconds,'990');assert.ok(fixture.calls.filter(call=>call.method==='eth_call').every(call=>call.params.at(-1)==='0x2a'));
});
test('stale/future/negative/zero/malformed rounds, bad units/descriptions and code changes never yield zero or assumed peg prices',async()=>{
 const variants=[(call:Call,result:any)=>call.name==='decimals'?encodeFunctionResult({abi:feeds,functionName:'decimals',result:37}):result,(call:Call,result:any)=>call.name==='description'?encodeFunctionResult({abi:feeds,functionName:'description',result:'OTHER / USD'}):result,...([[5n,-1n,980n,990n,5n],[5n,0n,980n,990n,5n],[5n,1n,800n,899n,5n],[5n,1n,1001n,1001n,5n],[5n,1n,995n,990n,5n],[5n,1n,980n,990n,4n],[5n,1n,0n,0n,5n]] as const).map(round=>(call:Call,result:any)=>call.name==='latestRoundData'?encodeFunctionResult({abi:feeds,functionName:'latestRoundData',result:round}):result),(call:Call,result:any)=>call.method==='eth_getCode'&&call.params[0]===feed?'0x6002':result];
 for(const change of variants){const checks=await registryEvidence(request,op,config({priceFeeds:[price]}),rpc(change).fetcher),value=find(checks,'price_reference_0');assert.equal(value.status,'unknown');assert.equal(value.data?.priceRaw,undefined);assert.equal(find(checks,'registry_deployment_0').status,'pass','an invalid oracle does not erase independent deployment observations');}
});
test('independent oracle failures preserve another configured reference rather than fabricating a combined USD loss',async()=>{
 const cfg=config({priceFeeds:[price,{...price,asset:'native',feed:secondFeed}]}),checks=await registryEvidence(request,op,cfg,rpc((call,result)=>call.target===feed?undefined:result).fetcher);assert.equal(find(checks,'price_reference_0').status,'unknown');assert.equal(find(checks,'price_reference_1').status,'pass');assert.equal(find(checks,'price_reference_1').data?.lossEstimateEstablished,false);
});
test('Sourcify lookup is separately opt-in, fixed-host and chain/address bound; missing or wrong-chain records stay unknown',async()=>{
 const empty={trustedDeployments:[],priceFeeds:[],rpc:{}};let called=0;await registryEvidence(request,op,config({...empty,lookups:true,sourceVerification:false}),async()=>{called++;throw Error('Not enabled');});assert.equal(called,0,'GoPlus enablement does not silently enable a separate source service');
 for(const [index,response] of [{chainId:'1',address:target,runtimeMatch:'exact_match',verifiedAt:'2026-01-01T00:00:00Z'},{chainId:'10',address:target,runtimeMatch:'exact_match'},{chainId:'1',address:target,runtimeMatch:'creation-only'},{chainId:'1',address:token,runtimeMatch:'match'},{}].entries()){
  const candidate=('0x'+(1000+index).toString(16).padStart(40,'0')) as Hex;const req={...request,transaction:{...request.transaction,to:candidate}},fixture:typeof fetch=async(input,init)=>{const u=new URL(String(input));assert.equal(u.origin,'https://sourcify.dev');assert.equal(u.searchParams.get('fields'),'match,creationMatch,runtimeMatch,verifiedAt');assert.equal(init?.redirect,'error');const body={...response,...(index===0?{address:candidate}:{})};return new Response(JSON.stringify(body));};
  const checks=await registryEvidence(req,{...op,token:undefined},config({...empty,sourceVerification:true}),fixture);assert.equal(find(checks,'registry_source_0').status,index===0?'pass':'unknown');if(index===0)assert.equal(find(checks,'registry_source_0').data?.safetyCertified,false);
 }
});
test('malformed and oversized maintained registry files fail closed without altering the configured wallet state',async()=>{
 const root=await mkdtemp(join(tmpdir(),'walletshield-registry-'));try{await mkdir(join(root,'.local'));for(const body of ['{"version":1,"deployments":"not-an-array"}', ' '.repeat(200001)]){await writeFile(join(root,'.local/registry.json'),body);const cfg=await loadSecurityConfig({root,env:{}});assert.equal(cfg.registryError,true);assert.deepEqual(cfg.trustedDeployments,[]);assert.deepEqual(cfg.priceFeeds,[]);assert.deepEqual(cfg.bridgeRoutes,[]);assert.equal(cfg.apiKey,'');}}finally{await rm(root,{recursive:true,force:true});}
});
test('Sourcify cache coalesces exact chain/address work, expires success after five minutes and errors after one minute, and stays bounded',async()=>{
 const originalNow=Date.now;let clock=originalNow(),calls=0,fail=false;Date.now=()=>clock;
 const fetcher:typeof fetch=async input=>{calls++;const parts=new URL(String(input)).pathname.split('/'),address=parts.at(-1),chainId=parts.at(-2);return fail?new Response('Unavailable',{status:503}):new Response(JSON.stringify({chainId,address,runtimeMatch:'exact_match',verifiedAt:'2026-01-01T00:00:00Z'}));};
 const cfg=config({trustedDeployments:[],priceFeeds:[],rpc:{},sourceVerification:true}),operation={...op,token:undefined},observe=(chainId=1,at=target)=>registryEvidence({...request,chainId,transaction:{...request.transaction,to:at}},operation,cfg,fetcher);
 try{await Promise.all([observe(),observe()]);assert.equal(calls,1,'in-flight same-subject lookups are coalesced');clock+=299999;await observe();assert.equal(calls,1);clock+=1;await observe();assert.equal(calls,2);await observe(10);assert.equal(calls,3,'a same-address record on another chain never reuses source identity');
  fail=true;const failedAt='0x9999999999999999999999999999999999999999';assert.equal(find(await observe(1,failedAt),'registry_source_0').status,'unknown');assert.equal(calls,4);clock+=59999;await observe(1,failedAt);assert.equal(calls,4);clock+=1;fail=false;assert.equal(find(await observe(1,failedAt),'registry_source_0').status,'pass');assert.equal(calls,5);
  const before=calls,first='0x'+(20000).toString(16).padStart(40,'0');for(let i=0;i<129;i++)await observe(1,'0x'+(20000+i).toString(16).padStart(40,'0'));assert.equal(calls,before+129);await observe(1,first);assert.equal(calls,before+130,'at most 128 source subjects are retained per fetch transport');
 }finally{Date.now=originalNow;}
});
