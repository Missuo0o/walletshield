import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeAbiParameters,encodeFunctionData,hashTypedData,maxUint256,parseAbi,parseAbiParameters,zeroAddress} from 'viem';
import {decodeRequest} from '../src/security/decode.js';
import {assetEvidence} from '../src/security/assets.js';
import {assess} from '../src/security/rules.js';
import {signatureStructure} from '../src/security/signatures.js';
import {evidence} from '../src/security/evidence.js';
import type {SecurityRequest} from '../src/security/types.js';
import type {SecurityConfig} from '../src/security/config.js';

const owner='0x1111111111111111111111111111111111111111',spender='0x2222222222222222222222222222222222222222',token='0x3333333333333333333333333333333333333333',caller='0x4444444444444444444444444444444444444444',permit2='0x000000000022D473030F116dDEE9F6B43aC78BA3';
const url='http://127.0.0.1:19996',blockHash=`0x${'ab'.repeat(32)}`;
const config:SecurityConfig={apiKey:'',model:'fixture',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{31337:url}};
type Signature=Extract<SecurityRequest,{kind:'signature'}>;
type Transaction=Extract<SecurityRequest,{kind:'transaction'}>;
function signed(protocol:'erc2612'|'erc4494'|'permit2_allowance'|'permit2_transfer'='erc2612',batch=false):Signature{
 const data:any={domain:{name:protocol.startsWith('permit2')?'Permit2':'Fixture',chainId:31337,verifyingContract:protocol.startsWith('permit2')?permit2:token},types:{},message:{},primaryType:'Permit'};
 if(protocol==='erc2612'){
  data.types.Permit=[{name:'owner',type:'address'},{name:'spender',type:'address'},{name:'value',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}];
  data.message={owner,spender,value:String(maxUint256),nonce:'0',deadline:'2000000000'};
 }else if(protocol==='erc4494'){
  data.types.Permit=[{name:'spender',type:'address'},{name:'tokenId',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}];
  data.message={spender,tokenId:'0',nonce:'0',deadline:'2000000000'};
 }else if(protocol==='permit2_allowance'){
  data.types.PermitDetails=[{name:'token',type:'address'},{name:'amount',type:'uint160'},{name:'expiration',type:'uint48'},{name:'nonce',type:'uint48'}];
  data.primaryType=batch?'PermitBatch':'PermitSingle';data.types[data.primaryType]=[{name:'details',type:`PermitDetails${batch?'[]':''}`},{name:'spender',type:'address'},{name:'sigDeadline',type:'uint256'}];
  const detail={token,amount:String(2n**160n-1n),expiration:'2000000000',nonce:'0'};data.message={details:batch?[detail]:detail,spender,sigDeadline:'2000000000'};
 }else{
  data.types.TokenPermissions=[{name:'token',type:'address'},{name:'amount',type:'uint256'}];
  data.primaryType=batch?'PermitBatchTransferFrom':'PermitTransferFrom';data.types[data.primaryType]=[{name:'permitted',type:`TokenPermissions${batch?'[]':''}`},{name:'spender',type:'address'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}];
  const permitted={token,amount:String(maxUint256)};data.message={permitted:batch?[permitted]:permitted,spender,nonce:'257',deadline:'2000000000'};
 }
 return {kind:'signature',chainId:31337,signature:{from:owner,method:'eth_signTypedData_v4',data}};
}
const spelling=(value:string,kind:'leading'|'hex')=>kind==='leading'?`000${value}`:`0x${BigInt(value).toString(16)}`;
function rewriteIntegers(value:any,kind:'leading'|'hex'):void{
 for(const[key,item]of Object.entries(value))if(typeof item==='string'&&/^\d+$/.test(item))value[key]=spelling(item,kind);else if(item&&typeof item==='object')rewriteIntegers(item,kind);
}
test('ERC-2612 integer spellings with the same digest retain identical unlimited authority and exact canonical fields without changing the request',()=>{
 const base=signed(),reference=decodeRequest(base),digest=hashTypedData(base.signature.data as any);
 for(const kind of ['leading','hex'] as const){const req=structuredClone(base);rewriteIntegers((req.signature.data as any).message,kind);const before=JSON.stringify(req),op=decodeRequest(req);
  assert.equal(signatureStructure(req)[0].status,'pass');assert.equal(hashTypedData(req.signature.data as any),digest);assert.equal(JSON.stringify(req),before);
  assert.deepEqual(op,reference);assert.equal(op.fields.unlimited,true);assert.equal(op.fields.value,String(maxUint256));
  assert.equal(assess(req,[]).checks.find(e=>e.id==='permission_scope')?.status,'risk');
 }
});
test('ERC-4494 normalizes token ID zero and nonce while unsigned owner/value properties never create fungible authority',()=>{
 const base=signed('erc4494'),reference=decodeRequest(base),digest=hashTypedData(base.signature.data as any);
 for(const kind of ['leading','hex'] as const){const req=structuredClone(base),data=req.signature.data as any;rewriteIntegers(data.message,kind);data.message.value=String(maxUint256);data.message.owner=caller;
  const op=decodeRequest(req);assert.equal(hashTypedData(data),digest);assert.deepEqual(op,reference);assert.equal(op.fields.tokenId,'0');assert.equal(op.fields.value,undefined);assert.equal(op.fields.owner,undefined);assert.equal(op.fields.unlimited,undefined);assert.equal(op.addsPermission,true);
 }
});
test('all four supported Permit2 shapes normalize each committed uint and ignore unsigned nested/top-level metadata',()=>{
 for(const protocol of ['permit2_allowance','permit2_transfer'] as const)for(const batch of [false,true]){
  const base=signed(protocol,batch),reference=decodeRequest(base),digest=hashTypedData(base.signature.data as any);
  for(const kind of ['leading','hex'] as const){const req=structuredClone(base),data=req.signature.data as any;rewriteIntegers(data.message,kind);data.message.owner=caller;data.message.recipient=caller;data.message.value=String(maxUint256);
   const details=data.message.details??data.message.permitted;for(const detail of Array.isArray(details)?details:[details]){detail.owner=caller;detail.spender=caller;if(protocol==='permit2_transfer'){detail.expiration='123';detail.nonce='999';}}
   const op=decodeRequest(req);assert.equal(hashTypedData(data),digest);assert.equal(signatureStructure(req)[0].status,'pass');assert.deepEqual(op,reference);assert.equal(op.category,'permit2_signature');assert.equal(op.fields.unlimited,true);assert.equal(op.addsPermission,true);
   assert.equal(op.fields.owner,undefined);assert.equal(op.fields.recipient,undefined);if(protocol==='permit2_transfer'){assert.deepEqual(op.fields.expirations,['']);assert.deepEqual(op.fields.nonces,['']);}
  }
 }
});
test('invalid unsigned ranges, unsafe integers and over-limit Permit2 batches stay unresolved instead of throwing or gaining authority',()=>{
 for(const value of ['-1',String(2n**256n),Number.MAX_SAFE_INTEGER+1,'invalid']){const req=signed();(req.signature.data as any).message.value=value;assert.doesNotThrow(()=>decodeRequest(req));assert.equal(decodeRequest(req).decoded,false);}
 const req=signed('permit2_allowance',true),data=req.signature.data as any;data.message.details=Array.from({length:65},()=>({...data.message.details[0]}));const op=decodeRequest(req);assert.equal(op.decoded,false);assert.equal(op.fields.declaredAssetCount,'65');
});

const callAbi=parseAbi(['function supportsInterface(bytes4) view returns(bool)','function symbol() view returns(string)','function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function allowance(address,address,address) view returns(uint160,uint48,uint48)','function approve(address,address,uint160,uint48)','function transferFrom(address,address,uint256)','function transfer(address,uint256)','function approve(address,uint256)','function setApprovalForAll(address,bool)','function safeTransferFrom(address,address,uint256)']);
type ReadCall={address:string;name:string;args:readonly unknown[];block:string};
async function assetsFixture(req:SecurityRequest,options:{outerFailure?:boolean;innerFailure?:boolean;codeFailure?:boolean;headerFailure?:boolean}={}){
 const previous=globalThis.fetch,calls:ReadCall[]=[];
 globalThis.fetch=async(input,init)=>{
  assert.equal(new URL(String(input)).href,new URL(url).href,'Only the offline fixture endpoint may be used');const rpc=JSON.parse(String(init?.body));let result:unknown;
  try{
   if(rpc.method==='eth_chainId')result='0x7a69';else if(rpc.method==='eth_blockNumber')result='0x2a';
   else if(rpc.method==='eth_getBlockByNumber'){if(options.headerFailure)throw Error('Header unavailable');result={number:'0x2a',hash:blockHash,timestamp:'0x3e8',transactions:[]};}
   else if(rpc.method==='eth_getCode'){if(options.codeFailure)throw Error('Code unavailable');result='0x6000';}
   else if(rpc.method==='eth_call'){
    const decoded=decodeFunctionData({abi:callAbi,data:rpc.params[0].data}),args=decoded.args??[];calls.push({address:rpc.params[0].to,name:decoded.functionName,args,block:rpc.params[1]});
    if(decoded.functionName==='supportsInterface')result=encodeAbiParameters(parseAbiParameters('bool'),[false]);
    else if(decoded.functionName==='symbol')result=encodeAbiParameters(parseAbiParameters('string'),['FIX']);
    else if(decoded.functionName==='decimals')result=encodeAbiParameters(parseAbiParameters('uint8'),[6]);
    else if(decoded.functionName==='balanceOf')result=encodeAbiParameters(parseAbiParameters('uint256'),[100n]);
    else if(decoded.functionName==='allowance'&&args.length===2){if(options.outerFailure)throw Error('Outer unavailable');result=encodeAbiParameters(parseAbiParameters('uint256'),[80n]);}
    else if(decoded.functionName==='allowance'&&args.length===3){if(options.innerFailure)throw Error('Inner unavailable');result=encodeAbiParameters(parseAbiParameters('uint160,uint48,uint48'),[7n,2000000000,3]);}
    else throw Error('Unexpected contract call');
   }else throw Error('Unexpected RPC');
   return new Response(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result}));
  }catch{return new Response(JSON.stringify({jsonrpc:'2.0',id:rpc.id,error:{code:-32000,message:'Fixture observation unavailable'}}));}
 };
 try{return {checks:await assetEvidence(req,decodeRequest(req),config),calls};}finally{globalThis.fetch=previous;}
}
const tx=(name:string,args:unknown[],to=token,from=owner):Transaction=>({kind:'transaction',chainId:31337,transaction:{from,to,data:encodeFunctionData({abi:callAbi,functionName:name as any,args:args as any})}});
test('on-chain Permit2 approval reads owner-to-verifier ERC20 and internal owner/token/final-spender allowances separately at one block',async()=>{
 const req=tx('approve',[token,spender,150n,2000000000],permit2),{checks,calls}=await assetsFixture(req),outer=checks.find(e=>e.id==='existing_allowance')!,inner=checks.find(e=>e.id==='permit2_allowance')!;
 assert.equal(outer.status,'pass');assert.equal(outer.data?.amount,'80');assert.equal(outer.data?.allowanceLayer,'erc20_to_verifying_contract');assert.equal(String(outer.data?.spender).toLowerCase(),permit2.toLowerCase());
 assert.equal(inner.status,'pass');assert.equal(inner.data?.amount,'7');assert.equal(inner.data?.expiration,'2000000000');assert.equal(inner.data?.nonce,'3');assert.equal(inner.data?.activeAtObservedBlock,true);assert.equal(inner.data?.allowanceLayer,'permit2_to_spender');assert.equal(inner.data?.identityVerified,false);
 assert.ok(calls.some(c=>c.name==='allowance'&&c.address.toLowerCase()===token.toLowerCase()&&c.args.length===2&&c.args[0]===owner&&String(c.args[1]).toLowerCase()===permit2.toLowerCase()));
 assert.ok(calls.some(c=>c.name==='allowance'&&c.address.toLowerCase()===permit2.toLowerCase()&&c.args.length===3&&c.args[0]===owner&&c.args[1]===token&&c.args[2]===spender));
 assert.ok(!calls.some(c=>c.name==='allowance'&&c.args.length===2&&c.args[1]===spender));assert.ok(calls.every(c=>c.block==='0x2a'));
 for(const check of [outer,inner]){assert.equal(check.data?.blockHash,blockHash);assert.equal(check.data?.blockNumber,'42');}
});
test('either Permit2 allowance layer may fail independently and absent header/code never fabricates an active authority',async()=>{
 const req=tx('approve',[token,spender,150n,2000000000],permit2);
 for(const options of [{outerFailure:true},{innerFailure:true},{codeFailure:true},{headerFailure:true}]){
  const {checks}=await assetsFixture(req,options),outer=checks.find(e=>e.id==='existing_allowance'),inner=checks.find(e=>e.id==='permit2_allowance')!;
  if(options.headerFailure){assert.equal(checks.find(e=>e.id==='token_identity')?.status,'unknown');assert.ok(!inner);assert.ok(!outer);continue;}
  assert.equal(inner.status,options.innerFailure?'unknown':'pass');
  if(options.outerFailure)assert.equal(checks.find(e=>e.id==='allowance_unavailable_0')?.status,'unknown');else assert.equal(outer?.status,'pass');
  if(options.codeFailure){assert.equal(checks.find(e=>e.id==='token_identity')?.status,'unknown');assert.equal(inner.data?.amount,'7');assert.equal(outer?.data?.amount,'80');}
 }
});
test('zero-address authority revocation is distinct from real zero-address transfers and NFT token ID zero',()=>{
 const nft=signed('erc4494');(nft.signature.data as any).message.spender=zeroAddress;
 const revocations:SecurityRequest[]=[nft,tx('approve',[zeroAddress,0n]),tx('setApprovalForAll',[zeroAddress,false]),tx('approve',[token,zeroAddress,0n,2000000000],permit2)];
 for(const req of revocations){const report=assess(req,[]);assert.ok(!report.checks.some(e=>e.id==='zero_recipient'));}
 for(const req of [{kind:'transaction',chainId:31337,transaction:{from:owner,to:zeroAddress,data:'0x',value:'0x1'}} as SecurityRequest,tx('transfer',[zeroAddress,1n]),tx('transferFrom',[owner,zeroAddress,0n]),tx('safeTransferFrom',[owner,zeroAddress,0n])])assert.equal(assess(req,[]).checks.find(e=>e.id==='zero_recipient')?.status,'risk');
 const tokenZero=assess(tx('approve',[spender,0n]),[evidence('token_identity','pass','NFT observation','fixture','rpc',{standard:'erc721'})]);assert.equal(tokenZero.operation.addsPermission,true);assert.equal(tokenZero.operation.label,'Single-NFT approval');assert.ok(!tokenZero.checks.some(e=>e.id==='over_balance'));
});
test('delegated ERC20 transfer checks the asset owner balance and never claims authority over future deposits',async()=>{
 const req=tx('transferFrom',[owner,spender,200n],token,caller),{checks,calls}=await assetsFixture(req),report=assess(req,checks),balance=calls.find(c=>c.name==='balanceOf')!;
 assert.equal(balance.args[0],owner);assert.notEqual(balance.args[0],caller);assert.equal(checks.find(e=>e.id==='token_identity')?.data?.owner,owner);
 assert.equal(report.operation.tokenStandard,'erc20');assert.equal(report.operation.addsPermission,undefined);assert.equal(report.checks.find(e=>e.id==='transfer_over_balance')?.status,'warning');assert.ok(!report.checks.some(e=>e.id==='over_balance'||e.id==='permission_scope'));
 assert.ok(!report.checks.some(e=>e.detail==='Future incoming amounts of this token may also be covered.'));
 const approval=assess(tx('approve',[spender,200n]),checks);assert.equal(approval.checks.find(e=>e.id==='over_balance')?.status,'warning');
 const nft=assess(req,[evidence('token_identity','pass','NFT observation','fixture','rpc',{standard:'erc721',balance:'100'})]);assert.equal(nft.operation.tokenStandard,'erc721');assert.ok(!nft.checks.some(e=>e.id==='transfer_over_balance'||e.id==='over_balance'));
});
