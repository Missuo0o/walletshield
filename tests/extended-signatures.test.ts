import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeAbiParameters,getTypesForEIP712Domain,hashDomain,hashTypedData,maxUint256,parseAbi,parseAbiParameters} from 'viem';
import {decodeRequest} from '../src/security/decode.js';
import {permitProtocol,signatureChainEvidence,signatureStructure,typedRequest} from '../src/security/signatures.js';
import type {SecurityRequest} from '../src/security/types.js';
import type {SecurityConfig} from '../src/security/config.js';

const signer='0x1111111111111111111111111111111111111111',spender='0x2222222222222222222222222222222222222222',token='0x3333333333333333333333333333333333333333',other='0x4444444444444444444444444444444444444444';
const nonce=`0x${'ab'.repeat(32)}`,url='http://127.0.0.1:19995',blockHash=`0x${'cd'.repeat(32)}`;
type Signature=Extract<SecurityRequest,{kind:'signature'}>;
const config:SecurityConfig={apiKey:'',model:'fixture',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{31337:url}};
function signature(kind:'dai'|'transfer'|'receive'='dai'):Signature{
 const primaryType=kind==='dai'?'Permit':kind==='transfer'?'TransferWithAuthorization':'ReceiveWithAuthorization';
 const fields=kind==='dai'?[{name:'holder',type:'address'},{name:'spender',type:'address'},{name:'nonce',type:'uint256'},{name:'expiry',type:'uint256'},{name:'allowed',type:'bool'}]:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'}];
 const message=kind==='dai'?{holder:signer,spender,nonce:'5',expiry:'2000',allowed:true}:{from:signer,to:spender,value:'100',validAfter:'900',validBefore:'2000',nonce};
 return {kind:'signature',chainId:31337,origin:'https://fixture.example',signature:{from:signer,method:'eth_signTypedData_v4',data:{domain:{name:'Fixture',version:'1',chainId:31337,verifyingContract:token},types:{[primaryType]:fields},primaryType,message}}};
}
const body=(request:Signature)=>request.signature.data as any;
test('DAI Permit exact schema uses committed holder/allowed semantics and canonical integers without changing its digest',()=>{
 const reference=signature(),expected=decodeRequest(reference),digest=hashTypedData(body(reference));
 for(const representation of ['leading','hex']){
  const request=structuredClone(reference),data=body(request);for(const key of ['nonce','expiry'])data.message[key]=representation==='leading'?`000${data.message[key]}`:`0x${BigInt(data.message[key]).toString(16)}`;
  data.message.owner=other;data.message.value='1';data.message.recipient=other;const original=JSON.stringify(request),operation=decodeRequest(request);
  assert.equal(hashTypedData(data),digest);assert.equal(signatureStructure(request)[0].status,'pass');assert.equal(permitProtocol(typedRequest(request)),'dai_permit');assert.deepEqual(operation,expected);assert.equal(JSON.stringify(request),original);
  assert.equal(operation.category,'dai_permit_signature');assert.equal(operation.fields.holder,signer);assert.equal(operation.fields.owner,signer);assert.equal(operation.fields.ownerSource,'signed_holder');assert.equal(operation.fields.value,String(maxUint256));assert.equal(operation.fields.amountSource,'derived_from_dai_allowed_not_a_signed_amount');assert.equal(operation.fields.allowed,true);assert.equal(operation.addsPermission,true);assert.equal(operation.fields.recipient,undefined);
 }
});
test('DAI allowed=false means a reference-semantic revocation; a nonboolean allowed or changed declared graph is not treated as DAI',()=>{
 const request=signature();body(request).message.allowed=false;const operation=decodeRequest(request);assert.equal(operation.addsPermission,false);assert.equal(operation.fields.unlimited,false);assert.equal(operation.fields.value,'0');assert.match(operation.label,/revocation/);
 for(const mutate of [(data:any)=>{data.message.allowed='false';},(data:any)=>{data.types.Permit[4].type='uint8';data.message.allowed=0;},(data:any)=>{data.types.Permit.push({name:'purpose',type:'string'});data.message.purpose='custom';},(data:any)=>{data.types.Permit.reverse();}]){
  const variant=signature();mutate(body(variant));assert.doesNotThrow(()=>decodeRequest(variant));assert.notEqual(decodeRequest(variant).category,'dai_permit_signature');
 }
});
test('ERC-3009 transfer and receive schemas commit exact amount and recipient without granting a standing allowance',()=>{
 for(const kind of ['transfer','receive'] as const){
  const request=signature(kind),expected=decodeRequest(request),digest=hashTypedData(body(request));body(request).message.owner=other;body(request).message.spender=other;
  for(const key of ['value','validAfter','validBefore'])body(request).message[key]=`0x${BigInt(body(request).message[key]).toString(16)}`;
  const original=JSON.stringify(request),operation=decodeRequest(request);assert.equal(hashTypedData(body(request)),digest);assert.deepEqual(operation,expected);assert.equal(JSON.stringify(request),original);
  assert.equal(operation.category,'transfer_authorization');assert.equal(operation.fields.owner,signer);assert.equal(operation.fields.ownerSource,'signed_from');assert.equal(operation.fields.recipient,spender);assert.equal(operation.fields.amount,'100');assert.equal(operation.fields.nonce,nonce);assert.equal(operation.fields.permissionKind,'single_authorization_transfer');assert.equal(operation.fields.recipientCommitted,true);assert.equal(operation.fields.actualTransferAmountCommitted,true);assert.equal(operation.addsPermission,false);assert.equal(operation.fields.spender,undefined);assert.deepEqual(operation.targets,[spender]);assert.equal(operation.fields.relayerRestriction,kind==='receive'?'caller_must_be_recipient':'any_submitter');
 }
});
test('ERC-3009 similar names, custom signed fields and wrong nonce widths do not receive authorization semantics',()=>{
 for(const mutate of [(data:any)=>{data.primaryType='CustomTransferWithAuthorization';data.types[data.primaryType]=data.types.TransferWithAuthorization;},(data:any)=>{data.types.TransferWithAuthorization[5].type='uint256';data.message.nonce='5';},(data:any)=>{data.types.TransferWithAuthorization[2].type='uint160';},(data:any)=>{data.types.TransferWithAuthorization.push({name:'fee',type:'uint256'});data.message.fee='1';},(data:any)=>{data.message.nonce='0x12';}]){
  const request=signature('transfer');mutate(body(request));assert.doesNotThrow(()=>decodeRequest(request));assert.notEqual(decodeRequest(request).category,'transfer_authorization');
 }
});

const abi=parseAbi(['function DOMAIN_SEPARATOR() view returns(bytes32)','function nonces(address) view returns(uint256)','function authorizationState(address,bytes32) view returns(bool)']);
type Options={domainFailure?:boolean;nonceFailure?:boolean;authorizationFailure?:boolean;headerFailure?:boolean;domainMismatch?:boolean;nonce?:bigint;used?:boolean;blockTime?:bigint};
type Call={method:string;params:any[];name?:string;args?:readonly unknown[]};
async function observe(request:Signature,options:Options={}){
 const previous=globalThis.fetch,calls:Call[]=[],data=body(request),domain=hashDomain({domain:data.domain,types:{EIP712Domain:getTypesForEIP712Domain({domain:data.domain})}});
 globalThis.fetch=async(input,init)=>{
  assert.equal(new URL(String(input)).href,new URL(url).href,'No real node or remote provider may be used');const rpc=JSON.parse(String(init?.body)),call:Call={method:rpc.method,params:rpc.params};calls.push(call);let result:unknown;
  try{
   if(rpc.method==='eth_chainId')result='0x7a69';else if(rpc.method==='eth_blockNumber')result='0x2a';
   else if(rpc.method==='eth_getBlockByNumber'){if(options.headerFailure)throw Error('Header unavailable');result={number:'0x2a',hash:blockHash,timestamp:`0x${(options.blockTime??1000n).toString(16)}`,transactions:[]};}
   else if(rpc.method==='eth_getCode')result=rpc.params[0]===signer?'0x':'0x6000';
   else if(rpc.method==='eth_call'){
    const decoded=decodeFunctionData({abi,data:rpc.params[0].data});call.name=decoded.functionName;call.args=decoded.args;
    if(decoded.functionName==='DOMAIN_SEPARATOR'){if(options.domainFailure)throw Error('Domain unavailable');result=encodeAbiParameters(parseAbiParameters('bytes32'),[options.domainMismatch?`0x${'00'.repeat(32)}`:domain]);}
    else if(decoded.functionName==='nonces'){if(options.nonceFailure)throw Error('Nonce unavailable');result=encodeAbiParameters(parseAbiParameters('uint256'),[options.nonce??5n]);}
    else if(decoded.functionName==='authorizationState'){if(options.authorizationFailure)throw Error('State unavailable');result=encodeAbiParameters(parseAbiParameters('bool'),[options.used??false]);}
    else throw Error('Unexpected view');
   }else throw Error('Unexpected RPC');
   return new Response(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result}));
  }catch{return new Response(JSON.stringify({jsonrpc:'2.0',id:rpc.id,error:{code:-32000,message:'Fixture view unavailable'}}));}
 };
 try{return {checks:await signatureChainEvidence(request,config),calls};}finally{globalThis.fetch=previous;}
}
test('DAI RPC state reads the signed holder nonce rather than unsigned owner metadata, preserving expiry=0 semantics',async()=>{
 const request=signature();body(request).message.holder=other;body(request).message.owner=spender;body(request).message.expiry='0x0';const {checks,calls}=await observe(request);
 assert.equal(checks.find(e=>e.id==='signature_owner_binding')?.status,'warning');assert.equal(checks.find(e=>e.id==='signature_nonce')?.status,'pass');assert.equal(checks.find(e=>e.id==='signature_nonce')?.data?.nonceScope,'holder');assert.equal(checks.find(e=>e.id==='signature_nonce')?.data?.owner,other);assert.equal(checks.find(e=>e.id==='signature_domain')?.status,'pass');
 assert.equal(checks.find(e=>e.id==='signature_deadline')?.status,'pass');assert.equal(checks.find(e=>e.id==='signature_deadline')?.data?.expiredAtObservedBlock,false);assert.equal(checks.find(e=>e.id==='signature_deadline')?.data?.expiryZeroHasNoSubmissionDeadline,true);
 const scope=checks.find(e=>e.id==='signature_scope')!;assert.equal(scope.data?.derivedAllowanceRaw,String(maxUint256));assert.equal(scope.data?.implementationVerified,false);assert.equal(scope.data?.recipientCommitted,false);
 assert.ok(calls.some(c=>c.name==='nonces'&&c.args?.[0]===other));assert.ok(!calls.some(c=>c.name==='authorizationState'));assert.ok(calls.filter(c=>c.method==='eth_call').every(c=>c.params[0].to.toLowerCase()===token.toLowerCase()&&c.params[1]==='0x2a'));
});
test('DAI domain and nonce reads fail independently, and expired submission does not imply a harmless permission',async()=>{
 const request=signature();body(request).message.expiry='999';
 const a=await observe(request,{domainFailure:true,nonce:6n});assert.equal(a.checks.find(e=>e.id==='signature_domain')?.status,'unknown');assert.equal(a.checks.find(e=>e.id==='signature_nonce')?.status,'risk');assert.equal(a.checks.find(e=>e.id==='signature_deadline')?.status,'warning');assert.equal(a.checks.find(e=>e.id==='signature_scope')?.data?.declaredGrant,true);
 const b=await observe(request,{nonceFailure:true});assert.equal(b.checks.find(e=>e.id==='signature_domain')?.status,'pass');assert.equal(b.checks.find(e=>e.id==='signature_nonce')?.status,'unknown');
 const c=await observe(request,{headerFailure:true});assert.ok(!c.checks.some(e=>e.id==='signature_deadline'));assert.equal(c.checks.find(e=>e.id==='signature_nonce')?.status,'unknown');assert.ok(c.checks.some(e=>e.id==='signature_scope'&&e.source==='eip712'));
});
test('DAI revocation is observed as zero mapped allowance and still requires a usable nonce/domain/signature',async()=>{
 const request=signature();body(request).message.allowed=false;const {checks}=await observe(request);const scope=checks.find(e=>e.id==='signature_scope')!;
 assert.equal(scope.status,'pass');assert.equal(scope.data?.declaredGrant,false);assert.equal(scope.data?.derivedAllowanceRaw,'0');assert.equal(checks.find(e=>e.id==='signature_validation')?.status,'unknown');assert.equal(checks.find(e=>e.id==='signature_validation')?.data?.consumptionExecuted,false);
});
test('ERC-3009 queries the signed payer/bytes32 nonce and retains recipient restriction without inventing allowance or nonce equality',async()=>{
 for(const kind of ['transfer','receive'] as const){const request=signature(kind);body(request).message.from=other;body(request).message.owner=spender;const {checks,calls}=await observe(request),scope=checks.find(e=>e.id==='signature_scope')!,state=checks.find(e=>e.id==='signature_nonce')!;
  assert.equal(state.status,'pass');assert.equal(state.data?.authorizationUsedOrCanceled,false);assert.equal(state.data?.nonceScope,'authorizer_bytes32');assert.equal(state.data?.owner,other);assert.equal(state.data?.nonce,nonce);assert.equal(state.data?.consumptionExecuted,false);
  assert.equal(scope.data?.recipientCommitted,true);assert.equal(scope.data?.actualTransferAmountCommitted,true);assert.equal(scope.data?.permissionKind,'single_authorization_transfer');assert.equal(scope.data?.relayerRestriction,kind==='receive'?'caller_must_be_recipient':'any_submitter');assert.equal(checks.find(e=>e.id==='signature_owner_binding')?.status,'warning');assert.ok(calls.some(c=>c.name==='authorizationState'&&c.args?.[0]===other&&c.args?.[1]===nonce));assert.ok(!calls.some(c=>c.name==='nonces'));assert.ok(calls.filter(c=>c.method==='eth_call').every(c=>c.params[1]==='0x2a'));
 }
});
test('ERC-3009 open validity window rejects both exact boundaries and reports invalid intervals explicitly',async()=>{
 for(const [after,before,expected,notYet,expired] of [['999','1001','pass',false,false],['1000','2000','warning',true,false],['900','1000','warning',false,true],['1001','1000','warning',true,true]] as const){
  const request=signature('transfer');Object.assign(body(request).message,{validAfter:after,validBefore:before});const {checks}=await observe(request),window=checks.find(e=>e.id==='signature_authorization_window')!;
  assert.equal(window.status,expected);assert.equal(window.data?.notYetValidAtObservedBlock,notYet);assert.equal(window.data?.expiredAtObservedBlock,expired);assert.equal(window.data?.invalidWindow,BigInt(after)>=BigInt(before));assert.equal(window.data?.validAtObservedBlock,expected==='pass');assert.equal(window.data?.blockHash,blockHash);
 }
 const absent=await observe(signature('transfer'),{headerFailure:true});assert.ok(!absent.checks.some(e=>e.id==='signature_authorization_window'));assert.equal(absent.checks.find(e=>e.id==='signature_nonce')?.status,'unknown');assert.ok(absent.checks.some(e=>e.id==='signature_scope'&&e.source==='eip712'));
});
test('ERC-3009 used-or-canceled and failed state reads remain distinct while independent domain facts survive',async()=>{
 const request=signature('receive'),used=await observe(request,{used:true}),missing=await observe(request,{authorizationFailure:true}),domainMissing=await observe(request,{domainFailure:true});
 assert.equal(used.checks.find(e=>e.id==='signature_nonce')?.status,'risk');assert.equal(used.checks.find(e=>e.id==='signature_nonce')?.data?.authorizationUsedOrCanceled,true);assert.match(used.checks.find(e=>e.id==='signature_nonce')!.detail,/used or canceled/);
 assert.equal(missing.checks.find(e=>e.id==='signature_nonce')?.status,'unknown');assert.equal(missing.checks.find(e=>e.id==='signature_domain')?.status,'pass');assert.equal(domainMissing.checks.find(e=>e.id==='signature_nonce')?.status,'pass');assert.equal(domainMissing.checks.find(e=>e.id==='signature_domain')?.status,'unknown');
 for(const result of [used,missing,domainMissing])assert.equal(result.checks.find(e=>e.id==='signature_validation')?.data?.cryptographicSignerVerified,false);
});
test('unsupported signed variants and unconfigured networks never substitute unrelated getters or execute a signature',async()=>{
 const custom=signature('transfer');body(custom).types.TransferWithAuthorization.push({name:'custom',type:'bool'});body(custom).message.custom=true;const result=await observe(custom);assert.equal(result.checks.find(e=>e.id==='signature_nonce')?.status,'unknown');assert.ok(!result.calls.some(c=>c.name==='nonces'||c.name==='authorizationState'));assert.ok(!result.checks.some(e=>e.id==='signature_scope'));
 const previous=globalThis.fetch;let fetched=false;try{globalThis.fetch=async()=>{fetched=true;throw Error('No network is allowed');};const checks=await signatureChainEvidence(signature('receive'),{...config,rpc:{}});assert.equal(checks.find(e=>e.id==='signature_nonce')?.status,'unknown');assert.equal(fetched,false);}finally{globalThis.fetch=previous;}
});
