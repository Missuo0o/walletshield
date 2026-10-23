import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeFunctionResult,keccak256,type Hex} from 'viem';
import {entryPointStateAbi,parseUserOperation,userOperationEvidence} from '../src/security/user-operation-evidence.js';
import type {SecurityConfig} from '../src/security/config.js';
import type {SecurityRequest,Operation} from '../src/security/types.js';
const sender='0x1111111111111111111111111111111111111111',entryPoint='0x2222222222222222222222222222222222222222',factory='0x3333333333333333333333333333333333333333',paymaster='0x4444444444444444444444444444444444444444',url='https://trusted.fixture.invalid',code='0x6000',hash=`0x${'ab'.repeat(32)}`;
const op:Operation={category:'user_operation',label:'Fixture',fields:{},targets:[],decoded:false};
const config=(version='0.7.0'):SecurityConfig=>({apiKey:'',model:'fixture',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{31337:url},trustedDeployments:[{chainId:31337,address:entryPoint,protocol:'erc4337',version,role:'entrypoint',codeHash:keccak256(code),sourceUrl:'https://github.com/eth-infinitism/account-abstraction'}]});
const common={sender,nonce:'0x7',callData:'0xdeadbeefabcdef01',callGasLimit:'0x64',verificationGasLimit:'0x14',preVerificationGas:'0xa',maxFeePerGas:'0x2',maxPriorityFeePerGas:'0x1',signature:`0x${'cdef'.repeat(80)}`};
const request=(body:Record<string,unknown>={...common}):SecurityRequest&{kind:'user_operation'}=>({kind:'user_operation',method:'eth_sendUserOperation',chainId:31337,origin:'https://untrusted-origin.fixture.invalid',params:[body,entryPoint]});
type Call={method:string;params:any[]};
function rpc(change?:(call:Call,result:any)=>any){const calls:Call[]=[];const fetcher:typeof fetch=async(input,init)=>{assert.equal(String(input),url);const call=JSON.parse(String(init?.body));calls.push(call);let result:any=call.method==='eth_chainId'?'0x7a69':call.method==='eth_getBlockByNumber'?{number:'0x2a',hash,timestamp:'0x1234',baseFeePerGas:'0x1'}:call.method==='eth_getCode'?code:undefined;
  if(call.method==='eth_call'){const decoded=decodeFunctionData({abi:entryPointStateAbi,data:call.params[0].data});result=encodeFunctionResult({abi:entryPointStateAbi,functionName:decoded.functionName,result:decoded.functionName==='getNonce'?7n:1000n});}
  if(change)result=change(call,result);return new Response(JSON.stringify({jsonrpc:'2.0',id:call.id,...(result===undefined?{error:{code:-32000,message:'Fixture missing'}}:{result})}));};return {calls,fetcher};}
const find=(checks:Awaited<ReturnType<typeof userOperationEvidence>>,id:string)=>{const check=checks.find(value=>value.id===id);assert.ok(check,id);return check;};
test('strict split/v0.6 extraction omits raw signature and dynamic payloads without losing numeric precision',()=>{
 const split=parseUserOperation(request({...common,nonce:'0x10000000000000007',factory,factoryData:'0xdeadbeef1234',paymaster,paymasterData:'0xaabb',paymasterVerificationGasLimit:'0x1e',paymasterPostOpGasLimit:'0x28'}));assert.ok(split);assert.equal(split.nonce,0x10000000000000007n);assert.equal(split.format,'split');assert.equal(split.signatureBytes,160);assert.equal(split.factoryDataBytes,6);assert.equal(split.paymasterDataBytes,2);assert.equal(split.callSelector,'0xdeadbeef');const serialized=JSON.stringify(split,(_key,value)=>typeof value==='bigint'?String(value):value);assert.ok(!serialized.includes(common.signature));assert.ok(!serialized.includes(common.callData));assert.ok(!serialized.includes('0xdeadbeef1234'));
 const legacy=parseUserOperation(request({...common,initCode:factory+'aabb',paymasterAndData:paymaster+'ccdd'}));assert.equal(legacy?.format,'v0.6');assert.equal(legacy?.factory,factory);assert.equal(legacy?.paymaster,paymaster);assert.equal(legacy?.factoryDataBytes,2);
 assert.ok(parseUserOperation(request({...common,signature:undefined})),'unsigned candidates are observed without pretending to validate a signature');
});
test('mixed versions, packed/extension fields, arbitrary shapes and invalid dynamic boundaries fail closed',()=>{
 const bad=[{...common,initCode:'0x',paymasterAndData:'0x',factory},{...common,accountGasLimits:'0x1234'},{...common,eip7702Auth:{}},{...common,factoryData:'0x12'},{...common,paymaster,paymasterData:'0x'},{...common,initCode:'0x12',paymasterAndData:'0x'},{...common,paymaster:'0x0000000000000000000000000000000000000000',paymasterData:'0x',paymasterVerificationGasLimit:'0x1',paymasterPostOpGasLimit:'0x1'},{...common,signature:'0xabc'},{...common,callData:'0x'+'ab'.repeat(8193)}];
 for(const body of bad)assert.equal(parseUserOperation(request(body)),null);
 assert.equal(parseUserOperation({...request(),params:{userOp:common,entryPoint}}),null);assert.equal(parseUserOperation({...request(),method:'eth_estimateUserOperationGas'}),null);
});
test('verified v0.7/0.8 EntryPoints use pinned keyed nonce, code, payer deposit and exact prefund arithmetic',async()=>{
 for(const version of ['0.7.0','v0.8']){const fixture=rpc(),checks=await userOperationEvidence(request({...common,factory,factoryData:'0xaabb',paymaster,paymasterData:'0x1234',paymasterVerificationGasLimit:'0x1e',paymasterPostOpGasLimit:'0x28'}),op,config(version),fixture.fetcher);
  assert.equal(find(checks,'userop_entrypoint').data?.matched,true);assert.equal(find(checks,'userop_nonce').data?.matches,true);const deposit=find(checks,'userop_deposit');assert.equal(deposit.data?.declaredRequiredGas,'200');assert.equal(deposit.data?.declaredPrefundWei,'400');assert.equal(deposit.data?.payer,paymaster);assert.equal(deposit.data?.actualCostKnown,false);assert.equal(find(checks,'userop_fee').status,'pass');assert.equal(find(checks,'userop_semantics').status,'unknown');assert.equal(find(checks,'userop_request').data?.rawSignatureIncluded,false);
  for(const check of checks.filter(value=>value.source==='rpc')){assert.equal(check.data?.blockNumber,'42');assert.equal(check.data?.blockHash,hash);}
  for(const call of fixture.calls.filter(call=>['eth_call','eth_getCode'].includes(call.method)))assert.equal(call.params.at(-1),'0x2a');assert.ok(fixture.calls.every(call=>!['eth_sendTransaction','eth_sendRawTransaction','eth_sendUserOperation'].includes(call.method)));
  assert.ok(!JSON.stringify(checks).includes(common.signature));assert.ok(!JSON.stringify(checks).includes(common.callData));
 }
});
test('v0.6 paymaster multiplier and sender prefund use distinct tagged formulas',async()=>{
 for(const sponsored of [true,false]){const fixture=rpc(),checks=await userOperationEvidence(request({...common,initCode:'0x',paymasterAndData:sponsored?paymaster+'aabb':'0x'}),op,config('0.6.0'),fixture.fetcher),deposit=find(checks,'userop_deposit');assert.equal(deposit.data?.declaredRequiredGas,sponsored?'170':'130');assert.equal(deposit.data?.declaredPrefundWei,sponsored?'340':'260');assert.equal(deposit.data?.payer,sponsored?paymaster:sender);}
});
test('unbound/mismatched EntryPoint versions never invoke presumed nonce/deposit ABI',async()=>{
 for(const cfg of [{...config(),trustedDeployments:[]},config('0.9'),config('0.6'),{...config(),trustedDeployments:config().trustedDeployments!.map(row=>({...row,codeHash:`0x${'ff'.repeat(32)}`}))}]){const fixture=rpc(),checks=await userOperationEvidence(request(),op,cfg,fixture.fetcher);assert.notEqual(find(checks,'userop_entrypoint').status,'pass');assert.equal(fixture.calls.filter(call=>call.method==='eth_call').length,0);assert.ok(!checks.some(check=>check.id==='userop_nonce'));}
});
test('partial nonce/code/basefee failures preserve deposit observations and request inconsistencies',async()=>{
 const fixture=rpc((call,result)=>call.method==='eth_call'&&decodeFunctionData({abi:entryPointStateAbi,data:call.params[0].data}).functionName==='getNonce'?undefined:call.method==='eth_getCode'&&call.params[0]===sender?'0x':call.method==='eth_getBlockByNumber'?{...result,baseFeePerGas:undefined}:result);
 const checks=await userOperationEvidence(request({...common,maxPriorityFeePerGas:'0x3'}),op,config(),fixture.fetcher);assert.equal(find(checks,'userop_nonce').status,'unknown');assert.equal(find(checks,'userop_sender_code').status,'warning');assert.equal(find(checks,'userop_deposit').status,'pass');assert.equal(find(checks,'userop_fee').status,'unknown');assert.equal(find(checks,'userop_request').status,'warning');
 const oversized=await userOperationEvidence(request({...common,callGasLimit:('0x'+(1n<<120n).toString(16)) as Hex}),op,config(),rpc().fetcher);assert.equal(find(oversized,'userop_deposit').status,'unknown');assert.equal(find(oversized,'userop_deposit').data?.declaredPrefundWei,undefined);
});
test('wrong or unconfigured RPC does not fabricate chain facts or query the request origin',async()=>{
 const absent=await userOperationEvidence(request(),op,{...config(),rpc:{}},async()=>{throw Error('Must not fetch');});assert.equal(find(absent,'userop_rpc').status,'unknown');const wrong=rpc((call,result)=>call.method==='eth_chainId'?'0x1':result),checks=await userOperationEvidence(request(),op,config(),wrong.fetcher);assert.equal(find(checks,'userop_rpc').status,'unknown');assert.equal(wrong.calls.length,1);
});
