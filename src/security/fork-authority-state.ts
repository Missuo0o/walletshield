import {decodeFunctionResult,encodeFunctionData,parseAbi,type Abi,type Address,type Hex} from 'viem';
import {evidence,snapshotMetadata} from './evidence.js';
import type {Evidence,Operation,SecurityRequest} from './types.js';
import type {ForkReadRpc} from './fork-protocol-state.js';
const abi=parseAbi([
 'function supportsInterface(bytes4) view returns(bool)','function allowance(address,address) view returns(uint256)','function allowance(address,address,address) view returns(uint160,uint48,uint48)',
 'function ownerOf(uint256) view returns(address)','function getApproved(uint256) view returns(address)','function isApprovedForAll(address,address) view returns(bool)',
 'function getOwners() view returns(address[])','function getThreshold() view returns(uint256)','function isModuleEnabled(address) view returns(bool)'
]);
const address=(value:unknown):value is Address=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value);
const uint=(value:unknown):value is string=>typeof value==='string'&&/^\d+$/.test(value);
const integer=(value:unknown):value is bigint|number=>(typeof value==='bigint'||typeof value==='number'&&Number.isSafeInteger(value))&&BigInt(value)>=0n;
type Value=string|boolean|string[];
export type ForkAuthorityState={phase:'before'|'after';target:Address;kind:string;subjects:Record<string,string>;values:Record<string,Value>;missing:string[];snapshot:Record<string,unknown>};
/** Read only the exact authority stores selected by the original request. No
 * approval is synthesized, no unsigned signature is consumed and no account
 * guard/fallback storage slot is guessed from an unauthenticated ABI. */
export async function captureForkAuthorityState(rpc:ForkReadRpc,request:SecurityRequest,op:Operation,phase:'before'|'after',base:Record<string,unknown>,tag:string):Promise<ForkAuthorityState|null>{
 if(request.kind!=='transaction'||!address(request.transaction.to)||!address(request.transaction.from)||!['approval','operator_approval','permit','permit2_approval','account_control','account_execution'].includes(op.category))return null;
 const target=request.transaction.to,caller=request.transaction.from,state:ForkAuthorityState={phase,target,kind:op.category,subjects:{caller},values:{},missing:[],snapshot:{...base,stateSpace:'isolated-fork',phase,baseBlockNumber:base.blockNumber,baseBlockHash:base.blockHash,baseBlockTimestampSeconds:base.blockTimestampSeconds}};
 let pinned=tag;
 try{const header=await rpc('eth_getBlockByNumber',[tag,false]);if(!header||typeof header.number!=='string'||!/^0x[\da-f]+$/i.test(header.number)||tag!=='latest'&&BigInt(header.number)!==BigInt(tag))throw Error('Header mismatch');pinned=header.number;if(phase==='after'){delete state.snapshot.blockHash;delete state.snapshot.blockTimestampSeconds;}state.snapshot={...state.snapshot,...snapshotMetadata(Number(base.chainId),BigInt(pinned),{number:BigInt(pinned),hash:header.hash,...(typeof header.timestamp==='string'&&/^0x[\da-f]+$/i.test(header.timestamp)?{timestamp:BigInt(header.timestamp)}:{})})};}
 catch{state.missing.push('phase_block_header');if(phase==='after'){delete state.snapshot.blockHash;delete state.snapshot.blockTimestampSeconds;if(/^0x[\da-f]+$/i.test(tag))state.snapshot.blockNumber=String(BigInt(tag));else delete state.snapshot.blockNumber;}}
 const read=async(at:Address,name:string,args:unknown[]=[])=>{const selected=abi.filter(item=>item.name===name&&(name!=='allowance'||item.inputs.length===args.length)) as Abi;return decodeFunctionResult({abi:selected,functionName:name,data:await rpc('eth_call',[{from:caller,to:at,data:encodeFunctionData({abi:selected,functionName:name,args})},pinned]) as Hex});};
 const observe=async(key:string,run:()=>Promise<unknown>,kind:'uint'|'address'|'boolean')=>{try{const value=await run();if(kind==='uint'&&integer(value))state.values[key]=String(value);else if(kind==='address'&&address(value))state.values[key]=value;else if(kind==='boolean'&&typeof value==='boolean')state.values[key]=value;else throw Error('Malformed interface');}catch{state.missing.push(key);}};
 if(op.category==='approval'&&address(op.fields.spender)&&uint(op.fields.amountOrTokenId)){
  const interfaces=await Promise.allSettled(['0x80ac58cd','0xd9b67a26'].map(id=>read(target,'supportsInterface',[id]))),nft=interfaces[0].status==='fulfilled'&&interfaces[0].value===true,multi=interfaces[1].status==='fulfilled'&&interfaces[1].value===true;
  state.subjects.spender=op.fields.spender;
  if(nft&&!multi){state.kind='erc721_approval';state.subjects.tokenId=op.fields.amountOrTokenId;await Promise.all([observe('erc721Owner',()=>read(target,'ownerOf',[BigInt(op.fields.amountOrTokenId as string)]),'address'),observe('erc721Approved',()=>read(target,'getApproved',[BigInt(op.fields.amountOrTokenId as string)]),'address')]);}
  else if(!nft&&!multi){state.kind='erc20_approval_candidate';state.subjects.owner=caller;await observe('erc20AllowanceRaw',()=>read(target,'allowance',[caller,op.fields.spender]),'uint');}
  else state.missing.push('unambiguous_approval_store');
 }else if(op.category==='operator_approval'&&address(op.fields.operator)){
  state.subjects.owner=caller;state.subjects.operator=op.fields.operator;await observe('operatorApproved',()=>read(target,'isApprovedForAll',[caller,op.fields.operator]),'boolean');
 }else if(op.category==='permit'&&address(op.fields.owner)&&address(op.fields.spender)){
  state.subjects.owner=op.fields.owner;state.subjects.spender=op.fields.spender;await observe('erc20AllowanceRaw',()=>read(target,'allowance',[op.fields.owner,op.fields.spender]),'uint');
 }else if(op.category==='permit2_approval'&&address(op.fields.token)&&address(op.fields.spender)){
  state.subjects.owner=caller;state.subjects.spender=op.fields.spender;state.subjects.token=op.fields.token;state.subjects.verifyingContract=target;
  await Promise.all([observe('erc20AllowanceToVerifierRaw',()=>read(op.fields.token as Address,'allowance',[caller,target]),'uint'),(async()=>{try{const values=await read(target,'allowance',[caller,op.fields.token,op.fields.spender]);if(!Array.isArray(values)||values.length!==3||values.some(value=>!integer(value)))throw Error('Malformed internal allowance');['permit2AmountRaw','permit2ExpirationSeconds','permit2Nonce'].forEach((key,index)=>state.values[key]=String(values[index]));}catch{state.missing.push('permit2_internal_allowance');}})()]);
 }else if(['account_control','account_execution'].includes(op.category)){
  state.subjects.account=target;
  await Promise.all([(async()=>{try{const owners=await read(target,'getOwners');if(!Array.isArray(owners)||owners.some(owner=>!address(owner)))throw Error('Malformed owners');state.values.owners=owners.slice(0,64);state.values.ownerCount=String(owners.length);state.values.ownersTruncated=owners.length>64;if(owners.length>64)state.missing.push('complete_owner_list');if(new Set(owners.map(owner=>owner.toLowerCase())).size!==owners.length||owners.some(owner=>/^0x0{39}[01]$/i.test(owner)))state.missing.push('valid_owner_list');}catch{state.missing.push('owners');}})(),observe('threshold',()=>read(target,'getThreshold'),'uint')]);
  if(address(op.fields.module)){state.subjects.module=op.fields.module;await observe('moduleEnabled',()=>read(target,'isModuleEnabled',[op.fields.module]),'boolean');}
  if(['setGuard','setFallbackHandler'].includes(String(op.fields.method)))state.missing.push('guard_or_fallback_storage_not_authenticated');
 }else state.missing.push('selected_authority_store');
 return state;
}

export function forkAuthorityEvidence(before:ForkAuthorityState|null,after:ForkAuthorityState|null):Evidence[]{
 const out:Evidence[]=[];
 for(const state of [before,after])if(state)out.push(evidence(`fork_authority_${state.phase}`,state.missing.length?'unknown':'pass','Selected authority state observed around fork execution','These are actual view returns before or after the original child-fork transaction. Store interfaces, owners and modules are candidates; successful reads do not authenticate their implementation or validate future use. ERC-20, NFT operator, single-NFT and Permit2 stores remain distinct.','isolated-fork',{...state.snapshot,target:state.target,kind:state.kind,subjects:state.subjects,values:state.values,missing:state.missing,identityVerified:false,simulationOnly:true}));
 if(!before||!after)return out;
 const sameStore=before.target.toLowerCase()===after.target.toLowerCase()&&before.kind===after.kind&&JSON.stringify(before.subjects).toLowerCase()===JSON.stringify(after.subjects).toLowerCase(),changedFields=sameStore?Object.keys(before.values).filter(key=>after.values[key]!==undefined&&JSON.stringify(before.values[key]).toLowerCase()!==JSON.stringify(after.values[key]).toLowerCase()):[];
 out.push(evidence('fork_authority_change',!sameStore||before.missing.length||after.missing.length?'unknown':'pass','Selected authority changes observed on the fork','Only matching selected stores and subjects are compared. Missing reads remain missing. This records the original fork execution rather than predicting permission consumption, enumerating all authorities, or asserting that a new owner/module is safe.','isolated-fork',{...after.snapshot,target:after.target,kind:after.kind,subjects:after.subjects,sameStore,changedFields,beforeValues:before.values,afterValues:after.values,identityVerified:false,simulationOnly:true}));
 return out;
}
