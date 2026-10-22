import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeAbiParameters,getTypesForEIP712Domain,hashDomain,parseAbi,parseAbiParameters} from 'viem';
import {signatureChainEvidence} from '../src/security/signatures.js';
import {assetEvidence} from '../src/security/assets.js';
import {protocolEvidence} from '../src/security/protocols.js';
import {decodeRequest} from '../src/security/decode.js';
import type {SecurityRequest} from '../src/security/types.js';
import type {SecurityConfig} from '../src/security/config.js';

const owner='0x1111111111111111111111111111111111111111',spender='0x2222222222222222222222222222222222222222',token='0x3333333333333333333333333333333333333333',other='0x4444444444444444444444444444444444444444';
const permit2='0x000000000022D473030F116dDEE9F6B43aC78BA3',url='http://127.0.0.1:19998';
const config:SecurityConfig={apiKey:'',model:'fixture',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{31337:url}};
const callAbi=parseAbi(['function DOMAIN_SEPARATOR() view returns(bytes32)','function nonces(address) view returns(uint256)','function nonces(uint256) view returns(uint256)','function nonceBitmap(address,uint256) view returns(uint256)','function allowance(address,address) view returns(uint256)','function allowance(address,address,address) view returns(uint160,uint48,uint48)','function symbol() view returns(string)','function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)','function supportsInterface(bytes4) view returns(bool)','function ownerOf(uint256) view returns(address)','function getApproved(uint256) view returns(address)','function isApprovedForAll(address,address) view returns(bool)','function owner() view returns(address)','function paused() view returns(bool)']);
type Signature=Extract<SecurityRequest,{kind:'signature'}>;
function request(protocol:'erc2612'|'erc4494'|'permit2_allowance'|'permit2_transfer'='erc2612'):Signature {
 const nft=protocol==='erc4494',p2=protocol.startsWith('permit2');
 const data:any={domain:{name:p2?'Permit2':'Fixture',chainId:31337,verifyingContract:p2?permit2:token},types:{},primaryType:p2?protocol==='permit2_allowance'?'PermitSingle':'PermitTransferFrom':'Permit',message:{}};
 if(!p2){data.types.Permit=nft?[{name:'spender',type:'address'},{name:'tokenId',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]:[{name:'owner',type:'address'},{name:'spender',type:'address'},{name:'value',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}];data.message=nft?{spender,tokenId:'0',nonce:'0',deadline:'2000000000'}:{owner,spender,value:'50',nonce:'0',deadline:'2000000000'};}
 else if(protocol==='permit2_allowance'){data.types.PermitDetails=[{name:'token',type:'address'},{name:'amount',type:'uint160'},{name:'expiration',type:'uint48'},{name:'nonce',type:'uint48'}];data.types.PermitSingle=[{name:'details',type:'PermitDetails'},{name:'spender',type:'address'},{name:'sigDeadline',type:'uint256'}];data.message={details:{token,amount:'150',expiration:'2000000000',nonce:'0'},spender,sigDeadline:'2000000000'};}
 else{data.types.TokenPermissions=[{name:'token',type:'address'},{name:'amount',type:'uint256'}];data.types.PermitTransferFrom=[{name:'permitted',type:'TokenPermissions'},{name:'spender',type:'address'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}];data.message={permitted:{token,amount:'150'},spender,nonce:'257',deadline:'2000000000'};}
 return {kind:'signature',chainId:31337,signature:{from:owner,method:'eth_signTypedData_v4',data}};
}
type Options={nft?:boolean;ownerCode?:string;nftOwner?:`0x${string}`;missingMetadata?:boolean;domainFailure?:boolean;usedBitmap?:boolean;nonce?:bigint;failedToken?:string};
async function withFixture(req:Signature,options:Options,run:(fixture:{fetcher:typeof fetch;calls:{method:string;params:any[];name?:string;args?:readonly unknown[]}[]})=>Promise<void>){
 const previous=globalThis.fetch,calls:{method:string;params:any[];name?:string;args?:readonly unknown[]}[]=[];
 const typed=req.signature.data as any,domainHash=hashDomain({domain:typed.domain,types:{EIP712Domain:getTypesForEIP712Domain({domain:typed.domain})}});
 const fetcher:typeof fetch=async(input,init)=>{
  assert.equal(new URL(typeof input==='string'?input:String(input)).href,new URL(url).href,'Fixtures must never use a real network endpoint');
  const rpc=JSON.parse(String(init?.body)),entry:{method:string;params:any[];name?:string;args?:readonly unknown[]}={method:rpc.method,params:rpc.params};calls.push(entry);let result:any;
  try{
   if(rpc.method==='eth_chainId')result='0x7a69';
   else if(rpc.method==='eth_blockNumber')result='0x20';
   else if(rpc.method==='eth_getBlockByNumber')result={number:'0x20',timestamp:'0x3e8',transactions:[]};
   else if(rpc.method==='eth_getCode')result=rpc.params[0].toLowerCase()===owner.toLowerCase()?options.ownerCode??'0x':'0x6000';
   else if(rpc.method==='eth_getStorageAt')result=`0x${'0'.repeat(64)}`;
   else if(rpc.method==='eth_call'){
    const decoded=decodeFunctionData({abi:callAbi,data:rpc.params[0].data});entry.name=decoded.functionName;entry.args=decoded.args;
    const args=decoded.args as readonly any[]??[];
    if(entry.name==='DOMAIN_SEPARATOR'){if(options.domainFailure)throw Error('domain unavailable');result=encodeAbiParameters(parseAbiParameters('bytes32'),[domainHash]);}
    else if(entry.name==='nonces')result=encodeAbiParameters(parseAbiParameters('uint256'),[options.nonce??0n]);
    else if(entry.name==='nonceBitmap')result=encodeAbiParameters(parseAbiParameters('uint256'),[options.usedBitmap?2n:0n]);
    else if(entry.name==='allowance'&&args.length===3){if(args[1].toLowerCase()===options.failedToken?.toLowerCase())throw Error('token unavailable');result=encodeAbiParameters(parseAbiParameters('uint160,uint48,uint48'),[7n,2000000000,options.nonce===undefined?0:Number(options.nonce)]);}
    else if(entry.name==='allowance')result=encodeAbiParameters(parseAbiParameters('uint256'),[args[1].toLowerCase()===permit2.toLowerCase()?80n:10n]);
    else if(entry.name==='symbol'){if(options.missingMetadata)throw Error('symbol unavailable');result=encodeAbiParameters(parseAbiParameters('string'),['FIX']);}
    else if(entry.name==='decimals'){if(options.missingMetadata)throw Error('decimals unavailable');result=encodeAbiParameters(parseAbiParameters('uint8'),[18]);}
    else if(entry.name==='balanceOf')result=encodeAbiParameters(parseAbiParameters('uint256'),[100n]);
    else if(entry.name==='supportsInterface')result=encodeAbiParameters(parseAbiParameters('bool'),[!!options.nft&&['0x80ac58cd','0x5604e225'].includes(args[0])]);
    else if(entry.name==='ownerOf')result=encodeAbiParameters(parseAbiParameters('address'),[options.nftOwner??owner]);
    else if(entry.name==='getApproved')result=encodeAbiParameters(parseAbiParameters('address'),[other]);
    else if(entry.name==='isApprovedForAll')result=encodeAbiParameters(parseAbiParameters('bool'),[false]);
    else if(entry.name==='owner')result=encodeAbiParameters(parseAbiParameters('address'),[other]);
    else if(entry.name==='paused')result=encodeAbiParameters(parseAbiParameters('bool'),[false]);
    else throw Error('Unexpected read');
   }else throw Error(`Unexpected method ${rpc.method}`);
   return new Response(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result}));
  }catch{return new Response(JSON.stringify({jsonrpc:'2.0',id:rpc.id,error:{code:-32000,message:'fixture read unavailable'}}));}
 };
 try{globalThis.fetch=fetcher;await run({fetcher,calls});for(const entry of calls){assert.ok(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getCode','eth_getStorageAt','eth_call'].includes(entry.method));if(['eth_getCode','eth_call'].includes(entry.method))assert.equal(entry.params[1],'0x20');if(entry.method==='eth_getStorageAt')assert.equal(entry.params[2],'0x20');}}
 finally{globalThis.fetch=previous;}
}

test('unsigned ERC2612 evidence binds domain/owner/nonce and computes a conditional same-token balance bound without claiming a valid signature',async()=>{
 const req=request();await withFixture(req,{},async()=>{
  const signature=await signatureChainEvidence(req,config),assets=await assetEvidence(req,decodeRequest(req),config);
  for(const id of ['signature_domain','signature_nonce','signature_owner_binding'])assert.equal(signature.find(e=>e.id===id)?.status,'pass',id);
  assert.equal(signature.find(e=>e.id==='signature_validation')?.status,'unknown');assert.equal(signature.find(e=>e.id==='signature_signer_account')?.data?.cryptographicSignerVerified,false);
  const exposure=assets.find(e=>e.id==='signature_exposure')!;assert.equal(exposure.status,'pass');assert.equal(exposure.data?.snapshotBalanceBoundRaw,'50');assert.equal(exposure.data?.existingAllowanceRaw,'10');assert.equal(exposure.data?.conditionalOnValidPermit,true);assert.equal(exposure.data?.consumptionExecuted,false);
 });
});
test('Permit2 separates outer ERC20 approval from inner spender allowance and ignores unsigned owner and recipient metadata',async()=>{
 const req=request('permit2_allowance');(req.signature.data as any).message.owner=other;(req.signature.data as any).message.recipient=other;
 await withFixture(req,{},async({calls})=>{
  const op=decodeRequest(req),signature=await signatureChainEvidence(req,config),assets=await assetEvidence(req,op,config);
  assert.equal(op.fields.owner,undefined);assert.equal(op.fields.recipient,undefined);
  assert.equal(signature.find(e=>e.id==='signature_domain')?.status,'pass');assert.equal(signature.find(e=>e.id==='signature_protocol')?.data?.identityVerified,false);
  const inner=signature.find(e=>e.id==='signature_nonce_0')!;assert.equal(inner.data?.owner,owner);assert.equal(inner.data?.amount,'7');assert.equal(inner.data?.expiration,'2000000000');
  const outer=assets.find(e=>e.id==='existing_allowance')!;assert.equal(String(outer.data?.spender).toLowerCase(),permit2.toLowerCase());assert.equal(outer.data?.allowanceLayer,'erc20_to_verifying_contract');assert.equal(outer.data?.amount,'80');
  assert.equal(assets.find(e=>e.id==='signature_exposure')?.data?.snapshotBalanceBoundRaw,'80');
  assert.ok(calls.some(e=>e.name==='allowance'&&e.args?.length===2&&String(e.args[1]).toLowerCase()===permit2.toLowerCase()));
  assert.equal(signature.find(e=>e.id==='signature_scope')?.data?.recipientCommitted,false);
 });
});
test('NFT Permit uses tokenId nonce and observes interface/current ownership instead of treating NFT zero as a token amount',async()=>{
 const req=request('erc4494');await withFixture(req,{nft:true,nftOwner:other},async({calls})=>{
  const op=decodeRequest(req),facts=await signatureChainEvidence(req,config);
  assert.equal(op.tokenStandard,'erc721');assert.equal(op.fields.tokenId,'0');assert.equal(facts.find(e=>e.id==='signature_nonce')?.data?.nonceScope,'token_id');
  assert.ok(calls.some(e=>e.name==='nonces'&&typeof e.args?.[0]==='bigint'&&e.args[0]===0n));
  assert.equal(facts.find(e=>e.id==='signature_nft_interface')?.status,'pass');assert.equal(facts.find(e=>e.id==='signature_nft_state')?.status,'warning');assert.equal(facts.find(e=>e.id==='signature_nft_state')?.data?.ownerMatchesSigner,false);
  assert.equal(facts.find(e=>e.id==='signature_validation')?.status,'unknown');
 });
});
test('contract and delegated signer code does not fabricate ERC1271 support or call isValidSignature with a dummy signature',async()=>{
 for(const ownerCode of ['0x6000',`0xef0100${other.slice(2)}`]){const req=request();await withFixture(req,{ownerCode},async({calls})=>{
  const facts=await signatureChainEvidence(req,config),account=facts.find(e=>e.id==='signature_signer_account')!;
  assert.equal(account.status,'warning');assert.equal(account.data?.accountKind,ownerCode.startsWith('0xef')?'delegated':'contract');assert.equal(account.data?.erc1271Validation,'not_attempted');assert.equal(account.data?.cryptographicSignerVerified,false);
  assert.ok(!calls.some(e=>e.method==='eth_call'&&e.params[0].data.startsWith('0x1626ba7e')));assert.equal(facts.find(e=>e.id==='signature_validation')?.status,'unknown');
 });}
});
test('optional metadata failure retains raw balance/allowance and never invents decimals or dollar exposure',async()=>{
 const req=request();await withFixture(req,{missingMetadata:true},async()=>{
  const assets=await assetEvidence(req,decodeRequest(req),config);assert.equal(assets.find(e=>e.id==='token_identity')?.status,'unknown');assert.equal(assets.find(e=>e.id==='asset_balance_0')?.data?.balanceRaw,'100');assert.equal(assets.find(e=>e.id==='existing_allowance')?.status,'pass');
  const exposure=assets.find(e=>e.id==='signature_exposure')!;assert.equal(exposure.data?.snapshotBalanceBoundRaw,'50');assert.equal(exposure.data?.snapshotBalanceBoundFormatted,undefined);assert.equal(exposure.data?.decimals,undefined);assert.equal(exposure.data?.units,'token_raw');
 });
});
test('independent provider network matching never upgrades unknown signing network; differences are contextual warnings',async()=>{
 for(const providerChain of [31337,1]){const req=request('permit2_allowance');req.chainId=0;(req.signature as any).providerContext={chainId:providerChain,observedAt:'2026-10-22T00:00:00.000Z',source:'snap-provider'};
  await withFixture(req,{},async()=>{const facts=await signatureChainEvidence(req,config),network=facts.find(e=>e.id==='signature_network_context')!;assert.equal(network.status,'unknown');assert.equal(network.data?.signingNetworkVerified,false);assert.equal(network.data?.readChainSource,'domain_claim');assert.deepEqual(network.data?.providerContext,(req.signature as any).providerContext);assert.equal(facts.some(e=>e.id==='signature_provider_difference'&&e.status==='warning'),providerChain!==31337);});
 }
});
test('custom verifying contract can imitate Permit2 domain but does not gain canonical identity',async()=>{
 const req=request('permit2_allowance');(req.signature.data as any).domain.verifyingContract=other;await withFixture(req,{},async()=>{const facts=await signatureChainEvidence(req,config);assert.equal(facts.find(e=>e.id==='signature_domain')?.status,'pass');assert.equal(facts.find(e=>e.id==='signature_protocol')?.status,'warning');assert.equal(facts.find(e=>e.id==='signature_protocol')?.data?.publishedAddressMatch,false);assert.equal(facts.find(e=>e.id==='signature_protocol')?.data?.identityVerified,false);});
});
test('Permit2 bitmap and batch failures preserve nonce scope and partial adverse observations; repeated tokens are not assigned an invented aggregate cap',async()=>{
 const single=request('permit2_transfer');await withFixture(single,{usedBitmap:true},async()=>{const facts=await signatureChainEvidence(single,config);assert.equal(facts.find(e=>e.id==='signature_nonce')?.status,'risk');assert.equal(facts.find(e=>e.id==='signature_scope')?.data?.permissionKind,'single_nonce_transfer');});
 const req=request('permit2_allowance'),typed=req.signature.data as any;typed.primaryType='PermitBatch';typed.types.PermitBatch=[{name:'details',type:'PermitDetails[]'},{name:'spender',type:'address'},{name:'sigDeadline',type:'uint256'}];typed.message.details=[typed.message.details,{token:other,amount:'50',expiration:'2000000000',nonce:'0'}];
 await withFixture(req,{nonce:1n,failedToken:other},async()=>{const facts=await signatureChainEvidence(req,config);assert.equal(facts.find(e=>e.id==='signature_nonce_0')?.status,'risk');assert.equal(facts.find(e=>e.id==='signature_nonce_1')?.status,'unknown');assert.equal(new Set(facts.map(e=>e.id)).size,facts.length);});
 typed.message.details[1].token=token;await withFixture(req,{},async()=>{const assets=await assetEvidence(req,decodeRequest(req),config),exposure=assets.find(e=>e.id==='signature_exposure')!;assert.equal(exposure.status,'unknown');assert.equal(exposure.data?.snapshotBalanceBoundRaw,undefined);assert.ok((exposure.data?.missing as string[]).includes('unambiguous_declared_cap'));});
});
test('known signed spender/assets get bounded read-only code and control observations',async()=>{
 const req=request('permit2_allowance');await withFixture(req,{},async({fetcher})=>{
  const facts=await protocolEvidence(req,decodeRequest(req),config,fetcher);
  for(const id of ['signature_spender_controls','signature_token_controls_0']){const item=facts.find(e=>e.id===id)!;assert.ok(item);assert.equal(item.data?.identityVerified,false);assert.equal(item.data?.blockNumber,'32');assert.equal(item.data?.hasCode,true);assert.ok(item.data?.codeHash);}
 });
});
test('similar primary names with a different signed type graph do not produce Permit nonce/allowance authority evidence',async()=>{
 const req=request('permit2_allowance');(req.signature.data as any).types.PermitDetails[1].type='uint256';await withFixture(req,{},async({calls})=>{
  const op=decodeRequest(req),facts=await signatureChainEvidence(req,config),assets=await assetEvidence(req,op,config);
  assert.equal(op.decoded,false);assert.equal(op.category,'typed_signature');assert.equal(facts.find(e=>e.id==='signature_nonce')?.status,'unknown');assert.ok(!facts.some(e=>e.id==='signature_scope'));assert.equal(assets.find(e=>e.id==='signature_assets')?.status,'unknown');assert.ok(!calls.some(e=>['allowance','nonces','nonceBitmap'].includes(e.name??'')));
 });
});
test('standard zero-cap Permit revocations and NFT zero spender do not claim a new grant',async()=>{
 for(const protocol of ['erc2612','erc4494','permit2_allowance'] as const){const req=request(protocol),typed=req.signature.data as any;if(protocol==='erc2612')typed.message.value='0';else if(protocol==='erc4494')typed.message.spender='0x0000000000000000000000000000000000000000';else typed.message.details.amount='0';await withFixture(req,{nft:protocol==='erc4494'},async()=>{assert.equal(decodeRequest(req).addsPermission,false);const facts=await signatureChainEvidence(req,config);assert.equal(facts.find(e=>e.id==='signature_scope')?.data?.declaredGrant,false);assert.equal(facts.find(e=>e.id==='signature_validation')?.status,'unknown');});}
});
test('NFT standard claims in an ERC20 Permit2 message remain unresolved and never produce a fungible exposure amount',async()=>{
 const req=request('permit2_allowance');await withFixture(req,{nft:true},async({calls})=>{const assets=await assetEvidence(req,decodeRequest(req),config);assert.equal(assets.find(e=>e.id==='asset_standard_mismatch_0')?.status,'unknown');assert.ok(!assets.some(e=>e.id==='signature_exposure'));assert.ok(calls.some(e=>e.name==='isApprovedForAll'&&String(e.args?.[1]).toLowerCase()===permit2.toLowerCase()));});
});
