import {concatHex,keccak256,recoverAddress,toHex,toRlp,type Hex} from 'viem';
import type {SecurityConfig} from './config.js';
import type {Evidence,Operation,SecurityRequest} from './types.js';
import {evidence} from './evidence.js';
import {pinnedRpc} from './trusted-rpc.js';
const zero='0x0000000000000000000000000000000000000000',curveN=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const quantity=(value:unknown):value is Hex=>typeof value==='string'&&/^0x[\da-f]{1,64}$/i.test(value);
type Tuple=NonNullable<Extract<SecurityRequest,{kind:'transaction'}>['transaction']['authorizationList']>[number];
/** Exact EIP-7702 signing digest; bigint quantities never round through JS
 * numbers, and zero quantities use empty RLP byte strings. */
export function authorizationDigest(tuple:Pick<Tuple,'chainId'|'address'|'nonce'>):Hex{
 return keccak256(concatHex(['0x05',toRlp([BigInt(tuple.chainId)?toHex(BigInt(tuple.chainId)):'0x',tuple.address as Hex,BigInt(tuple.nonce)?toHex(BigInt(tuple.nonce)):'0x'])]));
}
export async function recoverDelegationAuthority(tuple:Tuple):Promise<Hex|null>{
 try{const r=BigInt(tuple.r),s=BigInt(tuple.s),parity=BigInt(tuple.yParity);if(parity>1n||r===0n||r>=curveN||s===0n||s>curveN/2n)return null;
  return await recoverAddress({hash:authorizationDigest(tuple),signature:{r:toHex(r,{size:32}),s:toHex(s,{size:32}),yParity:Number(parity)}});
 }catch{return null;}
}
/** Authorization eligibility at a pinned snapshot, not envelope execution or
 * an audit of code running with EOA authority. Successful tuple changes can
 * survive a later execution revert. Resolution follows one designator only.
 * https://eips.ethereum.org/EIPS/eip-7702 */
export async function delegationEvidence(request:SecurityRequest,_op:Operation,config:SecurityConfig,fetcher:typeof fetch=fetch):Promise<Evidence[]>{
 if(request.kind!=='transaction'||!request.transaction.authorizationList&&!(request.transaction.type&&BigInt(request.transaction.type)===4n))return [];
 const tx=request.transaction,list=tx.authorizationList??[],out:Evidence[]=[evidence('delegation_semantics','unknown','Delegation implementation and full execution unverified','Only actual tuple signatures, selected chain/code/nonce state and conditional sequential eligibility are checked. Delegate initialization, storage/validator/session policy, downstream calls, future upgrades and full envelope execution remain unverified. Valid code delegations can persist even if transaction execution later reverts.','coverage',{fullEnvelopeSimulated:false,implementationPolicyVerified:false,postExecutionRevertDoesNotUndoValidDelegations:true,rawSignatureIncluded:false})];
 const explicitType=tx.type!==undefined&&BigInt(tx.type)===4n,outerInvalid=tx.type!==undefined&&!explicitType||!tx.to||list.length===0||list.length>16;
 out.push(evidence('delegation_envelope',outerInvalid?'warning':explicitType?'pass':'unknown','Set-code envelope shape checked','EIP-7702 uses type 0x04, a non-null destination and a nonempty authorization list. Tuple analysis is conditional and does not silently reduce this request to an ordinary transaction.','request',{type:tx.type??null,authorizationCount:list.length,typeExplicitlySet:explicitType,destinationPresent:!!tx.to,envelopeShapeSupported:!outerInvalid&&explicitType}));
 if(!list.length||list.length>16)return out;
 const recovered=await Promise.all(list.map(recoverDelegationAuthority));
 list.forEach((tuple,index)=>{const authority=recovered[index],chainMatches=BigInt(tuple.chainId)===0n||BigInt(tuple.chainId)===BigInt(request.chainId),nonceInRange=BigInt(tuple.nonce)<(1n<<64n)-1n;
  out.push(evidence(`delegation_signature_${index}`,!authority||!chainMatches||!nonceInRange?'warning':BigInt(tuple.chainId)===0n?'warning':'pass','Authorization tuple cryptography and declared scope checked','Recovery binds this exact delegate/chain/nonce tuple to the recovered authority; it does not verify delegate safety, transaction execution or project identity. An authority different from the outer sender can be a legitimate sponsored authorization.','signature',{tupleIndex:index,delegate:tuple.address,action:tuple.address.toLowerCase()===zero?'clear_delegation':'set_delegation',authorizationChainId:String(BigInt(tuple.chainId)),requestChainId:request.chainId,chainMatches,crossChainAuthorization:BigInt(tuple.chainId)===0n,requestedNonce:String(BigInt(tuple.nonce)),nonceWithinProcessingRange:nonceInRange,signatureRecovered:!!authority,recoveredAuthority:authority??null,authorityIsOuterSender:authority?.toLowerCase()===tx.from.toLowerCase(),rawSignatureIncluded:false}));
 });
 let client;try{client=await pinnedRpc(config,request.chainId,fetcher);}catch{return [...out,evidence('delegation_state','unknown','Delegation network snapshot unavailable','Only the supplied signatures were checked. Trusted chain, nonce, authority-code eligibility and delegate code could not be observed; no zero nonce or empty code is substituted.','rpc',{chainId:request.chainId})];}
 const pinned=client,snapshot=pinned.snapshot;
 try{
 type State={nonce?:bigint;codeEligible?:boolean;code?:Hex};
 const states=new Map<string,State>(),authorities=[...new Set([tx.from.toLowerCase(),...recovered.filter((value):value is Hex=>!!value).map(value=>value.toLowerCase())])];
 // At most 17 authorities and 16 selected delegates; no arbitrary URLs or
 // implementation getters are inferred from bytecode or supplied metadata.
 await Promise.all(authorities.map(async at=>{const state:State={};states.set(at,state);const reads=await Promise.allSettled([pinned.call('eth_getTransactionCount',[at,pinned.tag]),pinned.code(at)]);
  if(reads[0].status==='fulfilled'&&quantity(reads[0].value))state.nonce=BigInt(reads[0].value);
  if(reads[1].status==='fulfilled'){state.code=reads[1].value;state.codeEligible=state.code==='0x'||/^0xef0100[\da-f]{40}$/i.test(state.code);}
 }));
 const senderState=states.get(tx.from.toLowerCase()),declaredOuterNonce=tx.nonce===undefined?undefined:BigInt(tx.nonce),senderNonceMatches=senderState?.nonce!==undefined&&declaredOuterNonce!==undefined?senderState.nonce===declaredOuterNonce:null;
 out.push(evidence('delegation_sender_nonce',senderState?.nonce===undefined?'unknown':senderNonceMatches===false?'warning':'pass','Outer sender nonce observed separately','Authorization processing occurs after the outer sender nonce increments. Confirmed state does not include pending transactions, and an omitted outer nonce still needs wallet/bundler selection.','rpc',{...snapshot,sender:tx.from,currentNonce:senderState?.nonce===undefined?null:String(senderState.nonce),declaredOuterNonce:declaredOuterNonce===undefined?null:String(declaredOuterNonce),declaredNonceMatchesCurrent:senderNonceMatches,outerTransactionAccepted:false}));
 const expected=new Map<string,bigint|undefined>(),eligibleCode=new Map<string,boolean|undefined>();
 for(const [at,state] of states){expected.set(at,state.nonce===undefined?undefined:state.nonce+(at===tx.from.toLowerCase()?1n:0n));eligibleCode.set(at,state.codeEligible);}
 const lastEligible=new Map<string,number>();
 for(let index=0;index<list.length;index++){
  const tuple=list[index],authority=recovered[index];if(!authority)continue;
  const at=authority.toLowerCase(),nonce=expected.get(at),codeAllowed=eligibleCode.get(at),chainAllowed=BigInt(tuple.chainId)===0n||BigInt(tuple.chainId)===BigInt(request.chainId),rangeAllowed=BigInt(tuple.nonce)<(1n<<64n)-1n;
  const certainFailure=!chainAllowed||!rangeAllowed||codeAllowed===false||nonce!==undefined&&nonce!==BigInt(tuple.nonce),eligible=certainFailure?false:nonce===undefined||codeAllowed===undefined?null:true;
  const state=states.get(at),currentCode=state?.code;
  out.push(evidence(`delegation_state_${index}`,eligible===null?'unknown':eligible?'pass':'warning','Authorization tuple snapshot eligibility compared','This follows list order and the sender pre-increment. A snapshot match is conditional on outer transaction acceptance, no intervening nonce/code changes and full protocol support. Invalid tuples are skipped; later eligible tuples for the same authority replace earlier ones.','rpc',{...snapshot,tupleIndex:index,authority,delegate:tuple.address,requestedNonce:String(BigInt(tuple.nonce)),expectedNonceAtThisTuple:nonce===undefined?null:String(nonce),authorityCodeEligible:codeAllowed??null,tupleEligibleAtSnapshot:eligible,assumesOuterTransactionAccepted:true,outerEnvelopeShapeSupported:!outerInvalid&&explicitType,outerDeclaredNonceMatchesCurrent:senderNonceMatches,codeObservation:currentCode===undefined?'unavailable':currentCode==='0x'?'empty':/^0xef0100[\da-f]{40}$/i.test(currentCode)?'delegation_designator':'other_contract_code',...(currentCode&&currentCode!=='0x'?{authorityCodeHash:keccak256(currentCode)}:{}),...(currentCode&&/^0xef0100[\da-f]{40}$/i.test(currentCode)?{currentDelegate:`0x${currentCode.slice(8)}`}:{})}));
  if(eligible===true){expected.set(at,nonce!+1n);eligibleCode.set(at,true);lastEligible.set(at,index);}else if(eligible===null){expected.set(at,undefined);eligibleCode.set(at,undefined);}
 }
 if(lastEligible.size)out.push(evidence('delegation_sequence','pass','Conditional last-eligible delegation candidates summarized','These candidates result only from this bounded snapshot comparison. They are not confirmed account changes and do not establish implementation or transaction safety.','rpc',{...snapshot,conditional:true,confirmedChanges:false,candidates:[...lastEligible.entries()].map(([authority,index])=>({authority,tupleIndex:index,delegate:list[index].address,action:list[index].address.toLowerCase()===zero?'clear_delegation':'set_delegation'}))}));
 const delegates=[...new Set(list.map(tuple=>tuple.address.toLowerCase()).filter(at=>at!==zero))];
 await Promise.all(delegates.map(async(at,index)=>{try{const code=await pinned.code(at);
  out.push(evidence(`delegation_target_${index}`,code==='0x'?'warning':'pass','Selected delegate code observed','Code presence/hash does not audit delegate authority. Empty code can include precompile behavior; a delegate designator is not recursively followed because EIP-7702 resolves only one hop.','rpc',{...snapshot,delegate:at,hasCode:code!=='0x',...(code!=='0x'?{codeHash:keccak256(code)}:{}),delegateIsDesignator:/^0xef0100[\da-f]{40}$/i.test(code),resolutionHopsChecked:1,implementationPolicyVerified:false,identityVerified:false}));
 }catch{out.push(evidence(`delegation_target_${index}`,'unknown','Selected delegate code unavailable','No empty implementation or trusted code is inferred from a failed read.','rpc',{...snapshot,delegate:at}));}}));
 return out;
 }finally{await pinned.finalize(out,'delegation');}
}
