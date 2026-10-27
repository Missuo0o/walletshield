import type {FastifyInstance} from 'fastify';
import {parseTransaction,recoverTransactionAddress,type Hex} from 'viem';
import {readBoundedText} from '../security/evidence.js';
import {HOSTED_LAB_CHAIN_ID} from './network.js';

const methods=new Set(['eth_chainId','net_version','web3_clientVersion','eth_blockNumber','eth_getBalance','eth_getCode','eth_getStorageAt','eth_getTransactionCount','eth_getBlockByNumber','eth_getBlockByHash','eth_getTransactionByHash','eth_getTransactionReceipt','eth_call','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory','eth_getLogs','eth_sendRawTransaction']);
const quantities=/^0x[\da-f]{1,64}$/i;
const maxGas=8_000_000n;
export function validLabRpc(value:unknown):value is {jsonrpc:'2.0';id:string|number;method:string;params:unknown[]} {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const r=value as Record<string,unknown>;
 if(Object.keys(r).some(k=>!['jsonrpc','id','method','params'].includes(k))||r.jsonrpc!=='2.0'||!(typeof r.id==='string'&&r.id.length<=100||typeof r.id==='number'&&Number.isSafeInteger(r.id))||typeof r.method!=='string'||!methods.has(r.method)||!Array.isArray(r.params)||r.params.length>4||JSON.stringify(r.params).length>24000)return false;
 const p=r.params;
 if(r.method==='eth_sendRawTransaction')return p.length===1&&typeof p[0]==='string'&&/^0x[\da-f]+$/i.test(p[0]);
 if(['eth_call','eth_estimateGas'].includes(r.method)){
  if(p.length<1||p.length>2||!p[0]||typeof p[0]!=='object'||Array.isArray(p[0]))return false;
  const tx=p[0] as Record<string,unknown>;
  if(Object.keys(tx).some(k=>!['from','to','data','input','value','gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce','type','accessList'].includes(k)))return false;
  if(tx.gas!==undefined&&(typeof tx.gas!=='string'||!quantities.test(tx.gas)||BigInt(tx.gas)>maxGas))return false;
 }
 if(r.method==='eth_getLogs'){
  if(p.length!==1||!p[0]||typeof p[0]!=='object'||Array.isArray(p[0]))return false;
  const log=p[0] as Record<string,unknown>;
  if(Object.keys(log).some(k=>!['address','topics','fromBlock','toBlock','blockHash'].includes(k)))return false;
  // Do not allow unbounded historical scans through the public gateway.
  if(!log.blockHash){if(typeof log.fromBlock!=='string'||typeof log.toBlock!=='string'||!quantities.test(log.fromBlock)||!quantities.test(log.toBlock)||BigInt(log.toBlock)<BigInt(log.fromBlock)||BigInt(log.toBlock)-BigInt(log.fromBlock)>2000n)return false;}
 }
 if(r.method==='eth_feeHistory'&&(typeof p[0]!=='string'||!quantities.test(p[0])||BigInt(p[0])>1024n))return false;
 return true;
}

/** The upstream address is fixed. No admin, unlocked-send, debug, impersonation,
 * reset, state override, arbitrary URL, websocket or JSON-RPC batch passthrough. */
export function registerHostedLabRpc(app:FastifyInstance,options:{maySend:(address:string)=>boolean;takeRate:(ip:string)=>boolean;fetcher?:typeof fetch}){
 let active=0;
 app.post('/api/test-rpc',async(req,reply)=>{
  const r=req.body;
  const id=r&&typeof r==='object'&&!Array.isArray(r)?(r as {id?:unknown}).id:null;
  const fail=(code:number,message:string)=>({jsonrpc:'2.0',id:typeof id==='string'||typeof id==='number'?id:null,error:{code,message}});
  if(!options.takeRate(req.ip)||active>=4)return reply.code(429).send(fail(-32005,'Test RPC rate limit. Retry shortly.'));
  if(!validLabRpc(r))return fail(-32601,'This method or parameter shape is unavailable on the test RPC.');
  if(r.method==='eth_sendRawTransaction'){
   try{const raw=r.params[0] as Hex,tx=parseTransaction(raw),sender=await recoverTransactionAddress({serializedTransaction:raw as Parameters<typeof recoverTransactionAddress>[0]['serializedTransaction']});
    if(tx.chainId!==HOSTED_LAB_CHAIN_ID||!tx.gas||tx.gas>maxGas||!options.maySend(sender))return fail(-32000,'Acquire the test lab lease for this test account first. Only signed transactions on chain 31338 are accepted.');
   }catch{return fail(-32602,'Invalid signed test transaction.');}
  }
  active++;
  try{
   const params=[...r.params];if(['eth_call','eth_estimateGas'].includes(r.method))params[0]={...(params[0] as object),gas:(params[0] as {gas?:string}).gas??'0x7a1200'};
   const response=await(options.fetcher??fetch)('http://127.0.0.1:8546',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({...r,params}),signal:AbortSignal.timeout(6000)});
   if(!response.ok)throw Error('upstream');
   const result=JSON.parse(await readBoundedText(response,512000));
   if(result.jsonrpc!=='2.0'||result.id!==r.id||(!('result'in result)&&!result.error))throw Error('invalid response');
   return result;
  }catch{return fail(-32000,'The isolated test chain is unavailable. Retry later.');}
  finally{active--;}
 });
}
