import {requestSchema,type SecurityRequest,type SecurityReport} from '../security/types.js';
import {normalizeAuthorizationList,unsupportedTransactionFields} from '../security/transaction-fields.js';
import {sanitizeRpcParams} from '../security/rpc-redaction.js';
export {sensitiveRpcField} from '../security/rpc-redaction.js';
export type ProviderRequest={method:string;params?:unknown[]|Record<string,unknown>};
export type Eip1193Provider={request:(args:ProviderRequest)=>Promise<unknown>;on?:(event:string,listener:(...args:unknown[])=>void)=>void;removeListener?:(event:string,listener:(...args:unknown[])=>void)=>void};
export type RequestContext={chainId:number;account?:string;origin:string};
const address=(value:unknown):value is string=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value);
const signing=new Set(['personal_sign','eth_sign','eth_signTypedData','eth_signTypedData_v3','eth_signTypedData_v4']);
const permissions=new Set(['eth_requestAccounts','wallet_requestPermissions','wallet_grantPermissions','wallet_revokePermissions','wallet_requestExecutionPermissions','wallet_grantExecutionPermissions','wallet_revokeExecutionPermission','wallet_createSession','wallet_revokeSession']);
const transactionFields=new Set(['from','to','data','input','chainId','value','gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce','type','authorizationList','accessList','blobVersionedHashes','blobs','maxFeePerBlobGas']);
function jsonParameters(value:unknown):boolean{
 let nodes=0;const active=new Set<object>();
 const visit=(item:unknown,depth:number):boolean=>{if(++nodes>10000||depth>32)return false;if(item===null||typeof item==='string'||typeof item==='boolean')return true;if(typeof item==='number')return Number.isFinite(item);if(!item||typeof item!=='object'||active.has(item))return false;const prototype=Object.getPrototypeOf(item);if(!Array.isArray(item)&&prototype!==Object.prototype&&prototype!==null)return false;const keys=Reflect.ownKeys(item);if(keys.length>10001||keys.some(key=>typeof key!=='string'||!Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)??{},'value')))return false;active.add(item);let valid=true;if(Array.isArray(item)){if(item.length>10000)valid=false;else for(let index=0;index<item.length;index++)if(!Object.hasOwn(item,index)||!visit(item[index],depth+1)){valid=false;break;}}else for(const key of keys)if(!visit((item as Record<string,unknown>)[String(key)],depth+1)){valid=false;break;}active.delete(item);return valid;};
 return visit(value,0);
}
function sameContext(before:RequestContext,after:RequestContext):boolean{
 try{return before.chainId===after.chainId&&(before.account??'').toLowerCase()===(after.account??'').toLowerCase()&&new URL(before.origin).origin===new URL(after.origin).origin;}catch{return false;}
}
/** Public unsigned fields only. A submitted UserOperation signature is not
 * retained or sent to AI; cryptographic acceptance remains explicitly unknown. */
export function redactRpcParams(value:unknown):unknown{return sanitizeRpcParams(value).params;}
export function normalizeProviderRequest(args:ProviderRequest,context:RequestContext):SecurityRequest{
 if(!Number.isSafeInteger(context.chainId)||context.chainId<=0)throw Error('A verified request network is required');
 const origin=new URL(context.origin).origin;if(!/^https?:/.test(origin))throw Error('A web origin is required');
 const method=args.method,params=args.params,base={chainId:context.chainId,origin};let request:unknown;
 if(Object.keys(args).some(key=>!['method','params'].includes(key)))throw Error('Unknown provider request fields cannot be omitted from analysis');
 if(params!==undefined&&!jsonParameters(params))throw Error('Non-JSON request parameters cannot be analyzed without changing their meaning');
 if(method==='eth_sendTransaction'||method==='eth_signTransaction'){
  const tx=Array.isArray(params)&&params.length===1?params[0]:undefined;if(!tx||typeof tx!=='object'||Array.isArray(tx))throw Error('Exactly one unsigned transaction is required');const raw=tx as Record<string,unknown>;
  if(Object.keys(raw).some(key=>!transactionFields.has(key)))throw Error('Unknown transaction execution fields cannot be analyzed as an ordinary substitute transaction');
  if(Object.hasOwn(raw,'chainId')){let requested:bigint|undefined;try{if(typeof raw.chainId==='number'&&Number.isSafeInteger(raw.chainId)&&raw.chainId>0||typeof raw.chainId==='string'&&/^(?:0x[\da-f]+|\d+)$/i.test(raw.chainId))requested=BigInt(raw.chainId);}catch{}if(requested!==BigInt(context.chainId))throw Error('The transaction chain ID differs from the selected request network');}
  if(Object.hasOwn(raw,'data')&&(typeof raw.data!=='string'||!/^0x(?:[\da-f]{2})*$/i.test(raw.data)))throw Error('The transaction data is not canonical calldata');
  let data=raw.data??'0x';
  if(Object.hasOwn(raw,'input')){if(typeof raw.input!=='string'||!/^0x(?:[\da-f]{2})*$/i.test(raw.input))throw Error('The transaction input alias is not canonical calldata');if(Object.hasOwn(raw,'data')&&(typeof raw.data!=='string'||raw.data.toLowerCase()!==raw.input.toLowerCase()))throw Error('The transaction data and input aliases disagree');data=raw.input;}
  const authorizationList=normalizeAuthorizationList(raw.authorizationList),type=typeof raw.type==='number'&&Number.isSafeInteger(raw.type)&&raw.type>=0?`0x${raw.type.toString(16)}`:raw.type;
  request={...base,kind:'transaction',transaction:{from:raw.from,to:raw.to??null,data,...Object.fromEntries(['value','gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce'].filter(key=>raw[key]!==undefined).map(key=>[key,raw[key]])),...(type!==undefined?{type}:{}),...(authorizationList?{authorizationList}:{}),unsupportedFields:unsupportedTransactionFields(raw)}};
 }else if(signing.has(method)){
  if(!Array.isArray(params)||params.length!==2)throw Error('Signing parameters required');
  const from=method==='personal_sign'?params[1]:params[0],data=method==='personal_sign'?params[0]:params[1];if(!address(from))throw Error('Signing account unavailable');
  request={...base,kind:'signature',signature:{from,method,data}};
 }else if(method==='eth_sendRawTransaction')throw Error('An already signed raw transaction has no pre-sign analysis entry');
 else {
  const kind=method==='eth_sendUserOperation'||method==='eth_estimateUserOperationGas'?'user_operation':permissions.has(method)?'permission':'wallet_rpc';
  const unsignedParams=method==='eth_requestAccounts'&&params===undefined?[]:params;if(!unsignedParams||typeof unsignedParams!=='object')throw Error('Explicit unsigned parameters are required');
  const sanitized=sanitizeRpcParams(unsignedParams);if(sanitized.truncated)throw Error('The unsigned parameter structure exceeds the analysis budget; no complete analysis was performed');
  request={...base,kind,method,params:sanitized.params};
 }
 const parsed=requestSchema.parse(request);
 if(context.account&&(parsed.kind==='transaction'&&parsed.transaction.from.toLowerCase()!==context.account.toLowerCase()||parsed.kind==='signature'&&parsed.signature.from.toLowerCase()!==context.account.toLowerCase()))throw Error('The request account differs from the selected account');
 if(new TextEncoder().encode(JSON.stringify(parsed)).byteLength>30000)throw Error('Unsigned request exceeds the analysis budget');
 return parsed;
}
export type ProviderAdvisory={method:string;source:'integration-sdk';report?:SecurityReport;unavailable?:string;publicFieldsOnly?:boolean;inputFieldsRemoved?:boolean;note?:string};
/** Explicit dApp integration; never patches/fakes window.ethereum, bypasses
 * wallet approval or blocks on the model's risk decision. The original request
 * is forwarded exactly once, even if analysis fails or a callback throws. */
export function createWalletShieldProvider(provider:Eip1193Provider,options:{context:()=>RequestContext;analyze:(request:SecurityRequest,signal:AbortSignal)=>Promise<SecurityReport>;onAdvisory:(event:ProviderAdvisory)=>void|Promise<void>;analyzeTransactions?:boolean;analyzeSignatures?:boolean;analyzeReadOnly?:boolean;timeoutMs?:number}):Eip1193Provider{
 const timeout=options.timeoutMs??80000;if(!Number.isInteger(timeout)||timeout<1||timeout>85000)throw Error('Invalid analysis deadline');let analyzing=false;
 const notify=async(event:ProviderAdvisory)=>{let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([Promise.resolve().then(()=>options.onAdvisory(event)),new Promise<void>(resolve=>{timer=setTimeout(resolve,1000);})]);}catch{/* Advisory UI cannot become a wallet policy gate. */}finally{if(timer)clearTimeout(timer);}};
 return {on:provider.on?.bind(provider),removeListener:provider.removeListener?.bind(provider),request:async(args)=>{
  let compatible=false;try{compatible=args.params===undefined||jsonParameters(args.params);}catch{/* Exotic objects cannot establish a stable JSON request. */}let snapshot:ProviderRequest;
  try{snapshot=structuredClone(args);}catch{await notify({method:typeof args.method==='string'?args.method:'unknown',source:'integration-sdk',unavailable:'Request parameters could not be captured as a stable unsigned input; no analysis was performed.'});return provider.request(args);}
  const method=snapshot.method;
  const internal=/^(?:wallet_(?:getSnaps|requestSnaps|invokeSnap)|metamask_)/.test(method),read=/^(?:eth_(?:accounts$|chainId$|get|call$|estimateGas$|estimateUserOperationGas$|blockNumber$|gasPrice$|feeHistory$|maxPriorityFeePerGas$|syncing$|protocolVersion$|coinbase$|mining$|hashrate$|subscribe$|unsubscribe$|newFilter$|newBlockFilter$|newPendingTransactionFilter$|uninstallFilter$)|net_|web3_|wallet_get)/.test(method);
  const transaction=method==='eth_sendTransaction'||method==='eth_signTransaction';
  const selected=!internal&&(!read||options.analyzeReadOnly===true)&&(!transaction||options.analyzeTransactions===true)&&(!signing.has(method)||options.analyzeSignatures===true);
  if(selected){if(analyzing)await notify({method,source:'integration-sdk',unavailable:'Another integration analysis is in progress; this request was not analyzed.'});
   else {analyzing=true;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    let publicMetadata:Pick<ProviderAdvisory,'publicFieldsOnly'|'inputFieldsRemoved'|'note'>={};
    try{if(!compatible)throw Error('Non-JSON request parameters cannot be analyzed without changing their meaning');if(!transaction&&!signing.has(method)&&method!=='eth_sendRawTransaction'){const sanitized=sanitizeRpcParams(snapshot.params??[]);publicMetadata={publicFieldsOnly:true,inputFieldsRemoved:sanitized.removed,note:sanitized.removed?'Credential and signature fields were omitted from the analysis input. The report concerns only retained unsigned public fields; omitted fields and signature acceptance remain unverified.':'Only retained unsigned public RPC fields are analyzed. Account policy, signature acceptance and complete execution may remain unverified.'};}const captured=structuredClone(options.context()),request=normalizeProviderRequest(structuredClone(snapshot),captured);const report=await Promise.race([options.analyze(request,controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Integration analysis timed out; no safety conclusion is available'));},timeout);})]);if(!sameContext(captured,options.context()))throw Error('The wallet request context changed during analysis; no previous-context report is presented');await notify({method,source:'integration-sdk',...publicMetadata,report});}
    catch(error){await notify({method,source:'integration-sdk',...publicMetadata,unavailable:error instanceof Error?error.message:'Integration analysis unavailable'});}
    finally{if(timer)clearTimeout(timer);controller.abort();analyzing=false;}
   }
  }
  return provider.request(snapshot);
 }};
}
