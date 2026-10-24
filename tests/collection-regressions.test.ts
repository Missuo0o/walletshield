import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeAbiParameters,encodeFunctionData,erc20Abi,keccak256,pad,parseAbi,parseAbiParameters,toHex} from 'viem';
import {assetsFromLogs,openFork,simulateRequest,type ForkFactory} from '../src/security/simulation.js';
import {decodeRequest} from '../src/security/decode.js';
import {collector} from '../src/security/providers.js';
import {assess} from '../src/security/rules.js';
import {signatureChainEvidence} from '../src/security/signatures.js';
import type {SecurityConfig} from '../src/security/config.js';
import type {SecurityRequest} from '../src/security/types.js';

const owner='0x2222222222222222222222222222222222222222',other='0x3333333333333333333333333333333333333333',token='0x1111111111111111111111111111111111111111';
const config:SecurityConfig={apiKey:'',model:'test',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{},forkEnabled:true};
const native=():Extract<SecurityRequest,{kind:'transaction'}>=>({kind:'transaction',chainId:31337,transaction:{from:owner,to:other,data:'0x',value:'0x1'}});
const transfer=keccak256(toHex('Transfer(address,address,uint256)'));
function forkFixture(options:{logs?:unknown[];trace?:unknown;assetRead?:(reverted:boolean)=>string}={}) {
 let sent:Record<string,string>|undefined,reverted=false;
 const factory:ForkFactory=async()=>({chainId:31337,blockNumber:'6',blockHash:'0xabc',close:async()=>{},rpc:async(method,params=[])=>{
  if(method==='evm_snapshot')return '1';
  if(method==='eth_getBalance')return '0x64';
  if(method==='eth_sendTransaction'){sent=(params[0] as Record<string,string>);if(BigInt(sent.gas)<30000n)throw Error('fixture gas too low');return '0xabc';}
  if(method==='eth_getTransactionReceipt')return {status:'0x1',blockNumber:'0x7',gasUsed:'0x1',effectiveGasPrice:'0x1',logs:options.logs??[]};
  if(method==='eth_call')return options.assetRead?.(reverted)??pad('0x00');
  if(method==='debug_traceTransaction')return options.trace??true;
  if(method==='evm_revert'){reverted=true;return true;}
  return true;
 }});
 return {factory,sent:()=>sent};
}

test('supplied gas, legacy or dynamic fees and nonce survive isolated execution; insufficient gas cannot become success',async()=>{
 for(const feeFields of [{type:'0x0',gasPrice:'0x10'},{type:'0x1',gasPrice:'0x10'},{type:'0x2',maxFeePerGas:'0x20',maxPriorityFeePerGas:'0x2'}]){
  const request=native();Object.assign(request.transaction,{gas:'0x100000',nonce:'0x8'},feeFields);const fixture=forkFixture();
  const facts=await simulateRequest(request,decodeRequest(request),config,fixture.factory);
  assert.equal(facts.find(e=>e.id==='simulation_execution')?.status,'pass');
  assert.equal(fixture.sent()?.gas,'0x100000');assert.equal(fixture.sent()?.nonce,'0x8');
  for(const [key,value] of Object.entries(feeFields))assert.equal(fixture.sent()?.[key],value);
  assert.equal(facts.find(e=>e.id==='simulation_execution')?.data?.gasLimitSource,'request');
  assert.equal(facts.find(e=>e.id==='simulation_execution')?.data?.executionBlockNumber,'7');
 }
 const request=native();request.transaction.gas='0x5208';const fixture=forkFixture();
 const facts=await simulateRequest(request,decodeRequest(request),config,fixture.factory);
 assert.ok(!facts.some(e=>e.id==='simulation_execution'&&e.status==='pass'));
 assert.equal(facts.find(e=>e.id==='simulation_execution')?.status,'unknown');
});

test('bounded fork traces and asset discovery explicitly report every reached extraction limit',async()=>{
 const log=(n:number)=>({address:`0x${n.toString(16).padStart(40,'0')}`,topics:[transfer,pad(owner),pad(other)],data:pad('0x01')});
 const logs=Array.from({length:257},(_,i)=>log(i+1)),leaf={type:'CALL',from:owner,to:other,input:'0x'};
 let nested:any=leaf;for(let depth=0;depth<22;depth++)nested={...leaf,calls:[nested]};
 for(const trace of [{...leaf,calls:Array.from({length:129},()=>leaf)},nested,{...leaf,calls:'malformed'}]){
  const fixture=forkFixture({logs,trace}),checks=await simulateRequest(native(),decodeRequest(native()),config,fixture.factory),execution=checks.find(check=>check.id==='simulation_execution')!,limits=checks.find(check=>check.id==='simulation_extraction_limits')!;
  assert.equal(execution.status,'pass','A bounded trace must not discard a real successful fork receipt');assert.equal(execution.data?.traceAvailable,true);assert.equal(execution.data?.traceTruncated,true);assert.equal(limits.status,'unknown');
  assert.ok((limits.data?.gaps as string[]).includes('receipt_log_limit'));assert.ok((limits.data?.gaps as string[]).includes('discovered_asset_limit'));assert.equal((execution.data?.assetDiscovery as any).inspectedLogCount,256);assert.equal((execution.data?.assetDiscovery as any).retainedAssetCount,32);
  assert.ok((execution.data?.calls as unknown[]).length<=128);assert.ok((limits.data?.gaps as string[]).some(value=>value.startsWith('trace_')||value==='malformed_trace_children'));
 }
 const batchIds=Array.from({length:65},(_,i)=>BigInt(i)),batchLog={address:token,topics:[keccak256(toHex('TransferBatch(address,address,address,uint256[],uint256[])')),pad(owner),pad(owner),pad(other)],data:encodeAbiParameters(parseAbiParameters('uint256[],uint256[]'),[batchIds,batchIds.map(()=>1n)])};
 const batch=forkFixture({logs:[batchLog],trace:leaf}),batchFacts=await simulateRequest(native(),decodeRequest(native()),config,batch.factory);assert.ok((batchFacts.find(check=>check.id==='simulation_extraction_limits')?.data?.gaps as string[]).includes('erc1155_identifier_limit'));assert.equal((batchFacts.find(check=>check.id==='simulation_execution')?.data?.assetDiscovery as any).identifierEventsTruncated,1);
 const missing=forkFixture(),facts=await simulateRequest(native(),decodeRequest(native()),config,missing.factory);assert.ok((facts.find(check=>check.id==='simulation_extraction_limits')?.data?.gaps as string[]).includes('trace_unavailable'));
});

test('a missing or malformed base header cannot establish an isolated fork snapshot',async()=>{
 const previous=globalThis.fetch;
 try{
  for(const header of [{number:'0x1',timestamp:'0x1'},{number:'0x1',timestamp:'0x1',hash:'0x1234'},{number:'0x1',hash:`0x${'ab'.repeat(32)}`},{number:'1',timestamp:'0x1',hash:`0x${'ab'.repeat(32)}`}]){
   const calls:string[]=[];globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));calls.push(body.method);return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:body.method==='eth_chainId'?'0x7a69':header}));};
   await assert.rejects(()=>openFork({...config,rpc:{31337:'https://invalid-header.fixture'}},31337),/Fork preparation failed/);assert.deepEqual(calls,['eth_chainId','eth_getBlockByNumber']);
  }
 }finally{globalThis.fetch=previous;}
});

test('invalid Transfer logs are ignored independently and malformed ownerOf remains unknown',async()=>{
 const valid={address:token,topics:[transfer,pad(owner),pad(other),pad('0x00')],data:'0x'};
 assert.deepEqual(assetsFromLogs([{...valid,topics:[transfer,pad(owner),pad(other),'invalid']},valid]),[{kind:'erc721',contract:token,tokenId:'0'}]);
 assert.deepEqual(assetsFromLogs([{address:token,topics:[transfer,pad(owner),pad(other)],data:'0x01'}]),[]);
 const request=native();request.transaction.to=token;request.transaction.data=encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[other,0n]});
 const fixture=forkFixture({logs:[valid],assetRead:reverted=>reverted?encodeAbiParameters(parseAbiParameters('address'),[owner]):'0x'});
 const facts=await simulateRequest(request,decodeRequest(request),config,fixture.factory);
 assert.equal(facts.find(e=>e.id==='simulation_execution')?.status,'pass');
 assert.equal((facts.find(e=>e.id==='simulation_execution')?.data?.assets as any[])[0].after,null);
 assert.ok(!facts.some(e=>e.id==='unexpected_asset_loss'));
});

test('read-only permission and capability queries do not grant authority',()=>{
 for(const method of ['wallet_getPermissions','wallet_getCapabilities']){
  const request:SecurityRequest={kind:'wallet_rpc',chainId:1,method,params:[]};const report=assess(request,[]);
  assert.equal(report.operation.category,'read_only');assert.equal(report.operation.addsPermission,false);
  assert.ok(!report.checks.some(e=>e.id==='permission_scope'));
 }
 const request:SecurityRequest={kind:'wallet_rpc',chainId:1,method:'wallet_requestPermissions',params:[{eth_accounts:{}}]};
 assert.ok(assess(request,[]).checks.some(e=>e.id==='permission_scope'));
});

test('basic eth_call retains supported execution fields instead of checking a substitute request',async()=>{
 const request=native();Object.assign(request.transaction,{type:'0x0',gas:'0x5208',gasPrice:'0x10',nonce:'0x8'});
 const previous=globalThis.fetch;let called:Record<string,string>|undefined;
 const mock:typeof fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));let result:any;
  if(body.method==='eth_chainId')result='0x7a69';
  else if(body.method==='eth_blockNumber')result='0x6';
  else if(body.method==='eth_getBlockByNumber')result={number:'0x6',timestamp:'0x64',transactions:[],hash:`0x${'0'.repeat(64)}`};
  else if(body.method==='eth_getBalance')result='0x64';
  else if(body.method==='eth_getCode')result='0x';
  else if(body.method==='eth_call'){called=body.params[0];result='0x';}
  else throw Error(`Unexpected local fixture RPC ${body.method}`);
  return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result}));
 };
 try{
  globalThis.fetch=mock;const facts=await collector({...config,forkEnabled:false,rpc:{31337:'http://127.0.0.1:19999'}},mock)(request,decodeRequest(request));
  assert.equal(facts.find(e=>e.id==='basic_call')?.status,'pass');assert.equal(called?.type,'0x0');assert.equal(called?.gas,'0x5208');assert.equal(called?.gasPrice,'0x10');assert.equal(called?.nonce,'0x8');
 }finally{globalThis.fetch=previous;}
});

test('Permit2 zero expiration retains its submission-block meaning rather than being called already expired',async()=>{
 const tx=native();tx.transaction.to=token;tx.transaction.data=encodeFunctionData({abi:parseAbi(['function approve(address token,address spender,uint160 amount,uint48 expiration)']),functionName:'approve',args:[token,other,1n,0]});
 const report=assess(tx,[]);assert.ok(report.checks.some(e=>e.id==='permit2_expiration_zero'));assert.ok(!report.checks.some(e=>e.id==='expired_expiration'));
 const request:SecurityRequest={kind:'signature',chainId:31337,signature:{from:owner,method:'eth_signTypedData_v4',data:{domain:{name:'Permit2',chainId:31337,verifyingContract:token},types:{PermitDetails:[{name:'token',type:'address'},{name:'amount',type:'uint160'},{name:'expiration',type:'uint48'},{name:'nonce',type:'uint48'}],PermitSingle:[{name:'details',type:'PermitDetails'},{name:'spender',type:'address'},{name:'sigDeadline',type:'uint256'}]},primaryType:'PermitSingle',message:{details:{token,amount:'1',expiration:'0',nonce:'0'},spender:other,sigDeadline:'2000000000',owner:other}}}};
 const previous=globalThis.fetch;
 try{
  globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));if(body.method==='eth_call'){const decoded=decodeFunctionData({abi:parseAbi(['function allowance(address,address,address) view returns(uint160,uint48,uint48)']),data:body.params[0].data});assert.equal(decoded.args?.[0],owner,'Unsigned owner metadata must not redirect the Permit2 query');}const result=body.method==='eth_chainId'?'0x7a69':body.method==='eth_blockNumber'?'0x6':body.method==='eth_getBlockByNumber'?{number:'0x6',hash:`0x${'ab'.repeat(32)}`,timestamp:'0x64',transactions:[]}:encodeAbiParameters(parseAbiParameters('uint160,uint48,uint48'),[0n,0,0]);return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result}));};
  const facts=await signatureChainEvidence(request,{...config,rpc:{31337:'http://127.0.0.1:19999'}});
  assert.ok(facts.some(e=>e.id==='permit2_expiration_0'));assert.ok(!facts.some(e=>e.id==='permit2_expired_0'));
  assert.equal(decodeRequest(request).fields.owner,undefined);assert.ok(!assess(request,facts).checks.some(e=>e.id==='signer_mismatch'));
 }finally{globalThis.fetch=previous;}
});

test('unsigned Permit-like metadata is not promoted to signed authority or expiry; canonical NFT Permit is recognized',()=>{
 const request:Extract<SecurityRequest,{kind:'signature'}>={kind:'signature',chainId:1,signature:{from:owner,method:'eth_signTypedData_v4',data:{domain:{name:'Custom',chainId:1,verifyingContract:token},types:{Permit:[{name:'value',type:'uint256'}]},primaryType:'Permit',message:{value:'1',owner:other,spender:other,deadline:'1'}}}};
 const op=decodeRequest(request),report=assess(request,[]);assert.equal(op.category,'typed_signature');assert.equal(op.decoded,false);assert.equal(op.fields.owner,undefined);assert.equal(op.fields.spender,undefined);assert.equal(op.fields.deadline,undefined);assert.deepEqual(op.targets,[]);assert.ok(!report.checks.some(e=>['signer_mismatch','expired_deadline','permission_scope'].includes(e.id)));
 const typed=request.signature.data as any;typed.types.Permit=[{name:'spender',type:'address'},{name:'tokenId',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}];typed.message={spender:other,tokenId:'0',nonce:'0',deadline:'2000000000'};
 assert.equal(decodeRequest(request).category,'permit_signature');assert.equal(decodeRequest(request).tokenStandard,'erc721');assert.equal(decodeRequest(request).fields.tokenId,'0');assert.equal(decodeRequest(request).decoded,true);
});

test('a failed domain read cannot discard an observed Permit nonce mismatch',async()=>{
 const request:SecurityRequest={kind:'signature',chainId:31337,signature:{from:owner,method:'eth_signTypedData_v4',data:{domain:{name:'Token',version:'1',chainId:31337,verifyingContract:token},types:{Permit:[{name:'owner',type:'address'},{name:'spender',type:'address'},{name:'value',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]},primaryType:'Permit',message:{owner,spender:other,value:'1',nonce:'0',deadline:'2000000000'}}}};
 const previous=globalThis.fetch;
 try{
  globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));let result:any;if(body.method==='eth_chainId')result='0x7a69';else if(body.method==='eth_blockNumber')result='0x6';else if(body.method==='eth_getBlockByNumber')result={number:'0x6',hash:`0x${'ab'.repeat(32)}`,timestamp:'0x64',transactions:[]};else if(body.params[0].data.slice(0,10)===encodeFunctionData({abi:parseAbi(['function DOMAIN_SEPARATOR() view returns(bytes32)']),functionName:'DOMAIN_SEPARATOR'}))return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,error:{code:-32000,message:'fixture interface unavailable'}}));else result=pad('0x01');return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result}));};
  const facts=await signatureChainEvidence(request,{...config,rpc:{31337:'http://127.0.0.1:19999'}});
  assert.equal(facts.find(e=>e.id==='signature_nonce')?.status,'risk');assert.equal(facts.find(e=>e.id==='signature_domain')?.status,'unknown');
 }finally{globalThis.fetch=previous;}
});
