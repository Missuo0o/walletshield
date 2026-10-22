import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {formatEther} from 'viem';
import type {SecurityConfig} from '../security/config.js';
const names:Record<number,{name:string;testnet:boolean}>={1:{name:'Ethereum Mainnet',testnet:false},11155111:{name:'Sepolia',testnet:true},10:{name:'Optimism',testnet:false},56:{name:'BNB Smart Chain',testnet:false},137:{name:'Polygon',testnet:false},8453:{name:'Base',testnet:false},42161:{name:'Arbitrum One',testnet:false}};
export function networkList(config:SecurityConfig){return [...new Set([11155111,1,...Object.keys(config.rpc).map(Number).filter(id=>id!==31337)])].map(chainId=>({chainId,name:names[chainId]?.name??`EVM ${chainId}`,testnet:names[chainId]?.testnet??null,configured:!!config.rpc[chainId]}));}
const quantity=(v:unknown):v is string=>typeof v==='string'&&/^0x[\da-f]{1,64}$/i.test(v);
export type NetworkSnapshot={chainId:number;network:string;checkedAt:string;blockNumber:string;blockHash:string;blockTime:string;latencyMs:number;account?:{address:string;balanceWei:string;balanceEth:string;hasCode:boolean;delegatedCode:boolean}};
export type NetworkProbe=(url:string,chainId:number,address?:string)=>Promise<NetworkSnapshot>;
/** Read-only trusted endpoint. Never exposes URL/key, accepts arbitrary RPC
 * methods, signs, estimates, submits transactions or calls a model. */
export async function probeNetwork(url:string,chainId:number,address?:string,fetcher:typeof fetch=fetch):Promise<NetworkSnapshot>{
 const start=Date.now(),signal=AbortSignal.timeout(8000);let id=0;
 async function rpc(method:string,params:unknown[]){
  const requestId=++id,response=await fetcher(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})});
  if(!response.ok)throw Error('unavailable');const text=await response.text();if(text.length>1000000)throw Error('invalid_response');const body=JSON.parse(text);
  if(body.id!==requestId||body.error||body.result===undefined)throw Error('invalid_response');return body.result;
 }
 const observed=await rpc('eth_chainId',[]);if(!quantity(observed)||BigInt(observed)!==BigInt(chainId))throw Error('wrong_chain');
 const block=await rpc('eth_getBlockByNumber',['latest',false]);
 if(!block||!quantity(block.number)||!quantity(block.timestamp)||typeof block.hash!=='string'||!/^0x[\da-f]{64}$/i.test(block.hash))throw Error('invalid_response');
 const result:NetworkSnapshot={chainId,network:names[chainId]?.name??`EVM ${chainId}`,checkedAt:new Date().toISOString(),blockNumber:String(BigInt(block.number)),blockHash:block.hash,blockTime:new Date(Number(BigInt(block.timestamp))*1000).toISOString(),latencyMs:0};
 if(address){
  const [balance,code]=await Promise.all([rpc('eth_getBalance',[address,block.number]),rpc('eth_getCode',[address,block.number])]);
  if(!quantity(balance)||typeof code!=='string'||!/^0x(?:[\da-f]{2})*$/i.test(code))throw Error('invalid_response');
  result.account={address,balanceWei:String(BigInt(balance)),balanceEth:formatEther(BigInt(balance)),hasCode:code!=='0x',delegatedCode:code.toLowerCase().startsWith('0xef0100')};
 }
 result.latencyMs=Date.now()-start;return result;
}
export function registerNetworks(app:FastifyInstance,getConfig:()=>Promise<SecurityConfig>,probe:NetworkProbe=probeNetwork,policy:{origins?:string[];authorize?:(req:FastifyRequest,address?:string)=>boolean}={}){
 const local=(origin:string|undefined)=>(policy.origins??['http://127.0.0.1:5173','http://localhost:5173']).includes(origin??'');
 app.addHook('onRequest',async(req,reply)=>{if(req.url.startsWith('/api/networks')&&req.headers.origin&&!local(req.headers.origin))return reply.code(403).send({error:'Use the configured workbench origin to check networks.'});});
 app.get('/api/networks',async()=>({networks:networkList(await getConfig()),scope:'read-only',snapBackend:'local',note:'Configuration means an endpoint exists, not that it is reachable. Verify wallet connection and Snap analysis separately.'}));
 let active=false;const recent:number[]=[];const cache=new Map<string,{expires:number;value:NetworkSnapshot}>();
 app.post('/api/networks/check',async(req,reply)=>{
  if(!local(req.headers.origin))return reply.code(403).send({error:'Network reads require the configured workbench origin.'});
  const parsed=z.object({chainId:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).refine(id=>id!==31337),address:z.string().regex(/^0x[\da-f]{40}$/i).optional()}).strict().safeParse(req.body);
  if(!parsed.success)return reply.code(400).send({error:'Select a public network and optionally the connected public account address. Custom RPC input is not accepted.'});
  const {chainId,address}=parsed.data;if(policy.authorize&&!policy.authorize(req,address))return reply.code(401).send({error:'Verify the current wallet identity first.'});const config=await getConfig(),url=config.rpc[chainId];if(!url)return reply.code(409).send({error:'The backend has no RPC for this network. Configure its server-side rpc.env.'});
  reply.header('Cache-Control','no-store');const key=JSON.stringify([url,chainId,address?.toLowerCase()]),now=Date.now(),cached=cache.get(key);
  if(cached&&cached.expires>now)return {...cached.value,cached:true};
  while(recent.length&&now-recent[0]>=60000)recent.shift();
  if(active||recent.length>=12)return reply.code(429).send({error:'Too many network queries. Retry shortly.'});active=true;recent.push(now);
  try{const result=await probe(url,chainId,address);if(cache.size>=64)cache.delete(cache.keys().next().value!);cache.set(key,{expires:Date.now()+15000,value:result});return {...result,cached:false};}
  catch(e){return reply.code(502).send({error:e instanceof Error&&e.message==='wrong_chain'?'The RPC returned a different chain ID. No account data was read.':'The RPC query did not complete. A configured endpoint does not establish connectivity.'});}
  finally{active=false;}
 });
}
