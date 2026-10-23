import {createHash} from 'node:crypto';
import type {Evidence,Operation,SecurityRequest} from './types.js';
import type {SecurityConfig} from './config.js';
import {evidence,readBoundedText} from './evidence.js';
import {batchEvidence} from './batch-evidence.js';

export const INTELLIGENCE_LIMITS={tokens:8,targets:8,requests:18,concurrency:4,requestMs:1800,totalMs:7500,cacheMs:30000,cacheEntries:256} as const;
const address=(value:unknown):value is string=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value)&&!/^0x0{40}$/i.test(value);
const tokenKeys=['is_honeypot','cannot_sell_all','buy_tax','sell_tax','is_open_source','is_proxy','transfer_pausable','is_blacklisted','slippage_modifiable','owner_change_balance','hidden_owner','can_take_back_ownership','is_mintable'];
const addressFlags=['cybercrime','money_laundering','phishing_activities','stealing_attack','honeypot_related_address','blackmail_activities','sanctioned'];
const chainCache=new WeakMap<typeof fetch,{expires:number;ids:Set<string>;fetchedAt:string}>();
type Cached={expires:number;fetchedAt:string;value:any};
const responseCaches=new WeakMap<typeof fetch,Map<string,Cached>>();

/** Candidate query scope comes only from already decoded fields, never model
 * text or arbitrary bytes. Remote-chain bridge tokens are deliberately omitted. */
export function intelligenceScope(request:SecurityRequest,op:Operation){
 const tokens=new Map<string,string>(),targets=new Map<string,string>();
 const add=(map:Map<string,string>,value:unknown)=>{if(address(value)&&map.size<256)map.set(value.toLowerCase(),value);};
 const fields=(value:Record<string,unknown>)=>{
  for(const key of ['token','tokenIn','tokenOut','asset','localToken'])add(tokens,value[key]);
  for(const key of ['tokens','path'])if(Array.isArray(value[key]))for(const token of value[key].slice(0,128))add(tokens,token);
  for(const key of ['spender','operator','recipient','receiver','newController','newAuthority','module','guard','fallbackHandler','newOwner','account','executionTarget'])add(targets,value[key]);
 };
 add(tokens,op.token);fields(op.fields);for(const target of op.targets.slice(0,128))add(targets,target);
 if(request.kind==='transaction')add(targets,request.transaction.to);
 const batch=batchEvidence(request,op);
 for(const check of batch.filter(check=>check.id.startsWith('batch_child_'))){
  const data=check.data??{};add(targets,data.target);
  if(data.abiShapeDecoded!==true)continue;
  // A DELEGATECALL target is code running in different storage; do not call it
  // the token being held or queried. Explicit child fields remain candidates.
  if(data.callType!=='DELEGATECALL')add(tokens,data.tokenCandidate);
  if(data.parameters&&typeof data.parameters==='object')fields(data.parameters as Record<string,unknown>);
 }
 return {tokens:[...tokens.values()],targets:[...targets.values()],batchGaps:batch.filter(check=>check.id.startsWith('batch_gap_')).map(check=>check.id),batchContextVerified:false as const};
}

/** Independent bounded collector: slow external intelligence cannot discard
 * successful RPC evidence. Cached observations retain original fetch time. */
export async function intelligenceEvidence(request:SecurityRequest,op:Operation,config:SecurityConfig,fetcher:typeof fetch=fetch):Promise<Evidence[]>{
 if(!config.lookups)return [
  evidence('address_reputation','unknown','Address intelligence is disabled','No conclusion about fraud involving the address, domain, or investment platform is supported.','configuration'),
  evidence('website_reputation','unknown','Website intelligence is disabled','The origin has not been checked against known phishing intelligence.','configuration'),
  evidence('token_security','unknown','Token intelligence is disabled','Honeypot indicators, sell taxes, blacklists, and administrator powers have not been checked by an intelligence provider.','configuration')
 ];
 const scope=intelligenceScope(request,op),claimed=Number(op.fields.domainChainId??op.fields.chainId),chainId=request.chainId||(Number.isSafeInteger(claimed)&&claimed>0?claimed:0);
 const out:Evidence[]=[],deadline=Date.now()+INTELLIGENCE_LIMITS.totalMs;let networkRequests=0,cacheHits=0;
 const budget=AbortSignal.timeout(INTELLIGENCE_LIMITS.totalMs),credential=createHash('sha256').update(config.goPlusToken).digest('hex').slice(0,16);
 let cache=responseCaches.get(fetcher);if(!cache){cache=new Map();responseCaches.set(fetcher,cache);}
 const metadata=(fetchedAt:string,cacheHit:boolean)=>({fetchedAt,cacheHit,cacheAgeMs:Math.max(0,Date.now()-Date.parse(fetchedAt)),cacheTtlMs:INTELLIGENCE_LIMITS.cacheMs,providerAsOf:null,freshnessVerified:false});
 async function lookup(path:string,cacheable=true):Promise<{value:any;meta:ReturnType<typeof metadata>}>{
  const key=`${credential}:${path}`,cached=cacheable?cache!.get(key):undefined;
  if(cached&&cached.expires>Date.now()){cacheHits++;return {value:cached.value,meta:metadata(cached.fetchedAt,true)};}
  if(networkRequests>=INTELLIGENCE_LIMITS.requests||Date.now()>=deadline||budget.aborted)throw Error('Intelligence request budget exhausted');
  networkRequests++;
  const response=await fetcher(`https://api.gopluslabs.io/api/v1/${path}`,{headers:{accept:'application/json',...(config.goPlusToken?{Authorization:`Bearer ${config.goPlusToken}`}:{})},redirect:'error',signal:AbortSignal.any([budget,AbortSignal.timeout(INTELLIGENCE_LIMITS.requestMs)])});
  if(!response.ok)throw Error('Lookup unavailable');const body=JSON.parse(await readBoundedText(response,250000));
  if(body.code!==1||!body.result)throw Error('Incomplete lookup');
  const fetchedAt=new Date().toISOString();
  if(cacheable){cache!.delete(key);cache!.set(key,{value:body.result,fetchedAt,expires:Date.now()+INTELLIGENCE_LIMITS.cacheMs});while(cache!.size>INTELLIGENCE_LIMITS.cacheEntries)cache!.delete(cache!.keys().next().value!);}
  return {value:body.result,meta:metadata(fetchedAt,false)};
 }
 let supported=false,chainListFetchedAt:string|null=null;
 if(chainId>0)try{
  let cached=chainCache.get(fetcher);
  if(!cached||cached.expires<Date.now()){
   const result=await lookup('supported_chains',false);if(!Array.isArray(result.value))throw Error('Invalid chain list');
   cached={expires:Date.now()+3600000,ids:new Set(result.value.filter(value=>value&&/^\d{1,16}$/.test(String(value.id))).map(value=>String(value.id))),fetchedAt:result.meta.fetchedAt};chainCache.set(fetcher,cached);
  }
  supported=cached.ids.has(String(chainId));chainListFetchedAt=cached.fetchedAt;
 }catch{/* Never substitute another chain or guess provider support. */}
 let origin:string|undefined;
 try{const url=new URL(request.origin??'');if(!['http:','https:'].includes(url.protocol)||['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('No public origin');origin=url.origin;}catch{}
 const tokens=scope.tokens.slice(0,INTELLIGENCE_LIMITS.tokens),targets=scope.targets.slice(0,INTELLIGENCE_LIMITS.targets),jobs:(()=>Promise<void>)[]=[],addressJobs:(()=>Promise<void>)[]=[],tokenJobs:(()=>Promise<void>)[]=[];
 if(origin)jobs.push(async()=>{
  try{const {value,meta}=await lookup(`phishing_site?url=${encodeURIComponent(origin!)}`),flag=value.phishing_site,known=[0,1,'0','1'].includes(flag),risky=flag===1||flag==='1';
   out.push(evidence('website_reputation',risky?'risk':known?'pass':'unknown',risky?'Origin flagged by phishing intelligence':'Website intelligence result',risky?'The intelligence provider flags this origin for phishing risk.':'No reported match does not authenticate the website or its investment claims.','goplus',{origin,...(known?{phishing_site:String(flag)}:{}),...meta}));
  }catch{out.push(evidence('website_reputation','unknown','Website intelligence query failed','No usable website-risk result was obtained within the bounded query budget.','goplus',{origin,providerAsOf:null,freshnessVerified:false}));}
 });else out.push(evidence('website_reputation','unknown','Origin website unverified','The origin is missing, local, or invalid.','coverage'));
 if(!supported){
  out.push(evidence('address_reputation','unknown','Intelligence support for this network is unconfirmed','Test or unknown network addresses are not queried as if they belonged to another supported chain.','goplus',{chainId}));
  out.push(evidence('token_security','unknown','Token intelligence support for this network is unconfirmed','No usable token-risk result was obtained for this network.','goplus',{chainId}));
 }else{
  if(!targets.length)out.push(evidence('address_reputation','unknown','No explicit counterparty address to query','The complete recipient or authority target cannot be determined from this request.','goplus'));
  for(const target of targets)addressJobs.push(async()=>{
   try{const {value,meta}=await lookup(`address_security/${target.toLowerCase()}?chain_id=${chainId}`),present=addressFlags.filter(key=>[0,1,'0','1'].includes(value[key])),missing=addressFlags.filter(key=>!present.includes(key)),risky=present.filter(key=>String(value[key])==='1');
    out.push(evidence(`address_${target.toLowerCase()}`,risky.length?'risk':missing.length?'unknown':'pass',risky.length?'Address flagged by risk intelligence':'Address intelligence result',risky.length?risky.join(', '):'Missing flags remain unknown. A non-hit does not authenticate this candidate counterparty.','goplus',{chainId,address:target,flags:Object.fromEntries(present.map(key=>[key,String(value[key])])),missing,...meta}));
   }catch{out.push(evidence(`address_${target.toLowerCase()}`,'unknown','Address intelligence query failed','This candidate target could not be checked within the bounded query budget. Other results are retained.','goplus',{chainId,address:target,providerAsOf:null,freshnessVerified:false}));}
  });
  if(!tokens.length)out.push(evidence('token_security','unknown','No explicit target token','No decoded local-chain token candidate identifies a token to query.','coverage'));
  for(const [index,token] of tokens.entries())tokenJobs.push(async()=>{
   const id=index===0?'token_security':`token_security_${token.toLowerCase()}`;
   try{const {value,meta}=await lookup(`token_security/${chainId}?contract_addresses=${token.toLowerCase()}`),data=value[token.toLowerCase()];if(!data)throw Error('Missing token');
    const sanitized:Record<string,string>={};for(const key of tokenKeys){const value=String(data[key]);if(['buy_tax','sell_tax'].includes(key)?/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value):value==='0'||value==='1')sanitized[key]=value;}
    const risks=['is_honeypot','cannot_sell_all','owner_change_balance'].filter(key=>sanitized[key]==='1');if(sanitized.sell_tax&&Number(sanitized.sell_tax)>=0.5)risks.push('high_sell_tax');
    out.push(evidence(id,risks.length?'risk':Object.keys(sanitized).length?'warning':'unknown','Token risk intelligence',risks.length?`Provider reports: ${risks.join(', ')}. Review the actual route and simulation before drawing conclusions.`:'One query does not guarantee future sellability. Missing fields remain unknown.','goplus',{chainId,token,candidateOnly:true,...sanitized,missing:tokenKeys.filter(key=>sanitized[key]===undefined),...meta}));
   }catch{out.push(evidence(id,'unknown','Token intelligence query failed','Usable risk intelligence for this token candidate was not obtained within the bounded query budget. Other token results are retained.','goplus',{chainId,token,providerAsOf:null,freshnessVerified:false}));}
  });
 }
 // Interleave token and address work so a slow chain cannot spend the
 // complete budget on one evidence family before primary-token inspection.
 for(let i=0;i<Math.max(tokenJobs.length,addressJobs.length);i++){if(tokenJobs[i])jobs.push(tokenJobs[i]);if(addressJobs[i])jobs.push(addressJobs[i]);}
 let next=0;
 await Promise.all(Array.from({length:Math.min(INTELLIGENCE_LIMITS.concurrency,jobs.length)},async()=>{while(next<jobs.length){const job=jobs[next++];await job();}}));
 if(scope.tokens.length>tokens.length)out.push(evidence('token_intelligence_limit','unknown','Token intelligence queries truncated',`At most ${INTELLIGENCE_LIMITS.tokens} decoded token candidates are queried; remaining tokens are not checked.`,'coverage',{chainId,declared:scope.tokens.length,queried:supported?tokens.length:0}));
 if(scope.targets.length>targets.length)out.push(evidence('address_intelligence_limit','unknown','Address intelligence queries truncated',`At most ${INTELLIGENCE_LIMITS.targets} decoded counterparties are queried; remaining addresses are not checked.`,'coverage',{chainId,declared:scope.targets.length,queried:supported?targets.length:0}));
 out.push(evidence('intelligence_scope',scope.batchGaps.length||scope.tokens.length>tokens.length||scope.targets.length>targets.length?'unknown':'warning','Bounded intelligence query inventory','Candidates come from decoded outer/path/Permit2 and recognized batch fields, not a full wallet history or authenticated protocol inventory. Individual results and failures are separate observations. Cached results retain their original fetch time; provider data age is unverified.','coverage',{chainId,supported,chainListFetchedAt,tokenCandidates:scope.tokens.slice(0,32),counterpartyCandidates:scope.targets.slice(0,32),selectedTokens:supported?tokens:[],selectedCounterparties:supported?targets:[],omittedTokens:Math.max(0,scope.tokens.length-tokens.length),omittedCounterparties:Math.max(0,scope.targets.length-targets.length),batchGaps:scope.batchGaps,batchContextVerified:false,networkRequests,cacheHits,limits:INTELLIGENCE_LIMITS,fullWalletInventory:false,deadlineReached:Date.now()>=deadline}));
 return out;
}
