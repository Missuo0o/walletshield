import type {SecurityConfig} from './config.js';
import type {Evidence,Operation,SecurityRequest} from './types.js';
import {evidence,readBoundedText} from './evidence.js';

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

/** Separate opt-in public-source metadata; no maintained deployment or price registry is used. */
export async function sourceVerificationEvidence(request:SecurityRequest,op:Operation,config:SecurityConfig,fetcher:typeof fetch=fetch):Promise<Evidence[]>{
 if(!config.sourceVerification)return [];
 const claimed=Number(op.fields.domainChainId),chainId=request.chainId||(Number.isSafeInteger(claimed)&&claimed>0?claimed:0);
 if(!Number.isSafeInteger(chainId)||chainId<=0)return [];
 const target=request.kind==='transaction'?request.transaction.to:op.fields.verifyingContract;
 const candidates=[...new Set([target,op.token,...op.targets].filter((value):value is string=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value)).map(value=>value.toLowerCase()))].slice(0,2);
 // Query only the fixed host and two decoded candidates. Never use metadata URLs,
 // client RPC URLs or arbitrary source links, and never retrieve source text.
 return Promise.all(candidates.map(async(address,index)=>{try{
  const body=await sourceRecord(chainId,address,fetcher);
  // Preserve IDs so historical source observations remain readable.
  return evidence(`registry_source_${index}`,'pass','Source verification record observed','The source-verification service reports a runtime match for this chain/address. Results may be reused for five minutes; this is not a current-code comparison, audit, trusted project identity or proof of harmless behavior. Source text is not sent as model instructions.','sourcify',{chainId,address,...body,providerAsOf:null,safetyCertified:false});
 }catch{return evidence(`registry_source_${index}`,'unknown','Source verification unavailable','No usable chain/address-bound runtime-match record was obtained.','sourcify',{chainId,address});}}));
}
