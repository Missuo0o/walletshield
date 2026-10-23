import {decodeFunctionResult,encodeFunctionData,parseAbi,type Abi,type Hex} from 'viem';
import {findTrustedDeployment,verifyTrustedDeployment} from './registry.js';
import type {PinnedRpc} from './trusted-rpc.js';
import type {SecurityConfig} from './config.js';
import type {SecurityRequest} from './types.js';
import type {SwapExperiment} from './swap-experiments.js';
import type {ForkSession} from './simulation.js';

class FundingBindingError extends Error {}
const abi=parseAbi(['function WETH9() view returns(address)']);
const senderSentinel='0x0000000000000000000000000000000000000001';
/** Funding and recipient exceptions need matched maintained runtime bindings,
 * not a hardcoded token symbol/address or an imitable WETH9() getter alone. */
export async function swapFundingBinding(request:Extract<SecurityRequest,{kind:'transaction'}>,experiment:SwapExperiment,config:SecurityConfig,fork:ForkSession,at:'base'|'current'='base'):Promise<{allowed:boolean;reason?:string;native:boolean;binding?:Record<string,unknown>}> {
 const literal=experiment.recipient.toLowerCase()===request.transaction.from.toLowerCase(),sentinel=experiment.recipient.toLowerCase()===senderSentinel&&!experiment.deadlinePresent;
 if(!literal&&!sentinel)return {allowed:false,native:experiment.nativeInput,reason:'The recipient is not the sender; another recipient cannot be impersonated to manufacture a reverse sale.'};
 if(experiment.variant==='v2')return {allowed:literal,native:experiment.nativeInput};
 if(!experiment.nativeInput&&literal)return {allowed:true,native:false};
 try{
  if(config.registryError)throw new FundingBindingError('Maintained registry configuration is invalid.');
  const router=findTrustedDeployment(config,request.chainId,request.transaction.to!);
  if(!router||router.role!=='router'||router.protocol!=='uniswap-v3')throw new FundingBindingError('No maintained V3 router binding is configured.');
  if(sentinel&&router.version!=='swap-router-02')throw new FundingBindingError('The sender sentinel requires a matched SwapRouter02 version binding.');
  let tag=`0x${BigInt(fork.blockNumber).toString(16)}` as Hex;
  if(at==='current'){const header=await fork.rpc('eth_getBlockByNumber',['latest',false]);if(!header||typeof header.number!=='string'||!/^0x[\da-f]+$/i.test(header.number))throw new FundingBindingError('The current fork binding block could not be pinned.');tag=header.number;}
  const call=async(method:string,params:unknown[]=[])=>{if(!['eth_getCode','eth_getStorageAt','eth_call'].includes(method))throw new FundingBindingError('Read-only funding check required');return fork.rpc(method,params);};
  const code=async(address:string)=>{const result=await call('eth_getCode',[address,tag]);if(typeof result!=='string'||!/^0x(?:[\da-f]{2})*$/i.test(result))throw new FundingBindingError('Invalid bytecode');return result as Hex;};
  const read=async(contractAbi:Abi,name:string,args:readonly unknown[],to:string)=>decodeFunctionResult({abi:contractAbi,functionName:name,data:await call('eth_call',[{from:request.transaction.from,to,data:encodeFunctionData({abi:contractAbi,functionName:name,args:args as any})},tag]) as Hex});
  const client:PinnedRpc={call,code,read,tag,block:BigInt(tag),timestamp:BigInt(fork.blockTimestampSeconds??'0'),snapshot:{chainId:fork.chainId,blockNumber:fork.blockNumber,blockHash:fork.blockHash},chainId:fork.chainId};
  const result=await verifyTrustedDeployment(client,router);if(!result.matched)throw new FundingBindingError('The router runtime/implementation does not match its maintained record.');
  const binding:Record<string,unknown>={router:router.address,routerVersion:router.version,routerCodeHash:router.codeHash,routerSourceUrl:router.sourceUrl,operatorBindingMatched:true,officialIdentityEstablished:false,checkedBlockNumber:String(BigInt(tag)),recipientResolution:sentinel?'matched_swap_router_02_sender_sentinel':'literal_sender'};
  if(experiment.nativeInput){
   const wrapper=findTrustedDeployment(config,request.chainId,experiment.input);
   if(!wrapper||wrapper.role!=='wrapped_native')throw new FundingBindingError('The native-input token has no maintained wrapped-native binding.');
   const [wrapperResult,claimed]=await Promise.all([verifyTrustedDeployment(client,wrapper),read(abi,'WETH9',[],router.address)]);
   if(!wrapperResult.matched||typeof claimed!=='string'||claimed.toLowerCase()!==wrapper.address.toLowerCase())throw new FundingBindingError('The wrapped-native runtime or router WETH9 association did not match.');
   Object.assign(binding,{wrapper:wrapper.address,wrapperCodeHash:wrapper.codeHash,wrapperSourceUrl:wrapper.sourceUrl,nativeFundingVerifiedForExperiment:true});
  }
  return {allowed:true,native:experiment.nativeInput,binding};
 }catch(error){return {allowed:false,native:experiment.nativeInput,reason:error instanceof FundingBindingError?error.message:'Native funding or recipient binding reads were unavailable.'};}
}
