import {decodeFunctionResult,encodeFunctionData,type Abi} from 'viem';
import type {SecurityConfig} from './config.js';
import {readBoundedText,snapshotMetadata} from './evidence.js';
const quantity=(v:unknown):v is `0x${string}`=>typeof v==='string'&&/^0x[\da-f]{1,64}$/i.test(v);
const methods=new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getStorageAt','eth_getBalance','eth_getTransactionCount','eth_call']);
/** Server-configured read-only RPC. There is no client URL/method forwarding. */
export async function pinnedRpc(config:SecurityConfig,chainId:number,fetcher:typeof fetch=fetch){
 const url=config.rpc[chainId];if(!url)throw Error('RPC not configured');
 const total=AbortSignal.timeout(8500);let id=0;
 async function call(method:string,params:unknown[]=[]):Promise<any>{
  if(!methods.has(method))throw Error('Read-only method required');
  const requestId=++id,response=await fetcher(url,{method:'POST',redirect:'error',signal:AbortSignal.any([total,AbortSignal.timeout(2200)]),headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})});
  if(!response.ok)throw Error('RPC unavailable');const body=JSON.parse(await readBoundedText(response,350000));
  if(body.jsonrpc!=='2.0'||body.id!==requestId||body.error||body.result===undefined)throw Error('Invalid RPC response');return body.result;
 }
 const chain=await call('eth_chainId');if(!quantity(chain)||BigInt(chain)!==BigInt(chainId))throw Error('Wrong chain');
 const header=await call('eth_getBlockByNumber',['latest',false]);
 if(!header||!quantity(header.number)||!quantity(header.timestamp)||typeof header.hash!=='string'||!/^0x[\da-f]{64}$/i.test(header.hash))throw Error('Pinned block unavailable');
 const tag=header.number as `0x${string}`,block=BigInt(tag),timestamp=BigInt(header.timestamp),snapshot=snapshotMetadata(chainId,block,{number:block,hash:header.hash,timestamp});
 const read=async(abi:Abi,name:string,args:readonly unknown[],to:string)=>decodeFunctionResult({abi,functionName:name,data:await call('eth_call',[{to,data:encodeFunctionData({abi,functionName:name,args:args as any})},tag]) as `0x${string}`});
 const code=async(address:string)=>{const value=await call('eth_getCode',[address,tag]);if(typeof value!=='string'||!/^0x(?:[\da-f]{2})*$/i.test(value))throw Error('Invalid bytecode');return value as `0x${string}`;};
 return {call,read,code,tag,block,timestamp,snapshot,chainId};
}
export type PinnedRpc=Awaited<ReturnType<typeof pinnedRpc>>;
