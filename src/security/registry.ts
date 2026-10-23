import {z} from 'zod';
import {keccak256,parseAbi} from 'viem';
import type {SecurityConfig} from './config.js';
import type {Evidence,Operation,SecurityRequest} from './types.js';
import {evidence,readBoundedText} from './evidence.js';
import {pinnedRpc,type PinnedRpc} from './trusted-rpc.js';
const address=z.string().regex(/^0x[\da-f]{40}$/i).refine(value=>!/^0x0{40}$/i.test(value));
const hash=z.string().regex(/^0x[\da-f]{64}$/i),chain=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const sourceUrl=z.string().max(512).url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash;});
export const deploymentSchema=z.object({chainId:chain,address,protocol:z.string().regex(/^[a-z0-9-]{1,60}$/),version:z.string().max(60).min(1),role:z.enum(['router','wrapped_native','permit2','seaport','entrypoint','account','vault','lending','bridge','messenger','oracle','other']),codeHash:hash,sourceUrl,implementation:z.object({address,codeHash:hash}).strict().optional()}).strict();
export type TrustedDeployment=z.infer<typeof deploymentSchema>;
export const priceFeedSchema=z.object({chainId:chain,asset:z.union([z.literal('native'),address]),feed:address,codeHash:hash,currency:z.literal('USD'),assetDecimals:z.number().int().min(0).max(36),maxAgeSeconds:z.number().int().min(1).max(86400),expectedDescription:z.string().min(1).max(80),sourceUrl}).strict();
export type PriceFeed=z.infer<typeof priceFeedSchema>;
export const bridgeRouteSchema=z.object({adapter:z.literal('op-standard-bridge-v1'),sourceChainId:chain,destinationChainId:chain,sourceBridge:address,destinationBridge:address,sourceMessenger:address,destinationMessenger:address,sourceUrl}).strict().refine(value=>value.sourceChainId!==value.destinationChainId,{message:'Bridge route must name different chains'});
export type BridgeRoute=z.infer<typeof bridgeRouteSchema>;
export const registrySchema=z.object({version:z.literal(1),deployments:z.array(deploymentSchema).max(128),priceFeeds:z.array(priceFeedSchema).max(64),bridgeRoutes:z.array(bridgeRouteSchema).max(32).default([])}).strict().superRefine((value,ctx)=>{
 for(const [items,key] of [[value.deployments,'deployments'],[value.priceFeeds,'priceFeeds']] as const){const seen=new Set<string>();for(const item of items){const id=`${item.chainId}:${'address' in item?item.address:item.asset}`.toLowerCase();if(seen.has(id))ctx.addIssue({code:'custom',path:[key],message:'Duplicate chain/subject registry entry'});seen.add(id);}}
 const seen=new Set<string>();for(const item of value.bridgeRoutes){const id=`${item.sourceChainId}:${item.sourceBridge}`.toLowerCase();if(seen.has(id))ctx.addIssue({code:'custom',path:['bridgeRoutes'],message:'Duplicate source bridge route'});seen.add(id);}
});
export function findTrustedDeployment(config:SecurityConfig,chainId:number,address:string){return config.trustedDeployments?.find(item=>item.chainId===chainId&&item.address.toLowerCase()===address.toLowerCase());}
export async function verifyTrustedDeployment(client:PinnedRpc,record:TrustedDeployment){
 if(record.chainId!==client.chainId)return {matched:false,reason:'Registry chain mismatch'};
 const code=await client.code(record.address);if(code==='0x'||keccak256(code).toLowerCase()!==record.codeHash.toLowerCase())return {matched:false,reason:'Runtime bytecode differs from operator registry'};
 if(record.implementation){
  const slot='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',raw=await client.call('eth_getStorageAt',[record.address,slot,client.tag]);
  if(typeof raw!=='string'||!/^0x[\da-f]{64}$/i.test(raw)||!/^0x0{24}/i.test(raw)||`0x${raw.slice(-40)}`.toLowerCase()!==record.implementation.address.toLowerCase())return {matched:false,reason:'EIP-1967 implementation differs from operator registry'};
  const implementation=await client.code(record.implementation.address);if(implementation==='0x'||keccak256(implementation).toLowerCase()!==record.implementation.codeHash.toLowerCase())return {matched:false,reason:'Implementation bytecode differs from operator registry'};
 }
 return {matched:true,reason:'Address and configured code hashes matched this pinned block'};
}
const feeds=parseAbi(['function decimals() view returns(uint8)','function description() view returns(string)','function latestRoundData() view returns(uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)']);
type SourceRecord={runtimeMatch:'exact_match'|'match';verifiedAt:string|null;fetchedAt:string};
const sourceCaches=new WeakMap<typeof fetch,Map<string,{expires:number;value:Promise<SourceRecord>}>>();
async function sourceRecord(chainId:number,address:string,fetcher:typeof fetch){
 let cache=sourceCaches.get(fetcher);if(!cache){cache=new Map();sourceCaches.set(fetcher,cache);}const key=`${chainId}:${address}`,now=Date.now(),previous=cache.get(key);if(previous&&previous.expires>now)return previous.value;
 if(cache.size>=128)cache.delete(cache.keys().next().value!);
 const entry={expires:now+300000,value:Promise.resolve(null as unknown as SourceRecord)};
 entry.value=(async()=>{try{
  const response=await fetcher(`https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=match,creationMatch,runtimeMatch,verifiedAt`,{redirect:'error',signal:AbortSignal.timeout(1800),headers:{accept:'application/json','User-Agent':'WalletShield/0.4.1 (+https://github.com/Missuo0o/walletshield)'}});
  if(!response.ok)throw Error('Source lookup unavailable');const body=JSON.parse(await readBoundedText(response,40000));
  if(Number(body.chainId)!==chainId||typeof body.address!=='string'||body.address.toLowerCase()!==address||!['exact_match','match'].includes(body.runtimeMatch))throw Error('No bound runtime verification');
  return {runtimeMatch:body.runtimeMatch,verifiedAt:typeof body.verifiedAt==='string'&&Number.isFinite(Date.parse(body.verifiedAt))?body.verifiedAt:null,fetchedAt:new Date().toISOString()};
 }catch(error){entry.expires=Date.now()+60000;throw error;}})();cache.set(key,entry);return entry.value;
}
/** Configuration is a maintained operator assertion, never an automatic safety whitelist. */
export async function registryEvidence(request:SecurityRequest,op:Operation,config:SecurityConfig,fetcher:typeof fetch=fetch):Promise<Evidence[]>{
 const claimed=Number(op.fields.domainChainId),chainId=request.chainId||(Number.isSafeInteger(claimed)&&claimed>0?claimed:0);
 const target=request.kind==='transaction'?request.transaction.to:op.fields.verifyingContract;
 const allCandidates=[...new Set([target,op.token,...op.targets].filter((value):value is string=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value)).map(value=>value.toLowerCase()))];const candidates=allCandidates.slice(0,8);
 const registered=candidates.map(value=>findTrustedDeployment(config,chainId,value)).filter((value):value is TrustedDeployment=>!!value);
 const assets=[...new Set([request.kind==='transaction'?'native':undefined,op.token,...(Array.isArray(op.fields.tokens)?op.fields.tokens:[]),...(Array.isArray(op.fields.path)?op.fields.path:[])].filter((v):v is string=>typeof v==='string').map(v=>v.toLowerCase()))];
 const selectedFeeds=(config.priceFeeds??[]).filter(feed=>feed.chainId===chainId&&assets.includes(feed.asset.toLowerCase())).slice(0,4);
 const out:Evidence[]=[];
 if(allCandidates.length>8)out.push(evidence('registry_candidates_limit','unknown','Deployment candidate bound reached','Only the first eight decoded candidates are considered for maintained deployment bindings; remaining addresses were not checked.','coverage',{candidateCount:allCandidates.length,checkedLimit:8}));
 if(config.registryError)out.push(evidence('registry_configuration','unknown','Maintained registry configuration is invalid','Invalid or oversized server records were not used. Correct the local registry configuration before relying on deployment bindings or reference prices.','configuration'));
 if(!registered.length)out.push(evidence('deployment_registry','unknown','No matching maintained deployment record','No registered address/code-hash binding was available. Names, ABI shapes and source verification do not establish official identity or safety.','registry',{chainId,candidates,matched:false}));
 if(!selectedFeeds.length)out.push(evidence('price_reference','unknown','No configured trusted USD reference feed','No token is valued by name or assumed to equal one dollar. Request quantities remain raw token/native units; no dollar-loss estimate is established.','registry',{chainId,assets,currency:'USD',referenceOnly:true}));
 let client:PinnedRpc|undefined;
 if(registered.length||selectedFeeds.length)try{client=await pinnedRpc(config,chainId,fetcher);}catch{out.push(evidence('registry_rpc','unknown','Registry and price state unavailable','The server-configured RPC did not supply a verified pinned block; configured records were not assumed to match.','rpc',{chainId}));}
 if(client){const pinned=client;
  await Promise.all(registered.map(async(record,index)=>{try{const result=await verifyTrustedDeployment(pinned,record);out.push(evidence(`registry_deployment_${index}`,result.matched?'pass':'warning','Maintained deployment binding checked',`${result.reason}. This is an operator-maintained deployment binding, not a code audit or safety guarantee.`,'rpc',{...pinned.snapshot,address:record.address,protocol:record.protocol,version:record.version,role:record.role,sourceUrl:record.sourceUrl,expectedCodeHash:record.codeHash,matched:result.matched,safetyCertified:false,implementationChecked:!!record.implementation}));}catch{out.push(evidence(`registry_deployment_${index}`,'unknown','Deployment binding could not be checked','Missing reads are not a code-hash match.','rpc',{...pinned.snapshot,address:record.address}));}}));
  await Promise.all(selectedFeeds.map(async(feed,index)=>{try{
   const code=await pinned.code(feed.feed);if(code==='0x'||keccak256(code).toLowerCase()!==feed.codeHash.toLowerCase())throw Error('Feed code changed');
   const [decimals,description,round]=await Promise.all([pinned.read(feeds,'decimals',[],feed.feed),pinned.read(feeds,'description',[],feed.feed),pinned.read(feeds,'latestRoundData',[],feed.feed)]) as [number,string,readonly [bigint,bigint,bigint,bigint,bigint]];
   const [roundId,answer,startedAt,updatedAt,answeredInRound]=round;
   if(!Number.isInteger(decimals)||decimals<0||decimals>36||description!==feed.expectedDescription||answer<=0n||updatedAt===0n||startedAt>updatedAt||updatedAt>pinned.timestamp||pinned.timestamp-updatedAt>BigInt(feed.maxAgeSeconds)||answeredInRound<roundId)throw Error('Invalid or stale feed');
   out.push(evidence(`price_reference_${index}`,'pass','Configured USD reference price observed','Positive, description-matched, bounded-age oracle output at this block. It is a reference observation, not an executable quote, token authenticity certificate or certain dollar loss. Proxy implementation, oracle governance and future liquidity require separate evidence.','rpc',{...pinned.snapshot,asset:feed.asset,feed:feed.feed,priceRaw:String(answer),priceDecimals:decimals,assetDecimals:feed.assetDecimals,currency:'USD',updatedAtSeconds:String(updatedAt),maxAgeSeconds:feed.maxAgeSeconds,sourceUrl:feed.sourceUrl,referenceOnly:true,lossEstimateEstablished:false}));
  }catch{out.push(evidence(`price_reference_${index}`,'unknown','Configured USD reference price unavailable','Code, description, units, round or time checks failed. No zero price, dollar peg or USD loss is substituted.','rpc',{...pinned.snapshot,asset:feed.asset,feed:feed.feed,referenceOnly:true}));}}));
 }
 // Lookup only a fixed public host, bounded to two target candidates. Never
 // fetch metadata URLs, client RPC URLs or arbitrary source links.
 if(config.sourceVerification&&chainId>0)await Promise.all(candidates.slice(0,2).map(async(address,index)=>{try{
  const body=await sourceRecord(chainId,address,fetcher);
  out.push(evidence(`registry_source_${index}`,'pass','Source verification record observed','The source-verification service reports a runtime match for this chain/address. Results may be reused for five minutes; this is not a current-code comparison, audit, trusted project identity or proof of harmless behavior. Source text is not sent as model instructions.','sourcify',{chainId,address,...body,providerAsOf:null,safetyCertified:false}));
 }catch{out.push(evidence(`registry_source_${index}`,'unknown','Source verification unavailable','No usable chain/address-bound runtime-match record was obtained.','sourcify',{chainId,address}));}}));
 return out;
}
