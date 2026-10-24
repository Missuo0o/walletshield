import {keccak256,type Hex} from 'viem';
import type {Evidence,Operation,SecurityRequest} from './types.js';
import type {SecurityConfig} from './config.js';
import {evidence} from './evidence.js';
import {pinnedRpc} from './trusted-rpc.js';

const address=(value:unknown):value is Hex=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value)&&!/^0x0{40}$/i.test(value);
const quantity=(value:unknown):value is Hex=>typeof value==='string'&&/^0x[\da-f]{1,64}$/i.test(value);
const bytes=(value:unknown):value is Hex=>typeof value==='string'&&/^0x(?:[\da-f]{2}){0,8192}$/i.test(value);
const byteCount=(value:Hex)=>(value.length-2)/2;
const commonKeys=['sender','nonce','callData','callGasLimit','verificationGasLimit','preVerificationGas','maxFeePerGas','maxPriorityFeePerGas','signature'];
export type ParsedUserOperation={entryPoint:Hex;sender:Hex;format:'v0.6'|'split';nonce:bigint;callGasLimit:bigint;verificationGasLimit:bigint;preVerificationGas:bigint;maxFeePerGas:bigint;maxPriorityFeePerGas:bigint;factory?:Hex;paymaster?:Hex;paymasterVerificationGasLimit:bigint;paymasterPostOpGasLimit:bigint;callDataBytes:number;callSelector:string;factoryDataBytes:number;paymasterDataBytes:number;signaturePresent:boolean;signatureBytes:number};
/** Strict RPC-shape extraction. Raw call/init/paymaster/signature bytes are not
 * returned or forwarded to the model. Packed, future, extension and mixed
 * versions remain unsupported rather than being silently dropped. */
export function parseUserOperation(request:SecurityRequest):ParsedUserOperation|null{
 if(request.kind!=='user_operation'||request.method!=='eth_sendUserOperation'||!Array.isArray(request.params)||request.params.length!==2||!address(request.params[1]))return null;
 const raw=request.params[0];if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const item=raw as Record<string,unknown>,legacy=Object.hasOwn(item,'initCode')||Object.hasOwn(item,'paymasterAndData');
 const allowed=new Set([...commonKeys,...(legacy?['initCode','paymasterAndData']:['factory','factoryData','paymaster','paymasterData','paymasterVerificationGasLimit','paymasterPostOpGasLimit'])]);
 if(Object.keys(item).some(key=>!allowed.has(key))||!address(item.sender)||!quantity(item.nonce)||!bytes(item.callData)||item.signature!==undefined&&!bytes(item.signature))return null;
 const gasKeys=['callGasLimit','verificationGasLimit','preVerificationGas','maxFeePerGas','maxPriorityFeePerGas'] as const;
 if(gasKeys.some(key=>!quantity(item[key])))return null;
 let factory:Hex|undefined,paymaster:Hex|undefined,factoryDataBytes=0,paymasterDataBytes=0,paymasterVerificationGasLimit=0n,paymasterPostOpGasLimit=0n;
 if(legacy){
  if(!bytes(item.initCode)||!bytes(item.paymasterAndData))return null;
  for(const [key,rawBytes] of [['factory',item.initCode],['paymaster',item.paymasterAndData]] as const){if(rawBytes==='0x')continue;if(byteCount(rawBytes)<20)return null;const at=rawBytes.slice(0,42) as Hex;if(!address(at))return null;if(key==='factory'){factory=at;factoryDataBytes=byteCount(rawBytes)-20;}else{paymaster=at;paymasterDataBytes=byteCount(rawBytes)-20;}}
 }else{
  if(item.factory!==undefined&&item.factory!==null){if(!address(item.factory)||!bytes(item.factoryData))return null;factory=item.factory;factoryDataBytes=byteCount(item.factoryData);}else if(item.factoryData!==undefined&&item.factoryData!=='0x')return null;
  if(item.paymaster!==undefined&&item.paymaster!==null){if(!address(item.paymaster)||!bytes(item.paymasterData)||!quantity(item.paymasterVerificationGasLimit)||!quantity(item.paymasterPostOpGasLimit))return null;paymaster=item.paymaster;paymasterDataBytes=byteCount(item.paymasterData);paymasterVerificationGasLimit=BigInt(item.paymasterVerificationGasLimit);paymasterPostOpGasLimit=BigInt(item.paymasterPostOpGasLimit);}
  else if(item.paymasterData!==undefined&&item.paymasterData!=='0x'||item.paymasterVerificationGasLimit!==undefined||item.paymasterPostOpGasLimit!==undefined)return null;
 }
 return {entryPoint:request.params[1],sender:item.sender,format:legacy?'v0.6':'split',nonce:BigInt(item.nonce),callGasLimit:BigInt(item.callGasLimit as Hex),verificationGasLimit:BigInt(item.verificationGasLimit as Hex),preVerificationGas:BigInt(item.preVerificationGas as Hex),maxFeePerGas:BigInt(item.maxFeePerGas as Hex),maxPriorityFeePerGas:BigInt(item.maxPriorityFeePerGas as Hex),factory,paymaster,paymasterVerificationGasLimit,paymasterPostOpGasLimit,callDataBytes:byteCount(item.callData),callSelector:byteCount(item.callData)>=4?item.callData.slice(0,10):'0x',factoryDataBytes,paymasterDataBytes,signaturePresent:typeof item.signature==='string'&&item.signature!=='0x',signatureBytes:bytes(item.signature)?byteCount(item.signature):0};
}

/** Request-shape summaries, code observations and declared fee comparisons.
 * No EntryPoint version, nonce, deposit interface or prefund formula is assumed
 * from a supplied address or schema. This is not bundler/account validation. */
export async function userOperationEvidence(request:SecurityRequest,_op:Operation,config:SecurityConfig,fetcher:typeof fetch=fetch):Promise<Evidence[]>{
 if(request.kind!=='user_operation')return [];
 const parsed=parseUserOperation(request),out:Evidence[]=[evidence('userop_semantics','unknown','UserOperation validation and execution remain partial','No bundler simulation, account signature/aggregator policy, factory-derived sender proof, session/module authority, paymaster authorization/token charge or complete execution is verified. Declared request fields, code and base fee are snapshot observations only; version-specific EntryPoint nonce, deposits and prefund validation are not performed.','coverage',{fullValidationPerformed:false,signaturePolicyVerified:false,executionVerified:false})];
 if(!parsed)return [...out,evidence('userop_request','unknown','Unsupported or incomplete UserOperation request','Only bounded eth_sendUserOperation [operation, EntryPoint] RPC payloads using the v0.6 or split v0.7/v0.8 shape are extracted. Packed, mixed, extension and arbitrary fields are not silently omitted.','request')];
 const p=parsed,gasValues=[p.callGasLimit,p.verificationGasLimit,p.preVerificationGas,p.maxFeePerGas,p.maxPriorityFeePerGas,p.paymasterVerificationGasLimit,p.paymasterPostOpGasLimit],gasOverflow=gasValues.some(value=>value>=(1n<<120n));
 const summary={entryPoint:p.entryPoint,sender:p.sender,format:p.format,nonce:String(p.nonce),nonceKey:String(p.nonce>>64n),nonceSequence:String(p.nonce&((1n<<64n)-1n)),callGasLimit:String(p.callGasLimit),verificationGasLimit:String(p.verificationGasLimit),preVerificationGas:String(p.preVerificationGas),maxFeePerGasWei:String(p.maxFeePerGas),maxPriorityFeePerGasWei:String(p.maxPriorityFeePerGas),factory:p.factory??null,paymaster:p.paymaster??null,paymasterVerificationGasLimit:String(p.paymasterVerificationGasLimit),paymasterPostOpGasLimit:String(p.paymasterPostOpGasLimit),callDataBytes:p.callDataBytes,callSelector:p.callSelector,factoryDataBytes:p.factoryDataBytes,paymasterDataBytes:p.paymasterDataBytes,signaturePresent:p.signaturePresent,signatureBytes:p.signatureBytes,rawSignatureIncluded:false};
 out.push(evidence('userop_request',gasOverflow||p.maxPriorityFeePerGas>p.maxFeePerGas?'warning':'pass','UserOperation candidate parameters extracted','These are request-declared limits, addresses, selector and byte counts. Presence describes only the analyzed public input after credential redaction; it does not prove a signature was absent from the original request or establish validity. Signature bytes are not sent to the model.','request',{...summary,gasValuesWithinUint120:!gasOverflow,priorityWithinMaximum:p.maxPriorityFeePerGas<=p.maxFeePerGas}));
 let client;try{client=await pinnedRpc(config,request.chainId,fetcher);}catch{return [...out,evidence('userop_rpc','unknown','UserOperation network snapshot unavailable','The server-configured RPC did not supply a matching chain and complete fixed block. No zero nonce or deposit is substituted.','rpc',{chainId:request.chainId})];}
 const pinned=client,snapshot=pinned.snapshot;
 try{
 out.push(evidence('userop_entrypoint','unknown','EntryPoint implementation and state semantics unverified','No version-specific getNonce or deposit ABI, prefund formula, bundler validation or safety is inferred from the declared request shape or an address.','coverage',{...snapshot,entryPoint:p.entryPoint,requestFormat:p.format,identityVerified:false,semanticsVerified:false,fullValidationPerformed:false}));
 await Promise.all(([['entrypoint',p.entryPoint],['sender',p.sender],['factory',p.factory],['paymaster',p.paymaster]] as const).filter((item):item is readonly ['entrypoint'|'sender'|'factory'|'paymaster',Hex]=>!!item[1]).map(async([role,at])=>{
  try{const code=await pinned.code(at),present=code!=='0x',senderDelegated=/^0xef0100[\da-f]{40}$/i.test(code);const expectedMissing=role==='sender'&&!!p.factory;
   out.push(evidence(`userop_${role}_code`,present?'pass':expectedMissing?'unknown':'warning',`UserOperation ${role} code observed`,role==='sender'?'Code presence does not verify account policy or signer authority. An undeployed sender requires a separately validated factory derivation; an EIP-7702 designator is not full delegation validation.':'Code presence/hash does not authenticate EntryPoint version, factory derivation, sponsorship policy or token-fee behavior.','rpc',{...snapshot,address:at,hasCode:present,...(present?{codeHash:keccak256(code)}:{}),...(role==='sender'?{delegationDesignator:senderDelegated,counterfactualCandidate:expectedMissing}:{}),identityVerified:false}));
  }catch{out.push(evidence(`userop_${role}_code`,'unknown',`UserOperation ${role} code unavailable`,'This failed read does not discard independently observed state.','rpc',{...snapshot,address:at}));}
 }));
 try{const header=await pinned.call('eth_getBlockByNumber',[pinned.tag,false]);if(!header||!quantity(header.number)||BigInt(header.number)!==pinned.block||String(header.hash).toLowerCase()!==String(snapshot.blockHash).toLowerCase()||!quantity(header.baseFeePerGas))throw Error('No bound basefee');const baseFee=BigInt(header.baseFeePerGas);out.push(evidence('userop_fee',p.maxPriorityFeePerGas>p.maxFeePerGas||p.maxFeePerGas<baseFee?'warning':'pass','UserOperation fee caps compared with pinned base fee','Only declared fee relations at this block are compared. Future base fee, bundler pricing, L1 data surcharges and paymaster token charges can differ.','rpc',{...snapshot,baseFeePerGasWei:String(baseFee),maxFeePerGasWei:String(p.maxFeePerGas),maxPriorityFeePerGasWei:String(p.maxPriorityFeePerGas),maxFeeCoversCurrentBaseFee:p.maxFeePerGas>=baseFee,priorityWithinMaximum:p.maxPriorityFeePerGas<=p.maxFeePerGas}));}catch{out.push(evidence('userop_fee','unknown','Pinned base fee comparison unavailable','A chain without a usable matching base-fee header does not receive an inferred price.','rpc',{...snapshot}));}
 return out;
 }finally{await pinned.finalize(out,'userop');}
}
