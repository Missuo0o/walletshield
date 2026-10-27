import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {formatEther} from 'viem';
import type {SecurityConfig} from '../security/config.js';
import {readBoundedText} from '../security/evidence.js';
import {normalizeTrace} from '../security/trace.js';
import {rpcSnapshotGuard} from '../security/trusted-rpc.js';
const names:Record<number,{name:string;testnet:boolean}>={1:{name:'Ethereum Mainnet',testnet:false},11155111:{name:'Sepolia',testnet:true},10:{name:'Optimism',testnet:false},56:{name:'BNB Smart Chain',testnet:false},137:{name:'Polygon',testnet:false},8453:{name:'Base',testnet:false},42161:{name:'Arbitrum One',testnet:false}};
export function networkList(config:SecurityConfig){return [...new Set([11155111,1,...Object.keys(config.rpc).map(Number).filter(id=>id!==31337&&id!==31338)])].map(chainId=>({chainId,name:names[chainId]?.name??`EVM ${chainId}`,testnet:names[chainId]?.testnet??null,configured:!!config.rpc[chainId]}));}
const quantity=(v:unknown):v is string=>typeof v==='string'&&/^0x[\da-f]{1,64}$/i.test(v);
export type NetworkSnapshot={chainId:number;network:string;checkedAt:string;blockNumber:string;blockHash:string;blockTime:string;latencyMs:number;account?:{address:string;balanceWei:string;balanceEth:string;hasCode:boolean;delegatedCode:boolean};capabilities?:{pinnedCall:'observed'|'unavailable';historicalState:'observed'|'unavailable';historicalBlock:string;callTrace:'observed'|'unavailable';callTraceMethod?:'debug_traceCall'|'trace_call';scope:string}};
export type NetworkProbe=(url:string,chainId:number,address?:string)=>Promise<NetworkSnapshot>;
/** Read-only trusted endpoint. Never exposes URL/key, accepts arbitrary RPC
 * methods, signs, estimates, submits transactions or calls a model. */
export async function probeNetwork(url:string,chainId:number,address?:string,fetcher:typeof fetch=fetch):Promise<NetworkSnapshot>{
 const start=Date.now(),signal=AbortSignal.timeout(8000);let id=0;
 async function rpc(method:string,params:unknown[]){
  const requestId=++id,response=await fetcher(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(2000)]),body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})});
  if(!response.ok)throw Error('unavailable');const body=JSON.parse(await readBoundedText(response,350000));
  if(body.jsonrpc!=='2.0'||body.id!==requestId||body.error||body.result===undefined)throw Error('invalid_response');return body.result;
 }
 const observed=await rpc('eth_chainId',[]);if(!quantity(observed)||BigInt(observed)!==BigInt(chainId))throw Error('wrong_chain');
 const block=await rpc('eth_getBlockByNumber',['latest',false]);
 if(!block||!quantity(block.number)||!quantity(block.timestamp)||typeof block.hash!=='string'||!/^0x[\da-f]{64}$/i.test(block.hash))throw Error('invalid_response');
 const guard=rpcSnapshotGuard(chainId,BigInt(block.number),block,async()=>{const [chain,header]=await Promise.all([rpc('eth_chainId',[]),rpc('eth_getBlockByNumber',[block.number,false])]);return {chain,header};});
 const result:NetworkSnapshot={chainId,network:names[chainId]?.name??`EVM ${chainId}`,checkedAt:new Date().toISOString(),blockNumber:String(BigInt(block.number)),blockHash:block.hash,blockTime:new Date(Number(BigInt(block.timestamp))*1000).toISOString(),latencyMs:0};
 if(address){
  const [balance,code]=await Promise.all([rpc('eth_getBalance',[address,block.number]),rpc('eth_getCode',[address,block.number])]);
  if(!quantity(balance)||typeof code!=='string'||!/^0x(?:[\da-f]{2})*$/i.test(code))throw Error('invalid_response');
  result.account={address,balanceWei:String(BigInt(balance)),balanceEth:formatEther(BigInt(balance)),hasCode:code!=='0x',delegatedCode:code.toLowerCase().startsWith('0xef0100')};
 }
 // Fixed read-only probes; neither callers nor wallets supply a URL, tracer,
 // method, target, calldata or block. One result is not a general RPC guarantee.
 const historical=BigInt(block.number)>128n?BigInt(block.number)-128n:0n,zero='0x0000000000000000000000000000000000000000';
 const call={from:zero,to:zero,data:'0x',gas:'0x5208',value:'0x0'};
 const traceProbe=async()=>{
  for(const method of ['debug_traceCall','trace_call'] as const){
   try{
    const value=await rpc(method,method==='debug_traceCall'?[call,block.number,{tracer:'callTracer',timeout:'1s',reexec:0}]:[call,['trace'],block.number]);
    const trace=normalizeTrace(value,method,call);if(!trace||trace.rootReverted||trace.gaps.length)continue;
    const after=await rpc('eth_getBlockByNumber',[block.number,false]);
    if(!after||after.number!==block.number||after.hash?.toLowerCase()!==block.hash.toLowerCase())return null;
    return method;
   }catch{/* Independently try the other known dialect within the same budget. */}
  }return null;
 };
 const probes=await Promise.allSettled([rpc('eth_call',[call,block.number]),rpc('eth_getBalance',[zero,`0x${historical.toString(16)}`]),traceProbe()]);
 const probeSucceeded=(index:number,valid:(value:unknown)=>boolean)=>{const probe=probes[index];return probe.status==='fulfilled'&&valid(probe.value);};
 const trace=probes[2],method=trace.status==='fulfilled'&&['debug_traceCall','trace_call'].includes(String(trace.value))?trace.value as 'debug_traceCall'|'trace_call':undefined;
 result.capabilities={pinnedCall:probeSucceeded(0,value=>typeof value==='string'&&/^0x(?:[\da-f]{2})*$/i.test(value))?'observed':'unavailable',historicalState:probeSucceeded(1,quantity)?'observed':'unavailable',historicalBlock:String(historical),callTrace:method?'observed':'unavailable',...(method?{callTraceMethod:method}:{}),scope:'Fixed zero-value probes only. The complete probe group rechecks chain, block height, hash and timestamp before returning account state or capability observations. The primary endpoint is tried with debug_traceCall then trace_call; the block hash is rechecked on success. Historical balance at one height does not establish full archive retention; one trace does not prove complete asset coverage. Unavailable may mean unsupported, disabled, rate-limited or timed out. Dedicated trace endpoints are independently verified during transaction analysis.'};
 if(!await guard.check())throw Error('snapshot_changed');
 result.latencyMs=Date.now()-start;return result;
}
export function registerNetworks(app:FastifyInstance,getConfig:()=>Promise<SecurityConfig>,probe:NetworkProbe=probeNetwork,policy:{origins?:string[];authorize?:(req:FastifyRequest,address?:string,chainId?:number)=>boolean|401|403}={}){
 const local=(origin:string|undefined)=>(policy.origins??['http://127.0.0.1:5173','http://localhost:5173']).includes(origin??'');
 app.addHook('onRequest',async(req,reply)=>{if(req.url.startsWith('/api/networks')&&req.headers.origin&&!local(req.headers.origin))return reply.code(403).send({error:'Use the configured workbench origin to check networks.'});});
 app.get('/api/networks',async()=>{const config=await getConfig();return {networks:networkList(config),scope:'read-only',note:'Configuration means an endpoint exists, not that it is reachable. Verify wallet connection and Snap analysis separately.'};});
 let active=false;const recent:number[]=[];const cache=new Map<string,{expires:number;value:NetworkSnapshot}>();
 app.post('/api/networks/check',async(req,reply)=>{
  if(!local(req.headers.origin))return reply.code(403).send({error:'Network reads require the configured workbench origin.'});
  const parsed=z.object({chainId:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).refine(id=>id!==31337&&id!==31338),address:z.string().regex(/^0x[\da-f]{40}$/i).optional()}).strict().safeParse(req.body);
  if(!parsed.success)return reply.code(400).send({error:'Select a public network and optionally the connected public account address. Custom RPC input is not accepted.'});
  const {chainId,address}=parsed.data;
  // Credentials can expire or be revoked while configuration or RPC work is
  // awaiting I/O. Reauthorize before cache/probe access and again before any
  // result is cached or returned; a previous authorization is not a lease.
  const denied=()=>{if(!policy.authorize)return;const authorization=policy.authorize(req,address,chainId);if(authorization!==true)return authorization===403?reply.code(403).send({error:'This verified identity does not permit querying that account or network. Select its account/network or verify a new identity.'}):reply.code(401).send({error:'Verify the current wallet identity on this network first.'});};
  const initialDenial=denied();if(initialDenial)return initialDenial;
  const config=await getConfig();const preReadDenial=denied();if(preReadDenial)return preReadDenial;
  const url=config.rpc[chainId];if(!url)return reply.code(409).send({error:'The backend has no RPC for this network. Configure its server-side rpc.env.'});
  reply.header('Cache-Control','no-store');const key=JSON.stringify([url,chainId,address?.toLowerCase()]),now=Date.now(),cached=cache.get(key);
  if(cached&&cached.expires>now)return {...cached.value,cached:true};
  while(recent.length&&now-recent[0]>=60000)recent.shift();
  if(active||recent.length>=12)return reply.code(429).send({error:'Too many network queries. Retry shortly.'});active=true;recent.push(now);
  try{const result=await probe(url,chainId,address);const resultDenial=denied();if(resultDenial)return resultDenial;if(cache.size>=64)cache.delete(cache.keys().next().value!);cache.set(key,{expires:Date.now()+15000,value:result});return {...result,cached:false};}
  catch(e){const errorDenial=denied();if(errorDenial)return errorDenial;return reply.code(502).send({error:e instanceof Error&&e.message==='wrong_chain'?'The RPC returned a different chain ID. No account data was read.':'The RPC query did not complete. A configured endpoint does not establish connectivity.'});}
  finally{active=false;}
 });
}
