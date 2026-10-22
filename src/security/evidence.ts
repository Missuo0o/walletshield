import type { Evidence } from './types.js';
export function evidence(id:string,status:Evidence['status'],title:string,detail:string,source:string,data?:Record<string,unknown>):Evidence {
  return {id,status,title,detail,source,observedAt:new Date().toISOString(),...(data?{data}:{})};
}

/** Metadata belongs only to reads explicitly pinned to this chain and height.
 * A missing or mismatched header never supplies a guessed hash or timestamp. */
export function snapshotMetadata(chainId:number,blockNumber:bigint,header?:{number?:bigint|null;hash?:string|null;timestamp?:bigint}):Record<string,unknown> {
  const data:Record<string,unknown>={chainId,blockNumber:String(blockNumber)};
  if(!header||(header.number!==undefined&&header.number!==null&&header.number!==blockNumber))return data;
  if(typeof header.hash==='string'&&/^0x[\da-f]{64}$/i.test(header.hash))data.blockHash=header.hash;
  if(typeof header.timestamp==='bigint'&&header.timestamp>=0n)data.blockTimestampSeconds=String(header.timestamp);
  return data;
}

/** viem maps a successful empty eth_getCode result to undefined. */
export function validateAccountCode(value:unknown):`0x${string}` {
  if(value===undefined)return '0x';
  if(typeof value!=='string'||!/^0x(?:[\da-f]{2})*$/i.test(value))throw Error('Invalid account code');
  return value as `0x${string}`;
}

/** Enforce the response limit while streaming, before JSON parsing. */
export async function readBoundedText(response:Response,maxBytes:number):Promise<string> {
  const reader=response.body?.getReader();if(!reader)throw Error('Response body unavailable');
  const decoder=new TextDecoder('utf-8',{fatal:true});let text='',bytes=0;
  try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>maxBytes)throw Error('Response too large');text+=decoder.decode(part.value,{stream:true});}return text+decoder.decode();}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
}
