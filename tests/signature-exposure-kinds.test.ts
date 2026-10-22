import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeAbiParameters,maxUint256,parseAbi,parseAbiParameters} from 'viem';
import {decodeRequest} from '../src/security/decode.js';
import {assetEvidence} from '../src/security/assets.js';
import type {SecurityRequest} from '../src/security/types.js';
import type {SecurityConfig} from '../src/security/config.js';

const owner='0x1111111111111111111111111111111111111111',spender='0x2222222222222222222222222222222222222222',token='0x3333333333333333333333333333333333333333',permit2='0x000000000022D473030F116dDEE9F6B43aC78BA3',recipient='0x4444444444444444444444444444444444444444';
const url='https://rpc.fixture.invalid',hash=`0x${'cd'.repeat(32)}`;
const config:SecurityConfig={apiKey:'',model:'fixture',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{31337:url}};
type Signature=Extract<SecurityRequest,{kind:'signature'}>;
function request(kind:'dai'|'transfer'|'receive'|'permit2_transfer'|'permit2_allowance',amount='50',allowed=true):Signature{
 const p2=kind.startsWith('permit2'),data:any={domain:{name:p2?'Permit2':'Fixture',chainId:31337,verifyingContract:p2?permit2:token},types:{},primaryType:'Permit',message:{}};
 if(kind==='dai'){
  data.types.Permit=[{name:'holder',type:'address'},{name:'spender',type:'address'},{name:'nonce',type:'uint256'},{name:'expiry',type:'uint256'},{name:'allowed',type:'bool'}];data.message={holder:owner,spender,nonce:'0',expiry:'0',allowed};
 }else if(kind==='transfer'||kind==='receive'){
  data.primaryType=kind==='transfer'?'TransferWithAuthorization':'ReceiveWithAuthorization';data.types[data.primaryType]=[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'}];data.message={from:owner,to:recipient,value:amount,validAfter:'0',validBefore:'2000',nonce:`0x${'ab'.repeat(32)}`};
 }else if(kind==='permit2_allowance'){
  data.types.PermitDetails=[{name:'token',type:'address'},{name:'amount',type:'uint160'},{name:'expiration',type:'uint48'},{name:'nonce',type:'uint48'}];data.types.PermitSingle=[{name:'details',type:'PermitDetails'},{name:'spender',type:'address'},{name:'sigDeadline',type:'uint256'}];data.primaryType='PermitSingle';data.message={details:{token,amount,expiration:'2000',nonce:'0'},spender,sigDeadline:'2000'};
 }else{
  data.types.TokenPermissions=[{name:'token',type:'address'},{name:'amount',type:'uint256'}];data.types.PermitTransferFrom=[{name:'permitted',type:'TokenPermissions'},{name:'spender',type:'address'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}];data.primaryType='PermitTransferFrom';data.message={permitted:{token,amount},spender,nonce:'257',deadline:'2000'};
 }
 return {kind:'signature',chainId:31337,signature:{from:owner,method:'eth_signTypedData_v4',data}};
}
const abi=parseAbi(['function supportsInterface(bytes4) view returns(bool)','function symbol() view returns(string)','function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)']);
type Read={name:string;address:string;args:readonly unknown[];block:string};
type Options={balance?:bigint;allowance?:bigint;balanceFailure?:boolean;allowanceFailure?:boolean;decimalsFailure?:boolean};
async function observe(req:Signature,options:Options={}){
 const previous=globalThis.fetch,reads:Read[]=[];
 globalThis.fetch=async(input,init)=>{
  assert.equal(new URL(String(input)).href,new URL(url).href,'Only the offline fixture endpoint may be queried');assert.equal(init?.redirect,'error');const rpc=JSON.parse(String(init?.body));let result:unknown;
  try{
   if(rpc.method==='eth_chainId')result='0x7a69';else if(rpc.method==='eth_blockNumber')result='0x2a';else if(rpc.method==='eth_getBlockByNumber')result={number:'0x2a',hash,timestamp:'0x3e8',transactions:[]};else if(rpc.method==='eth_getCode')result='0x6000';
   else if(rpc.method==='eth_call'){
    const decoded=decodeFunctionData({abi,data:rpc.params[0].data});reads.push({name:decoded.functionName,address:rpc.params[0].to,args:decoded.args??[],block:rpc.params[1]});
    if(decoded.functionName==='supportsInterface')result=encodeAbiParameters(parseAbiParameters('bool'),[false]);
    else if(decoded.functionName==='symbol')result=encodeAbiParameters(parseAbiParameters('string'),['FIX']);
    else if(decoded.functionName==='decimals'){if(options.decimalsFailure)throw Error('No decimals');result=encodeAbiParameters(parseAbiParameters('uint8'),[6]);}
    else if(decoded.functionName==='balanceOf'){if(options.balanceFailure)throw Error('No balance');result=encodeAbiParameters(parseAbiParameters('uint256'),[options.balance??100n]);}
    else if(decoded.functionName==='allowance'){if(options.allowanceFailure)throw Error('No allowance');result=encodeAbiParameters(parseAbiParameters('uint256'),[options.allowance??80n]);}
    else throw Error('Unexpected view');
   }else throw Error('Unexpected RPC');
   return new Response(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result}));
  }catch{return new Response(JSON.stringify({jsonrpc:'2.0',id:rpc.id,error:{code:-32000,message:'Fixture unavailable'}}));}
 };
 try{const checks=await assetEvidence(req,decodeRequest(req),config),exposure=checks.find(e=>e.id==='signature_exposure');assert.ok(exposure);return {checks,exposure,reads};}finally{globalThis.fetch=previous;}
}
test('funded ERC-3009 commits an exact single-use amount with no standing allowance or partial-consumption claim',async()=>{
 for(const kind of ['transfer','receive'] as const){const {exposure,reads}=await observe(request(kind,'50')),data=exposure.data!;
  assert.equal(exposure.status,'pass');assert.equal(data.authorityKind,'single_nonce_transfer');assert.equal(data.exactAmountCommitted,true);assert.equal(data.partialConsumptionAllowed,false);assert.equal(data.declaredTransferAmountRaw,'50');assert.equal(data.balanceCoversDeclaredAmount,true);assert.equal(data.snapshotBalanceBoundRaw,'50');assert.equal(data.balanceRaw,'100');assert.equal(data.conditionalOnValidAuthorization,true);assert.equal(data.conditionalOnValidPermit,undefined);assert.equal(data.existingAllowanceRaw,undefined);assert.equal(data.consumptionExecuted,false);assert.equal(data.futureBalanceCovered,false);assert.equal(data.units,'token_raw');assert.equal(data.owner,owner);assert.equal(data.token,token);assert.ok(!reads.some(r=>r.name==='allowance'));
  assert.equal(data.blockNumber,'42');assert.equal(data.blockHash,hash);assert.ok(reads.every(r=>r.block==='0x2a'));assert.ok(reads.filter(r=>r.name==='balanceOf').every(r=>r.args[0]===owner));assert.match(exposure.detail,/not measured transferable value, price or future loss/);
 }
});
test('unfunded exact ERC-3009 amount cannot turn the smaller balance into a permitted partial transfer',async()=>{
 const {exposure}=await observe(request('transfer','150'),{balance:100n}),data=exposure.data!;
 assert.equal(exposure.status,'pass');assert.equal(data.declaredTransferAmountRaw,'150');assert.equal(data.balanceRaw,'100');assert.equal(data.balanceCoversDeclaredAmount,false);assert.equal(data.partialConsumptionAllowed,false);assert.equal(data.snapshotBalanceBoundRaw,undefined);assert.equal(data.snapshotBalanceBoundFormatted,undefined);assert.equal(data.consumptionExecuted,false);assert.match(exposure.detail,/no partial-transfer bound/);
 const zero=await observe(request('receive','0'),{balance:0n});assert.equal(zero.exposure.data?.balanceCoversDeclaredAmount,true);assert.equal(zero.exposure.data?.snapshotBalanceBoundRaw,'0');assert.equal(zero.exposure.data?.partialConsumptionAllowed,false);
});
test('missing ERC-3009 balance remains unknown rather than inventing insufficiency, units or a partial bound',async()=>{
 const {exposure}=await observe(request('transfer','50'),{balanceFailure:true}),data=exposure.data!;
 assert.equal(exposure.status,'unknown');assert.ok((data.missing as string[]).includes('balanceOf'));assert.equal(data.balanceRaw,undefined);assert.equal(data.balanceCoversDeclaredAmount,undefined);assert.equal(data.snapshotBalanceBoundRaw,undefined);assert.equal(data.declaredTransferAmountRaw,'50');assert.equal(data.partialConsumptionAllowed,false);
 const raw=await observe(request('transfer','50'),{decimalsFailure:true});assert.equal(raw.exposure.data?.snapshotBalanceBoundRaw,'50');assert.equal(raw.exposure.data?.snapshotBalanceBoundFormatted,undefined);assert.equal(raw.exposure.data?.decimals,undefined);
});
test('DAI allowed mapping is explicit: true derives maximum allowance while false derives zero revocation',async()=>{
 for(const allowed of [true,false]){const {exposure,reads}=await observe(request('dai','1',allowed),{allowance:0n}),data=exposure.data!;
  assert.equal(exposure.status,'pass');assert.equal(data.authorityKind,'allowance');assert.equal(data.exactAmountCommitted,false);assert.equal(data.partialConsumptionAllowed,true);assert.equal(data.capSource,'derived_from_dai_allowed_not_a_signed_amount');assert.equal(data.declaredCapRaw,allowed?String(maxUint256):'0');assert.equal(data.snapshotBalanceBoundRaw,allowed?'100':'0');assert.equal(data.existingAllowanceRaw,'0');assert.equal(data.declaredTransferAmountRaw,undefined);assert.equal(data.balanceCoversDeclaredAmount,undefined);assert.equal(data.conditionalOnValidPermit,true);assert.equal(data.consumptionExecuted,false);
  assert.ok(reads.some(r=>r.name==='allowance'&&r.address===token&&r.args[0]===owner&&r.args[1]===spender));
 }
});
test('Permit2 transfer cap is single-use and partially consumable, while Permit2 allowance remains standing authority',async()=>{
 for(const kind of ['permit2_transfer','permit2_allowance'] as const){const {exposure,reads}=await observe(request(kind,'150'),{balance:100n,allowance:80n}),data=exposure.data!;
  assert.equal(exposure.status,'pass');assert.equal(data.authorityKind,kind==='permit2_transfer'?'single_nonce_transfer':'allowance');assert.equal(data.exactAmountCommitted,false);assert.equal(data.partialConsumptionAllowed,true);assert.equal(data.declaredCapRaw,'150');assert.equal(data.snapshotBalanceBoundRaw,'80');assert.equal(data.existingAllowanceRaw,'80');assert.equal(data.declaredTransferAmountRaw,undefined);assert.equal(data.balanceCoversDeclaredAmount,undefined);assert.equal(data.conditionalOnValidPermit,true);assert.equal(data.conditionalOnValidAuthorization,true);assert.equal(data.futureBalanceCovered,false);
  const allowance=reads.find(r=>r.name==='allowance')!;assert.equal(allowance.address,token);assert.equal(allowance.args[0],owner);assert.equal(String(allowance.args[1]).toLowerCase(),permit2.toLowerCase());assert.ok(reads.every(r=>r.block==='0x2a'));
 }
});
test('missing Permit2 underlying allowance cannot be replaced by current balance or the signed cap',async()=>{
 const {exposure}=await observe(request('permit2_transfer','150'),{allowanceFailure:true}),data=exposure.data!;
 assert.equal(exposure.status,'unknown');assert.equal(data.authorityKind,'single_nonce_transfer');assert.equal(data.balanceRaw,'100');assert.equal(data.declaredCapRaw,'150');assert.ok((data.missing as string[]).includes('erc20_allowance_to_verifier'));assert.equal(data.snapshotBalanceBoundRaw,undefined);assert.equal(data.existingAllowanceRaw,undefined);assert.equal(data.exactAmountCommitted,false);
});
