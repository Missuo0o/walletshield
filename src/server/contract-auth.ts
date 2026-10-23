import {encodeFunctionData,hashMessage,parseAbi,type Hex} from 'viem';
import {readBoundedText} from '../security/evidence.js';
import type {WalletAuthChallenge} from './store.js';

export const CONTRACT_AUTH_LIMITS={signatureBytes:8192,responseBytes:65536,totalMs:4500,staticGas:300000,outerGas:600000,maxBlockAgeSeconds:300,futureSeconds:30} as const;
const abi=parseAbi(['function isValidSignature(bytes32 hash,bytes signature) view returns(bytes4)']);
const magic='0x1626ba7e'+'0'.repeat(56);
const quantity=(v:unknown):v is Hex=>typeof v==='string'&&/^0x[\da-f]{1,64}$/i.test(v);
export type ContractAuthSnapshot={method:'erc1271';chainId:number;blockNumber:string;blockHash:string;blockTimestampSeconds:string;staticCall:true;verificationScope:'exact-login-message-only'};

/** Server-generated creation-call bytecode executes a literal STATICCALL. The
 * inner call can copy only one ABI word; no arbitrary initcode/state overrides
 * are accepted, no contract is deployed, and no upstream write is broadcast.
 * https://eips.ethereum.org/EIPS/eip-1271 */
export function contractSignatureStaticCall(address:string,calldata:Hex):Hex{
 if(!/^0x[\da-f]{40}$/i.test(address)||!/^0x(?:[\da-f]{2})*$/i.test(calldata)||calldata.length>18000)throw Error('Invalid contract verification input');
 const bytes:number[]=[],patches:number[]=[];
 const op=(value:number)=>bytes.push(value),push=(value:bigint,size:number)=>{if(value<0n||value>=1n<<BigInt(size*8))throw Error('Verification bytecode overflow');op(0x5f+size);for(let i=size-1;i>=0;i--)op(Number(value>>BigInt(i*8)&255n));};
 const patch=()=>{op(0x61);const at=bytes.length;op(0);op(0);return at;};
 const size=(calldata.length-2)/2;
 push(BigInt(size),2);const sourceOffset=patch();push(0n,1);op(0x39);
 push(32n,1);push(0n,1);push(BigInt(size),2);push(0n,1);push(BigInt(address),20);push(BigInt(CONTRACT_AUTH_LIMITS.staticGas),3);op(0xfa);
 op(0x15);patches.push(patch());op(0x57);
 op(0x3d);push(32n,1);op(0x14);op(0x15);patches.push(patch());op(0x57);
 push(32n,1);push(0n,1);op(0xf3);
 const fail=bytes.length;op(0x5b);push(0n,1);push(0n,1);op(0xfd);
 for(const at of patches){bytes[at]=fail>>8;bytes[at+1]=fail&255;}
 bytes[sourceOffset]=bytes.length>>8;bytes[sourceOffset+1]=bytes.length&255;
 return ('0x'+bytes.map(value=>value.toString(16).padStart(2,'0')).join('')+calldata.slice(2)) as Hex;
}

/** Contract policy authenticates only this exact stored login at one snapshot.
 * Unsupported creation eth_call, caller-restricted implementations, excessive
 * gas, unavailable RPC and stale/mismatched state all fail closed. */
export async function verifyContractLogin(challenge:WalletAuthChallenge,signature:Hex,rpc:Record<number,string>,now:()=>number=Date.now,fetcher:typeof fetch=fetch):Promise<ContractAuthSnapshot|null>{
 if(!/^0x(?:[\da-f]{2}){0,8192}$/i.test(signature))return null;
 const endpoint=rpc[challenge.chainId];if(!endpoint)return null;
 try{const url=new URL(endpoint);if(url.username||url.password||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))return null;}catch{return null;}
 const signal=AbortSignal.timeout(CONTRACT_AUTH_LIMITS.totalMs);let serial=0;
 async function call(method:string,params:unknown[]){
  const id=++serial,response=await fetcher(endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
  if(!response.ok)throw Error('Contract verification RPC unavailable');const body=JSON.parse(await readBoundedText(response,CONTRACT_AUTH_LIMITS.responseBytes));
  if(body.jsonrpc!=='2.0'||body.id!==id||body.error||body.result===undefined)throw Error('Contract verification RPC failed');return body.result;
 }
 try{
  const chain=await call('eth_chainId',[]);if(!quantity(chain)||BigInt(chain)!==BigInt(challenge.chainId))return null;
  const header=await call('eth_getBlockByNumber',['latest',false]);
  if(!header||!quantity(header.number)||!quantity(header.timestamp)||typeof header.hash!=='string'||!/^0x[\da-f]{64}$/i.test(header.hash))return null;
  const age=BigInt(Math.floor(now()/1000))-BigInt(header.timestamp);
  if(challenge.chainId!==31337&&(age>BigInt(CONTRACT_AUTH_LIMITS.maxBlockAgeSeconds)||age< -BigInt(CONTRACT_AUTH_LIMITS.futureSeconds)))return null;
  const code=await call('eth_getCode',[challenge.address,header.number]);if(typeof code!=='string'||!/^0x(?:[\da-f]{2})+$/i.test(code))return null;
  const data=encodeFunctionData({abi,functionName:'isValidSignature',args:[hashMessage(challenge.message),signature]});
  const result=await call('eth_call',[{data:contractSignatureStaticCall(challenge.address,data),gas:'0x'+CONTRACT_AUTH_LIMITS.outerGas.toString(16),value:'0x0'},header.number]);
  if(typeof result!=='string'||result.toLowerCase()!==magic)return null;
  const finalHeader=await call('eth_getBlockByNumber',[header.number,false]);
  if(!finalHeader||!quantity(finalHeader.number)||BigInt(finalHeader.number)!==BigInt(header.number)||String(finalHeader.hash).toLowerCase()!==header.hash.toLowerCase()||!quantity(finalHeader.timestamp)||BigInt(finalHeader.timestamp)!==BigInt(header.timestamp))return null;
  if(Date.parse(challenge.expiresAt)<=now())return null;
  return {method:'erc1271',chainId:challenge.chainId,blockNumber:String(BigInt(header.number)),blockHash:header.hash,blockTimestampSeconds:String(BigInt(header.timestamp)),staticCall:true,verificationScope:'exact-login-message-only'};
 }catch{return null;}
}
