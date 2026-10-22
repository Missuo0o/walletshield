import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeFunctionData,encodeFunctionResult} from 'viem';
import {accountOperationAbi,decodeAccountOperation} from '../src/security/account-operations.js';
import {accountStateAbi,accountEvidence} from '../src/security/account-evidence.js';
import type {SecurityRequest,Operation} from '../src/security/types.js';
import type {SecurityConfig} from '../src/security/config.js';
const from='0x1111111111111111111111111111111111111111',account='0x2222222222222222222222222222222222222222',authority='0x3333333333333333333333333333333333333333',old='0x4444444444444444444444444444444444444444',zero='0x0000000000000000000000000000000000000000',sentinel='0x0000000000000000000000000000000000000001';
const url='https://rpc.fixture.invalid',hash=`0x${'ab'.repeat(32)}`;
const config:SecurityConfig={apiKey:'',model:'fixture',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{31337:url}};
function request(method:string,args:unknown[]):Extract<SecurityRequest,{kind:'transaction'}>{return {kind:'transaction',chainId:31337,origin:'https://untrusted-dapp.fixture.invalid',transaction:{from,to:account,value:'0x0',data:encodeFunctionData({abi:accountOperationAbi,functionName:method as never,args:args as never})}};}
function op(method:string,args:unknown[]){const result=decodeAccountOperation(request(method,args));assert.ok(result);return result;}
type Call={jsonrpc:string;id:number;method:string;params:any[]};
function rpcFixture(handler?:(call:Call)=>unknown){
 const calls:Call[]=[];
 const fetcher:typeof fetch=async(input,options)=>{
  assert.equal(String(input),url,'only the configured server RPC is queried');assert.equal(options?.redirect,'error');const call=JSON.parse(String(options?.body)) as Call;calls.push(call);
  try{
   let result=handler?.(call);
   if(result===undefined){
    if(call.method==='eth_chainId')result='0x7a69';
    else if(call.method==='eth_blockNumber')result='0x2a';
    else if(call.method==='eth_getBlockByNumber')result={number:'0x2a',timestamp:'0x3e8',hash};
    else if(call.method==='eth_getCode')result='0x6000';
    else if(call.method==='eth_call'){
     const decoded=decodeFunctionData({abi:accountStateAbi,data:call.params[0].data});
     result=encodeFunctionResult({abi:accountStateAbi,functionName:decoded.functionName,result:(decoded.functionName==='getOwners'?[from,old]:decoded.functionName==='getThreshold'?2n:true) as never});
    }else throw Error('Unexpected RPC method');
   }
   return new Response(JSON.stringify({jsonrpc:'2.0',id:call.id,result}));
  }catch{return new Response(JSON.stringify({jsonrpc:'2.0',id:call.id,error:{code:-32000,message:'Fixture unavailable'}}));}
 };
 return {calls,fetcher};
}
function evidence(checks:Awaited<ReturnType<typeof accountEvidence>>,id:string){const check=checks.find(value=>value.id===id);assert.ok(check,`Expected ${id}`);return check;}

test('strict owner-management candidates distinguish granting, replacement, removal and threshold change',()=>{
 const add=op('addOwnerWithThreshold',[authority,1n]);assert.equal(add.category,'account_control');assert.equal(add.fields.newAuthority,authority);assert.equal(add.fields.threshold,'1');assert.equal(add.addsPermission,true);
 const remove=op('removeOwner',[sentinel,old,1n]);assert.equal(remove.fields.authorityChange,'remove_owner');assert.equal(remove.fields.removedAuthority,old);assert.equal(remove.fields.newAuthority,undefined);assert.equal(remove.addsPermission,false);assert.equal(remove.fields.prevOwner,sentinel);
 const swap=op('swapOwner',[sentinel,old,authority]);assert.equal(swap.fields.removedOwner,old);assert.equal(swap.fields.newAuthority,authority);assert.equal(swap.addsPermission,true);
 const threshold=op('changeThreshold',[1n]);assert.equal(threshold.fields.authorityChange,'change_threshold');assert.equal(threshold.fields.threshold,'1');assert.equal(threshold.addsPermission,false,'direction requires current state, not a guessed grant');assert.match(String(threshold.fields.protocolIdentity),/unverified/);
});
test('module/guard/fallback candidates preserve revocation roles and approveHash does not expose a raw hash preimage',()=>{
 const enable=op('enableModule',[authority]);assert.equal(enable.fields.module,authority);assert.equal(enable.addsPermission,true);
 const disable=op('disableModule',[sentinel,authority]);assert.equal(disable.fields.prevModule,sentinel);assert.equal(disable.fields.removedAuthority,authority);assert.equal(disable.addsPermission,false);
 for(const method of ['setGuard','setFallbackHandler']){const change=op(method,[authority]),remove=op(method,[zero]);assert.equal(change.fields.newAuthority,authority);assert.equal(change.addsPermission,true);assert.equal(remove.fields.newAuthority,undefined);assert.equal(remove.addsPermission,false);assert.match(String(remove.fields.authorityChange),/^remove_/);}
 const approvedHash=`0x${'cd'.repeat(32)}`,approve=op('approveHash',[approvedHash]);assert.equal(approve.fields.hashPreimageKnown,false);assert.equal(approve.fields.approvedHashBytes,'32');assert.equal(JSON.stringify(approve).includes(approvedHash),false);assert.equal(approve.addsPermission,true);
});
test('execution wrappers expose CALL/DELEGATECALL context and refund quantities without signature bytes or inner calldata',()=>{
 const payload='0x12345678abcd',signatures=`0x${'ab'.repeat(65)}`;
 for(const [value,name] of [[0,'call'],[1,'delegatecall'],[2,'unsupported']] as const){
  const decoded=op('execTransaction',[authority,3n,payload,value,21000n,100n,2n,old,from,signatures]);assert.equal(decoded.category,'account_execution');assert.equal(decoded.fields.executionTarget,authority);assert.equal(decoded.fields.executionValueWei,'3');assert.equal(decoded.fields.executionOperation,name);assert.equal(decoded.fields.innerSelector,'0x12345678');assert.equal(decoded.fields.innerCalldataBytes,'6');assert.equal(decoded.fields.signatureBytes,'65');assert.equal(decoded.fields.signaturesVerified,false);assert.equal(decoded.fields.safeTxGas,'21000');assert.equal(decoded.fields.gasToken,old);assert.equal(JSON.stringify(decoded).includes(signatures),false);assert.equal(JSON.stringify(decoded).includes(payload),false);assert.equal(decoded.fields.executionSemanticsKnown,value<2);if(value===1){assert.match(String(decoded.fields.executionContext),/account context/);assert.match(String(decoded.fields.executionValueSemantics),/not a separate native transfer/);}
 }
});
test('account decoding rejects noncanonical trailing/padded/malformed input and unrelated request entries',()=>{
 const valid=request('enableModule',[authority]);assert.equal(decodeAccountOperation({...valid,transaction:{...valid.transaction,data:valid.transaction.data+'00'}}),null);
 assert.equal(decodeAccountOperation({...valid,transaction:{...valid.transaction,data:'0xdeadbeef'}}),null);
 assert.equal(decodeAccountOperation({...valid,transaction:{...valid.transaction,to:null}}),null);
 assert.equal(decodeAccountOperation({kind:'signature',chainId:0,signature:{from,method:'personal_sign',data:'hello'}}),null);
 // A nonzero high byte before an address is not an equivalent canonical address.
 const padded=valid.transaction.data.slice(0,10)+'01'+valid.transaction.data.slice(12);assert.equal(decodeAccountOperation({...valid,transaction:{...valid.transaction,data:padded}}),null);
});
test('account state pins verified RPC chain/block and separates observed owners/threshold/module/code from identity',async()=>{
 const req=request('enableModule',[authority]),operation=decodeAccountOperation(req)!,rpc=rpcFixture(),checks=await accountEvidence(req,operation,config,rpc.fetcher);
 assert.equal(evidence(checks,'account_owners').status,'pass');assert.deepEqual(evidence(checks,'account_owners').data?.owners,[from,old]);assert.equal(evidence(checks,'account_threshold').data?.threshold,'2');assert.equal(evidence(checks,'account_module').data?.enabled,true);assert.equal(evidence(checks,'account_code').data?.identityVerified,false);assert.equal(evidence(checks,'account_authority_code_0').data?.target,authority);
 assert.equal(evidence(checks,'account_semantics').status,'unknown');assert.equal(evidence(checks,'account_semantics').data?.guardStateChecked,false);
 for(const check of checks.filter(value=>value.source==='rpc')){assert.equal(check.data?.chainId,31337);assert.equal(check.data?.blockNumber,'42');assert.equal(check.data?.blockHash,hash);}
 assert.ok(rpc.calls.filter(call=>['eth_call','eth_getCode'].includes(call.method)).every(call=>call.params.at(-1)==='0x2a'));
 assert.ok(rpc.calls.filter(call=>call.method==='eth_call').every(call=>['getOwners','getThreshold','isModuleEnabled'].includes(decodeFunctionData({abi:accountStateAbi,data:call.params[0].data}).functionName)),'no fictional public getGuard/getFallbackHandler is queried');
});
test('partial account read failures preserve independent owners, module and code observations',async()=>{
 const req=request('disableModule',[sentinel,authority]),operation=decodeAccountOperation(req)!,rpc=rpcFixture(call=>{
  if(call.method==='eth_call'&&decodeFunctionData({abi:accountStateAbi,data:call.params[0].data}).functionName==='getThreshold')throw Error('No threshold');
  if(call.method==='eth_getCode'&&call.params[0]===account)throw Error('No account code');
 }),checks=await accountEvidence(req,operation,config,rpc.fetcher);
 assert.equal(evidence(checks,'account_threshold').status,'unknown');assert.equal(evidence(checks,'account_code').status,'unknown');assert.equal(evidence(checks,'account_owners').status,'pass');assert.equal(evidence(checks,'account_module').data?.enabled,true);
});
test('threshold reduction is a conditional comparison, while missing or inconsistent owner interfaces stay explicit',async()=>{
 const req=request('changeThreshold',[1n]),operation=decodeAccountOperation(req)!,rpc=rpcFixture(),checks=await accountEvidence(req,operation,config,rpc.fetcher);
 const comparison=evidence(checks,'account_threshold_change');assert.equal(comparison.status,'warning');assert.equal(comparison.data?.currentThreshold,'2');assert.equal(comparison.data?.requestedThreshold,'1');assert.match(comparison.detail,/actual execution are not established/);
 const duplicate=rpcFixture(call=>call.method==='eth_call'&&decodeFunctionData({abi:accountStateAbi,data:call.params[0].data}).functionName==='getOwners'?encodeFunctionResult({abi:accountStateAbi,functionName:'getOwners',result:[from,from]}):undefined);
 assert.equal(evidence(await accountEvidence(req,operation,config,duplicate.fetcher),'account_owners').status,'unknown');
});
test('owner list and metadata are bounded and a failed header never fabricates snapshot provenance',async()=>{
 const req=request('addOwnerWithThreshold',[authority,1n]),operation=decodeAccountOperation(req)!,owners=Array.from({length:65},(_,i)=>`0x${(i+10).toString(16).padStart(40,'0')}` as `0x${string}`),rpc=rpcFixture(call=>{
  if(call.method==='eth_getBlockByNumber')return {number:'0x2b',timestamp:'0x3e8',hash};
  if(call.method==='eth_call'&&decodeFunctionData({abi:accountStateAbi,data:call.params[0].data}).functionName==='getOwners')return encodeFunctionResult({abi:accountStateAbi,functionName:'getOwners',result:owners});
 }),checks=await accountEvidence(req,operation,config,rpc.fetcher),observed=evidence(checks,'account_owners');
 assert.equal(observed.status,'unknown');assert.equal((observed.data?.owners as string[]).length,64);assert.equal(observed.data?.truncated,true);assert.equal(observed.data?.returnedCount,65);assert.equal(observed.data?.blockHash,undefined);assert.equal(evidence(checks,'account_threshold').status,'pass');
});
test('unconfigured/wrong-chain/invalid-envelope contexts remain unknown and never use request-origin URLs',async()=>{
 const req=request('setGuard',[authority]),operation=decodeAccountOperation(req)!;
 const absent=await accountEvidence(req,operation,{...config,rpc:{}},async()=>{throw Error('Must not query');});assert.equal(evidence(absent,'account_state').source,'configuration');
 const wrong=rpcFixture(call=>call.method==='eth_chainId'?'0x1':undefined),checks=await accountEvidence(req,operation,config,wrong.fetcher);assert.equal(evidence(checks,'account_state').status,'unknown');assert.deepEqual(wrong.calls.map(call=>call.method),['eth_chainId']);
 const envelope:typeof fetch=async()=>new Response(JSON.stringify({jsonrpc:'2.0',id:-1,result:'0x7a69'}));assert.equal(evidence(await accountEvidence(req,operation,config,envelope),'account_state').status,'unknown');
});
test('sentinel modules are not queried and unsupported execution operations retain an explicit unknown',async()=>{
 const req=request('enableModule',[sentinel]),operation=decodeAccountOperation(req)!,rpc=rpcFixture();await accountEvidence(req,operation,config,rpc.fetcher);assert.equal(rpc.calls.filter(call=>call.method==='eth_call'&&decodeFunctionData({abi:accountStateAbi,data:call.params[0].data}).functionName==='isModuleEnabled').length,0);
 const exec=request('execTransaction',[authority,0n,'0x',2,0n,0n,0n,zero,zero,'0x']),checks=await accountEvidence(exec,decodeAccountOperation(exec)!,config,rpc.fetcher);assert.equal(evidence(checks,'account_execution_type').status,'unknown');
 assert.deepEqual(await accountEvidence(exec,{...decodeAccountOperation(exec)!,category:'native_transfer'} as Operation,config,rpc.fetcher),[]);
});
