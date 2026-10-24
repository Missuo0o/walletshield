import {rpcSnapshotGuard} from './trusted-rpc.js';
import {decodeFunctionResult,encodeFunctionData,keccak256,parseAbi} from 'viem';
import type {Evidence,Operation,SecurityRequest} from './types.js';
import type {SecurityConfig} from './config.js';
import {evidence,readBoundedText,validateAccountCode} from './evidence.js';

export const accountStateAbi=parseAbi([
 'function getOwners() view returns(address[])',
 'function getThreshold() view returns(uint256)',
 'function isModuleEnabled(address module) view returns(bool)'
]);
const isAddress=(value:unknown):value is `0x${string}`=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value);
const zero='0x0000000000000000000000000000000000000000',sentinel='0x0000000000000000000000000000000000000001';
const MAX_OWNERS=64;
/** Reads a bounded candidate account state, never authenticates a Safe.
 * https://docs.safe.global/reference-smart-account/owners/getOwners
 * https://docs.safe.global/reference-smart-account/modules/isModuleEnabled
 * GuardManager.getGuard is internal; no fictional getter/storage layout guessed.
 * fetcher is optional injection for offline tests, never supplied by clients. */
export async function accountEvidence(request:SecurityRequest,op:Operation,config:SecurityConfig,fetcher:typeof fetch=fetch):Promise<Evidence[]>{
 if(request.kind!=='transaction'||!request.transaction.to||!['account_control','account_execution'].includes(op.category))return [];
 const target=request.transaction.to,out:Evidence[]=[evidence('account_semantics','unknown','Smart-account implementation and full authority graph unverified','Safe-shaped methods do not authenticate a deployment. Complete module/guard/fallback configuration, owner contract policies, signature acceptance, nonce/preapproved-hash use and nested execution remain unverified. No getGuard public getter is assumed.','coverage',{account:target,identityVerified:false,fullModuleGraphChecked:false,guardStateChecked:false,fallbackStateChecked:false,signaturesVerified:false})];
 const url=config.rpc[request.chainId];if(!url)return [...out,evidence('account_state','unknown','Smart-account state unavailable','No trusted RPC is configured for this network.','configuration')];
 let serial=0;let guard:ReturnType<typeof rpcSnapshotGuard>|undefined;
 const rpc=async(method:string,params:unknown[])=>{
  const id=++serial,response=await fetcher(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(2200)});
  if(!response.ok)throw Error('RPC unavailable');const body=JSON.parse(await readBoundedText(response,100000));if(body.jsonrpc!=='2.0'||body.id!==id||body.error||body.result===undefined)throw Error('RPC failed');return body.result;
 };
 try{
  const chain=await rpc('eth_chainId',[]);if(typeof chain!=='string'||!/^0x[\da-f]+$/i.test(chain)||BigInt(chain)!==BigInt(request.chainId))throw Error('Wrong chain');
  const block=await rpc('eth_blockNumber',[]);if(typeof block!=='string'||!/^0x[\da-f]{1,64}$/i.test(block))throw Error('Invalid block');
  const header=await rpc('eth_getBlockByNumber',[block,false]);
  guard=rpcSnapshotGuard(request.chainId,BigInt(block),header,async()=>{const [chain,header]=await Promise.all([rpc('eth_chainId',[]),rpc('eth_getBlockByNumber',[block,false])]);return {chain,header};});
  const snapshot=guard.snapshot;
  const read=async(name:'getOwners'|'getThreshold'|'isModuleEnabled',args:readonly unknown[]=[])=>{const value=await rpc('eth_call',[{to:target,data:encodeFunctionData({abi:accountStateAbi,functionName:name,args:args as never})},block]);if(typeof value!=='string'||!/^0x(?:[\da-f]{2})*$/i.test(value))throw Error('Malformed result');return decodeFunctionResult({abi:accountStateAbi,functionName:name,data:value as `0x${string}`});};
  const authorities=[op.fields.newAuthority,op.fields.executionTarget].filter(isAddress).filter(value=>![zero,sentinel,target.toLowerCase()].includes(value.toLowerCase()));
  const unique=[...new Map(authorities.map(value=>[value.toLowerCase(),value])).values()].slice(0,2);
  const module=isAddress(op.fields.module)&&![zero,sentinel].includes(op.fields.module.toLowerCase())?op.fields.module:undefined;
  const reads=await Promise.allSettled([read('getOwners'),read('getThreshold'),rpc('eth_getCode',[target,block]),...(module?[read('isModuleEnabled',[module])]:[]),...unique.map(value=>rpc('eth_getCode',[value,block]))]);
  let owners:string[]|undefined,threshold:bigint|undefined;
  const ownerRead=reads[0];
  if(ownerRead.status==='fulfilled'&&Array.isArray(ownerRead.value)&&ownerRead.value.every(isAddress)){
   const all=ownerRead.value as string[],bad=all.some(value=>[zero,sentinel].includes(value.toLowerCase()))||new Set(all.map(value=>value.toLowerCase())).size!==all.length;
   const truncated=all.length>MAX_OWNERS;if(!bad&&all.length&& !truncated)owners=all;
   out.push(evidence('account_owners',owners?'pass':'unknown',owners?'Current candidate account owners observed':'Candidate account owner list incomplete or invalid','A getOwners response is an interface observation, not proof of official deployment, owner identity, linked-list consistency or contract-owner signature policy. At most 64 owner addresses are retained.','rpc',{account:target,owners:all.slice(0,MAX_OWNERS),returnedCount:all.length,truncated,invalidList:bad,...snapshot,identityVerified:false}));
  }else out.push(evidence('account_owners','unknown','Current candidate account owners unavailable','The getOwners interface failed or returned malformed data. Other observations are retained.','rpc',{account:target,...snapshot}));
  const thresholdRead=reads[1];if(thresholdRead.status==='fulfilled'&&typeof thresholdRead.value==='bigint'&&thresholdRead.value>0n){threshold=thresholdRead.value;out.push(evidence('account_threshold','pass','Current candidate account threshold observed','This is the returned owner-signature threshold. It does not establish that signatures, owners, modules or guards are trustworthy.','rpc',{account:target,threshold:String(threshold),...(owners?{observedOwnerCount:owners.length,withinObservedOwnerCount:threshold<=BigInt(owners.length)}:{}),...snapshot,identityVerified:false}));}else out.push(evidence('account_threshold','unknown','Current candidate account threshold unavailable','The interface failed, was malformed, or returned zero. No threshold is inferred from calldata.','rpc',{account:target,...snapshot}));
  const codeRead=reads[2];try{if(codeRead.status==='rejected')throw codeRead.reason;const code=validateAccountCode(codeRead.value);out.push(evidence('account_code',code==='0x'?'unknown':'pass','Candidate account code observed',code==='0x'?'No current account code was observed; returned interfaces do not establish a contract account.':'Code presence/hash is not deployment identity or an audit of implementation and delegation.','rpc',{account:target,hasCode:code!=='0x',...(code!=='0x'?{codeHash:keccak256(code)}:{}),...snapshot,identityVerified:false}));}catch{out.push(evidence('account_code','unknown','Candidate account code unavailable','A failed code read does not discard independently observed owners or threshold.','rpc',{account:target,...snapshot}));}
  let next=3;
  if(module){const result=reads[next++];out.push(evidence('account_module',result.status==='fulfilled'&&typeof result.value==='boolean'?'pass':'unknown',result.status==='fulfilled'?'Selected module state observed':'Selected module state unavailable','Only isModuleEnabled for the explicitly selected non-sentinel module is queried. This does not enumerate modules, authenticate their code, or establish guard/module enforcement.','rpc',{account:target,module,...(result.status==='fulfilled'&&typeof result.value==='boolean'?{enabled:result.value}:{}),...snapshot,identityVerified:false}));}
  for(let index=0;index<unique.length;index++){
   const at=unique[index],result=reads[next++];try{if(result.status==='rejected')throw result.reason;const code=validateAccountCode(result.value);out.push(evidence(`account_authority_code_${index}`,'pass','Selected authority or execution target code observed','An address with or without code can exercise authority depending on the implementation. Code/hash is not legitimacy, a module audit, delegatecall safety or future execution proof.','rpc',{account:target,target:at,hasCode:code!=='0x',...(code!=='0x'?{codeHash:keccak256(code)}:{}),...snapshot,identityVerified:false}));}catch{out.push(evidence(`account_authority_code_${index}`,'unknown','Selected authority or execution target code unavailable','This target read failed independently of account owner/threshold/module observations.','rpc',{account:target,target:at,...snapshot}));}
  }
  if(typeof op.fields.threshold==='string'&&/^\d+$/.test(op.fields.threshold)&&threshold!==undefined){const proposed=BigInt(op.fields.threshold);out.push(evidence('account_threshold_change',proposed<threshold?'warning':'pass','Requested threshold compared with observed state','This compares candidate calldata with the returned current threshold only. Owner-count validity, authorization and actual execution are not established.','rpc',{account:target,currentThreshold:String(threshold),requestedThreshold:String(proposed),relation:proposed<threshold?'lower':proposed>threshold?'higher':'unchanged',...snapshot,identityVerified:false}));}
  if(op.category==='account_execution'&&op.fields.executionOperation==='unsupported')out.push(evidence('account_execution_type','unknown','Unsupported account execution operation','The uint8 value is outside the supported CALL/DELEGATECALL candidates. Equivalent execution is not claimed.','coverage'));
 }catch{out.push(evidence('account_state','unknown','Smart-account network or snapshot unavailable','The configured node failed, returned a different chain, or supplied no usable fixed block. No account state is inferred.','rpc'));}
 finally{if(guard)await guard.finish(out,'account');}
 return out;
}
