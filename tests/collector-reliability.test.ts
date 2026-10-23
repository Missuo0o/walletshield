import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeAbiParameters,getTypesForEIP712Domain,hashDomain,parseAbi,parseAbiParameters} from 'viem';
import {collector} from '../src/security/providers.js';
import {signatureChainEvidence} from '../src/security/signatures.js';
import {assetEvidence} from '../src/security/assets.js';
import {protocolEvidence} from '../src/security/protocols.js';
import {simulateRequest,type ForkFactory} from '../src/security/simulation.js';
import {decodeRequest} from '../src/security/decode.js';
import {readBoundedText,snapshotMetadata,validateAccountCode} from '../src/security/evidence.js';
import type {SecurityRequest,Operation} from '../src/security/types.js';
import type {SecurityConfig} from '../src/security/config.js';

const owner='0x1111111111111111111111111111111111111111',target='0x2222222222222222222222222222222222222222',delegate='0x3333333333333333333333333333333333333333';
const url='http://127.0.0.1:19997',blockHash=`0x${'ab'.repeat(32)}`;
const config:SecurityConfig={apiKey:'',model:'fixture',aiEnabled:false,lookups:false,goPlusToken:'',forkEnabled:false,rpc:{31337:url}};
const native=():Extract<SecurityRequest,{kind:'transaction'}>=>({kind:'transaction',chainId:31337,transaction:{from:owner,to:target,data:'0x',value:'0x1',nonce:'0x2',gasPrice:'0x10'}});
const abi=parseAbi(['function DOMAIN_SEPARATOR() view returns(bytes32)','function supportsInterface(bytes4) view returns(bool)','function ownerOf(uint256) view returns(address)','function getApproved(uint256) view returns(address)','function isApprovedForAll(address,address) view returns(bool)','function owner() view returns(address)','function paused() view returns(bool)']);
type Call={method:string;params:any[]};
type Handler=(call:Call)=>unknown;
const header={number:'0x2a',timestamp:'0x3e8',hash:blockHash,baseFeePerGas:'0x20',transactions:[]};
function fixture(handler:Handler=()=>undefined){
 const calls:Call[]=[];
 const fetcher:typeof fetch=async(input,init)=>{
  assert.equal(new URL(String(input)).href,new URL(url).href,'Only the in-memory RPC fixture may be used');
  const call=JSON.parse(String(init?.body));calls.push(call);
  try{
   let result=handler(call);
   if(result===undefined)result=call.method==='eth_chainId'?'0x7a69':call.method==='eth_blockNumber'?'0x2a':call.method==='eth_getBlockByNumber'?header:call.method==='eth_getBalance'?'0x64':call.method==='eth_getCode'?'0x':call.method==='eth_getTransactionCount'?'0x2':call.method==='eth_getStorageAt'?`0x${'0'.repeat(64)}`:'0x';
   return new Response(JSON.stringify({jsonrpc:'2.0',id:call.id,result}));
  }catch{return new Response(JSON.stringify({jsonrpc:'2.0',id:call.id,error:{code:-32000,message:'Fixture read unavailable'}}));}
 };
 return {fetcher,calls};
}
async function usingFetch<T>(fetcher:typeof fetch,run:()=>Promise<T>):Promise<T>{const previous=globalThis.fetch;try{globalThis.fetch=fetcher;return await run();}finally{globalThis.fetch=previous;}}

test('independent chain failures retain calls, exact nonce and base-fee evidence at the stated snapshot',async()=>{
 const request=native(),rpc=fixture(call=>{if(call.method==='eth_getBalance')throw Error('Missing balance');if(call.method==='eth_getTransactionCount')return '0x20000000000001';});
 const checks=await usingFetch(rpc.fetcher,()=>collector(config,rpc.fetcher)(request,decodeRequest(request)));
 const context=checks.find(e=>e.id==='chain_context')!;
 assert.equal(context.data?.blockHash,blockHash);assert.equal(context.data?.chainId,31337);assert.equal(context.data?.blockTimestampSeconds,'1000');
 assert.equal(context.data?.targetHasCode,false);assert.equal(context.data?.nativeBalanceWei,undefined);assert.deepEqual(context.data?.missing,['native_balance']);
 assert.equal(checks.find(e=>e.id==='chain_state_missing')?.status,'unknown');assert.equal(checks.find(e=>e.id==='basic_call')?.status,'pass');
 const nonce=checks.find(e=>e.id==='transaction_nonce')!;assert.equal(nonce.status,'warning');assert.equal(nonce.data?.confirmedNonce,'9007199254740993');assert.equal(nonce.data?.relation,'below_confirmed');assert.equal(nonce.data?.pendingNonceChecked,true);
 const fee=checks.find(e=>e.id==='transaction_base_fee')!;assert.equal(fee.status,'warning');assert.equal(fee.data?.baseFeePerGasWei,'32');assert.equal(fee.data?.suppliedFeeCapWei,'16');
 assert.ok(rpc.calls.filter(c=>['eth_getBalance','eth_getCode','eth_getTransactionCount'].includes(c.method)&&c.params.at(-1)!=='pending').every(c=>c.params.at(-1)==='0x2a'));
 assert.equal(rpc.calls.filter(c=>c.method==='eth_getTransactionCount'&&c.params.at(-1)==='pending').length,1);
});

test('pending nonce stays a separate unpinned node view; replacement candidates, failures and inconsistencies do not invent cancellation',async()=>{
 for(const mode of ['overlap','failed','inconsistent']){
  const request=native();request.transaction.nonce=mode==='overlap'?'0x3':'0x2';
  const rpc=fixture(call=>{if(call.method==='eth_getTransactionCount'&&call.params[1]==='pending'){if(mode==='failed')throw Error('No pending view');return mode==='inconsistent'?'0x1':'0x5';}});
  const checks=await usingFetch(rpc.fetcher,()=>collector(config,rpc.fetcher)(request,decodeRequest(request))),pending=checks.find(e=>e.id==='transaction_pending_nonce')!,confirmed=checks.find(e=>e.id==='transaction_nonce')!;
  assert.equal(confirmed.data?.confirmedNonce,'2');assert.equal(confirmed.data?.blockHash,blockHash);
  assert.equal(pending.status,mode==='overlap'?'warning':'unknown');
  assert.equal(pending.data?.view,'pending');assert.equal(pending.data?.confirmedBlockNumber,'42');
  assert.equal(pending.data?.blockNumber,undefined);assert.equal(pending.data?.blockHash,undefined);
  assert.equal(pending.data?.overlapsObservedPendingRange,mode==='overlap');assert.equal(pending.data?.pendingPayloadChecked,false);
  assert.match(pending.detail,mode==='inconsistent'?/cannot be combined/:/original payload/);
  if(mode==='failed'){assert.equal(confirmed.status,'pass');assert.equal(pending.data?.pendingNonce,null);}
 }
});

test('failed code and mismatched header are unknown without erasing a known native balance or successful call',async()=>{
 const request=native();request.transaction.value='0x65';const rpc=fixture(call=>{if(call.method==='eth_getCode')throw Error('Missing code');if(call.method==='eth_getBlockByNumber')return {...header,number:'0x2b'};});
 const checks=await usingFetch(rpc.fetcher,()=>collector(config,rpc.fetcher)(request,decodeRequest(request)));
 const context=checks.find(e=>e.id==='chain_context')!;
 assert.equal(context.data?.nativeBalanceWei,'100');assert.equal(context.data?.targetHasCode,undefined);assert.equal(context.data?.blockHash,undefined);assert.equal(context.data?.blockTimestampSeconds,undefined);
 assert.ok(checks.some(e=>e.id==='native_balance'&&e.status==='risk'));assert.equal(checks.find(e=>e.id==='basic_call')?.status,'pass');assert.equal(checks.find(e=>e.id==='transaction_base_fee')?.status,'unknown');
});

test('unsupported transaction fields never produce a substitute basic execution success',async()=>{
 const request=native();request.transaction.unsupportedFields=['accessList'];const rpc=fixture();
 const checks=await usingFetch(rpc.fetcher,()=>collector(config,rpc.fetcher)(request,decodeRequest(request)));
 assert.equal(checks.find(e=>e.id==='basic_call')?.status,'unknown');assert.ok(!rpc.calls.some(c=>c.method==='eth_call'&&c.params[0].from));
});

test('a declared SIWE network can supply a read network without claiming a verified signing network',async()=>{
 const request:SecurityRequest={kind:'signature',chainId:0,signature:{from:owner,method:'personal_sign',data:'0x48656c6c6f'}};
 const op={...decodeRequest(request),fields:{chainId:'31337'},targets:[]},rpc=fixture();
 const checks=await usingFetch(rpc.fetcher,()=>collector(config,rpc.fetcher)(request,op)),context=checks.find(e=>e.id==='chain_context')!;
 assert.equal(context.status,'pass');assert.equal(context.data?.chainId,31337);assert.equal(context.data?.claimedNetwork,true);assert.equal(context.data?.readChainSource,'message_claim');assert.match(context.detail,/not a verified signing network/);
});

test('custom typed data gets domain evidence and one-hop delegation facts without Permit nonce or signature fabrication',async()=>{
 const request:Extract<SecurityRequest,{kind:'signature'}>={kind:'signature',chainId:31337,signature:{from:owner,method:'eth_signTypedData_v4',data:{domain:{name:'Fixture custom',chainId:31337,verifyingContract:target},types:{Custom:[{name:'action',type:'string'}]},primaryType:'Custom',message:{action:'Inspect custom action'}}}};
 const typed=request.signature.data as any,expected=hashDomain({domain:typed.domain,types:{EIP712Domain:getTypesForEIP712Domain({domain:typed.domain})}});
 const rpc=fixture(call=>{
  if(call.method==='eth_getCode')return call.params[0]===owner?`0xef0100${delegate.slice(2)}`:call.params[0]===delegate?`0xef0100${target.slice(2)}`:'0x6000';
  if(call.method==='eth_call'){const decoded=decodeFunctionData({abi,data:call.params[0].data});assert.equal(decoded.functionName,'DOMAIN_SEPARATOR');return encodeAbiParameters(parseAbiParameters('bytes32'),[expected]);}
 });
 const checks=await usingFetch(rpc.fetcher,()=>signatureChainEvidence(request,config));
 assert.equal(checks.find(e=>e.id==='signature_domain')?.status,'pass');assert.equal(checks.find(e=>e.id==='signature_nonce')?.status,'unknown');assert.equal(checks.find(e=>e.id==='signature_validation')?.data?.consumptionExecuted,false);
 assert.equal(checks.find(e=>e.id==='signature_delegate_code')?.data?.delegate,delegate);assert.equal(checks.find(e=>e.id==='signature_delegate_code')?.data?.identityVerified,false);assert.equal(checks.find(e=>e.id==='signature_delegate_code')?.data?.blockHash,blockHash);
 assert.equal(rpc.calls.filter(c=>c.method==='eth_getCode'&&c.params[0]===owner).length,1);assert.equal(rpc.calls.filter(c=>c.method==='eth_getCode'&&c.params[0]===delegate).length,1);
 assert.ok(!checks.some(e=>e.id==='signature_scope'));assert.ok(rpc.calls.filter(c=>c.method==='eth_call').every(c=>c.params[1]==='0x2a'));
});

test('missing header leaves Permit nonce and domain facts usable while deadline comparison stays unknown',async()=>{
 const request:Extract<SecurityRequest,{kind:'signature'}>={kind:'signature',chainId:31337,signature:{from:owner,method:'eth_signTypedData_v4',data:{domain:{name:'Fixture',chainId:31337,verifyingContract:target},types:{Permit:[{name:'owner',type:'address'},{name:'spender',type:'address'},{name:'value',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]},primaryType:'Permit',message:{owner,spender:delegate,value:'10',nonce:'0',deadline:'2000000000'}}}};
 const rpc=fixture(call=>{if(call.method==='eth_getBlockByNumber')throw Error('Missing header');if(call.method==='eth_call')return encodeAbiParameters(parseAbiParameters('uint256'),[0n]);});
 const checks=await usingFetch(rpc.fetcher,()=>signatureChainEvidence(request,config));
 assert.equal(checks.find(e=>e.id==='signature_nonce')?.status,'pass');assert.equal(checks.find(e=>e.id==='signature_deadline')?.status,'unknown');assert.equal(checks.find(e=>e.id==='signature_deadline')?.data?.expiredAtObservedBlock,null);
 assert.ok(checks.every(e=>e.data?.blockHash===undefined&&e.data?.blockTimestampSeconds===undefined));
});

test('NFT ownership survives an independent getApproved failure with snapshot provenance',async()=>{
 const request=native(),op:Operation={...decodeRequest(request),token:target,tokenStandard:'erc721',fields:{owner,tokenId:'0'}};
 const rpc=fixture(call=>{
  if(call.method==='eth_getCode')return '0x6000';
  if(call.method==='eth_call'){
   const decoded=decodeFunctionData({abi,data:call.params[0].data});
   if(decoded.functionName==='supportsInterface')return encodeAbiParameters(parseAbiParameters('bool'),[decoded.args?.[0]==='0x80ac58cd']);
   if(decoded.functionName==='ownerOf')return encodeAbiParameters(parseAbiParameters('address'),[owner]);
   if(decoded.functionName==='getApproved')throw Error('Missing approval');
   return encodeAbiParameters(parseAbiParameters('bool'),[false]);
  }
 });
 const checks=await usingFetch(rpc.fetcher,()=>assetEvidence(request,op,config)),position=checks.find(e=>e.id==='nft_position_0_0')!;
 assert.equal(position.status,'unknown');assert.equal(position.data?.owner,owner);assert.deepEqual(position.data?.missing,['getApproved']);assert.equal(position.data?.blockHash,blockHash);assert.equal(position.data?.chainId,31337);
});

test('unavailable common control interfaces remain explicit without discarding code and proxy slots',async()=>{
 const request=native(),rpc=fixture(call=>{if(call.method==='eth_getCode')return '0x6000';if(call.method==='eth_call'){const decoded=decodeFunctionData({abi,data:call.params[0].data});if(decoded.functionName==='owner')throw Error('No owner interface');return encodeAbiParameters(parseAbiParameters('bool'),[false]);}});
 const checks=await protocolEvidence(request,decodeRequest(request),config,rpc.fetcher),controls=checks.find(e=>e.id==='contract_controls')!;
 assert.equal(controls.status,'unknown');assert.deepEqual(controls.data?.missing,['owner']);assert.equal(controls.data?.implementation,null);assert.ok(controls.data?.codeHash);assert.equal(controls.data?.blockHash,blockHash);
});

test('missing receipt price retains raw balances but cannot fabricate a zero fee or gas-adjusted native loss',async()=>{
 const request=native();let closed=false,reads=0;
 const factory:ForkFactory=async()=>({chainId:31337,blockNumber:'42',blockHash,close:async()=>{closed=true;},rpc:async method=>{
  if(method==='eth_getBalance')return reads++===0?'0x64':'0x5a';
  if(method==='eth_sendTransaction')return blockHash;
  if(method==='eth_getTransactionReceipt')return {status:'0x1',blockNumber:'0x2b',gasUsed:'0x1',logs:[]};
  if(method==='evm_revert')return true;
  return '0x1';
 }});
 const checks=await simulateRequest(request,decodeRequest(request),{...config,forkEnabled:true},factory),execution=checks.find(e=>e.id==='simulation_execution')!;
 assert.equal(execution.status,'pass');assert.deepEqual(execution.data?.native,{before:'100',after:'90',deltaIncludingGas:'-10',gasWei:null,deltaExcludingGas:null});assert.equal(checks.find(e=>e.id==='simulation_fee')?.status,'unknown');assert.ok(!checks.some(e=>e.id==='excess_native_spend'));assert.ok(closed);
});

test('address intelligence failure and missing flags do not erase other targets or claim known freshness',async()=>{
 const request=native(),extra=Array.from({length:6},(_,i)=>`0x${String(i+4).repeat(40)}`),ninth=extra.at(-1)!,op={...decodeRequest(request),targets:[owner,target,delegate,...extra]},local=fixture();
 const seen:string[]=[];
 const fetcher:typeof fetch=async(input,init)=>{
  const parsed=new URL(String(input));if(parsed.origin===new URL(url).origin)return local.fetcher(input,init);
  assert.equal(parsed.origin,'https://api.gopluslabs.io');assert.equal(init?.redirect,'error');seen.push(parsed.pathname);let result:any;
  if(parsed.pathname.endsWith('supported_chains'))result=[{id:'31337'}];
  else if(parsed.pathname.includes(target))return new Response('',{status:503});
  else if(parsed.pathname.includes(delegate))result={stealing_attack:'1'};
  else result={cybercrime:'0'};
  return new Response(JSON.stringify({code:1,result}));
 };
 const checks=await usingFetch(fetcher,()=>collector({...config,lookups:true},fetcher)(request,op));
 assert.equal(checks.find(e=>e.id===`address_${owner}`)?.status,'unknown');assert.equal(checks.find(e=>e.id===`address_${target}`)?.status,'unknown');assert.equal(checks.find(e=>e.id===`address_${delegate}`)?.status,'risk');
 const observed=checks.find(e=>e.id===`address_${owner}`)!;assert.equal(observed.data?.providerAsOf,null);assert.equal(observed.data?.freshnessVerified,false);assert.equal(observed.data?.chainId,31337);assert.equal(observed.data?.blockNumber,undefined);assert.ok((observed.data?.missing as string[]).includes('stealing_attack'));
 assert.ok(checks.some(e=>e.id==='address_intelligence_limit'&&e.title==='Address intelligence queries truncated'));assert.ok(seen.some(path=>path.includes(extra[0])));assert.ok(!seen.some(path=>path.includes(ninth)));assert.equal(checks.filter(check=>check.id.startsWith('address_0x')).length,8);
});

test('RPC envelopes with a mismatched request ID cannot become observed contract controls',async()=>{
 const request=native(),fetcher:typeof fetch=async(_input,init)=>{const call=JSON.parse(String(init?.body));return new Response(JSON.stringify({jsonrpc:'2.0',id:call.id+1,result:'0x7a69'}));};
 const checks=await protocolEvidence(request,decodeRequest(request),config,fetcher);assert.equal(checks.find(e=>e.id==='contract_controls')?.status,'unknown');assert.ok(checks.every(e=>!e.data?.codeHash));
});

test('response limits stop a stream before its remainder is consumed, and invalid code/header data is not invented',async()=>{
 let cancelled=false;
 const response=new Response(new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(8));},cancel(){cancelled=true;}}));
 await assert.rejects(readBoundedText(response,4),/Response too large/);assert.ok(cancelled);
 assert.equal(validateAccountCode(undefined),'0x');assert.throws(()=>validateAccountCode(null));assert.throws(()=>validateAccountCode('0x1'));
 assert.deepEqual(snapshotMetadata(1,42n,{number:43n,hash:blockHash,timestamp:1000n}),{chainId:1,blockNumber:'42'});
});
