import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,maxUint256,parseAbi,toHex,zeroAddress} from 'viem';
import {batchEvidence,BATCH_LIMITS} from '../src/security/batch-evidence.js';
import {decodeRequest} from '../src/security/decode.js';
import type {SecurityRequest} from '../src/security/types.js';
import {protocolOperationAbi} from '../src/security/protocol-operations.js';
import {accountOperationAbi} from '../src/security/account-operations.js';

const abi=parseAbi([
 'function multicall(bytes[] data)','function multicall(uint256 deadline,bytes[] data)',
 'function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures)',
 'function multiSend(bytes transactions)','function approve(address spender,uint256 amount)','function transfer(address to,uint256 amount)',
 'function safeBatchTransferFrom(address from,address to,uint256[] ids,uint256[] amounts,bytes data)',
 'function execute(bytes commands,bytes[] inputs,uint256 deadline)','function depositETH(uint32 minGasLimit,bytes extraData)',
 'function swapExactETHForTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline)'
]);
const account='0x'+'1'.repeat(40),wrapper='0x'+'2'.repeat(40),spender='0x'+'3'.repeat(40),token='0x'+'4'.repeat(40);
const encode=(functionName:string,args:readonly unknown[])=>encodeFunctionData({abi,functionName:functionName as never,args:args as never});
const multicall=(children:readonly `0x${string}`[])=>encode('multicall',[children]);
const request=(data:`0x${string}`):SecurityRequest=>({kind:'transaction',chainId:31337,transaction:{from:account,to:wrapper,value:'0x0',data}});
const inspect=(data:`0x${string}`)=>{const req=request(data);return batchEvidence(req,decodeRequest(req));};
const child=(facts:ReturnType<typeof inspect>,path:string)=>facts.find(fact=>fact.id===`batch_child_${path.replaceAll('.','_')}`)!;
const packed=(operation:number,target:string,value:bigint,data:`0x${string}`)=>toHex(operation,{size:1})+target.slice(2)+toHex(value,{size:32}).slice(2)+toHex(BigInt((data.length-2)/2),{size:32}).slice(2)+data.slice(2);

test('new child summaries omit default-sender bridge recipients while retaining explicit account and position authority',()=>{
 const extended=(functionName:string,args:readonly unknown[])=>encodeFunctionData({abi:protocolOperationAbi,functionName:functionName as never,args:args as never});
 const actions=[extended('bridgeETH',[200000,'0x']),extended('bridgeERC20',[token,spender,1n,200000,'0x']),extended('withdraw',[token,1n,200000,'0x'])];
 for(const action of actions){const facts=inspect(multicall([action]));assert.equal((child(facts,'0.0').data?.parameters as any).recipient,undefined);assert.equal(child(facts,'0.0').data?.childSenderVerified,false);}
 const explicit=inspect(multicall([extended('withdrawTo',[token,account,1n,200000,'0x'])]));assert.equal((child(explicit,'0.0').data?.parameters as any).recipient,account);
 const control=encodeFunctionData({abi:accountOperationAbi,functionName:'changeThreshold',args:[1n]});
 const summary=child(inspect(multicall([control])),'0.0');assert.equal(summary.data?.category,'account_control');assert.equal((summary.data?.parameters as any).threshold,'1');assert.equal((summary.data?.parameters as any).authorityChange,'change_threshold');
 const position=extended('decreaseLiquidity',[{tokenId:99n,liquidity:7n,amount0Min:1n,amount1Min:2n,deadline:2000000000n}]);
 const amounts=child(inspect(multicall([position])),'0.0').data?.parameters as any;assert.equal(amounts.tokenId,'99');assert.equal(amounts.liquidity,'7');assert.equal(amounts.amount0Min,'1');
});

test('empty calldata under delegatecall is code execution, while CALL keeps its explicit native-transfer recipient',()=>{
 for(const operation of [0,1]){
  const safe=encode('execTransaction',[token,7n,'0x',operation,21000n,0n,0n,zeroAddress,zeroAddress,'0x']);
  const data=child(inspect(safe),'0.0').data!;
  assert.equal(data.category,operation===1?'delegated_code_execution':'native_transfer');
  assert.equal(data.valueWei,operation===1?null:'7');
  assert.equal((data.parameters as any).recipient,operation===1?undefined:token);
  assert.equal(data.abiShapeDecoded,operation===0);
  assert.equal(data.encodedValueIgnoredByDelegatecall,operation===1);
 }
});

test('canonical multicall children expose bounded authority candidates without claiming context or emitting calldata',()=>{
 const approval=encode('approve',[spender,maxUint256]),transfer=encode('transfer',[account,100n]),data=multicall([approval,transfer]);
 const req=request(data),op=decodeRequest(req),facts=batchEvidence(req,op);
 assert.equal(op.decoded,false,'Wrapper shape alone is not a decoded execution.');
 assert.equal(facts.find(f=>f.id==='batch_execution_context')?.status,'unknown');
 assert.equal(child(facts,'0.0').data?.target,wrapper);
 assert.equal(child(facts,'0.0').data?.valueWei,null,'Generic multicall ABI does not define per-child value routing.');
 assert.equal(child(facts,'0.0').data?.category,'approval');
 assert.deepEqual(child(facts,'0.0').data?.parameters,{spender,amountOrTokenId:String(maxUint256),unlimited:true});
 assert.equal((child(facts,'0.0').data?.authority as any).addsPermissionCandidate,true);
 assert.equal((child(facts,'0.0').data?.authority as any).tokenStandardCandidate,'ambiguous');
 assert.equal(child(facts,'0.1').data?.category,'token_transfer');
 assert.equal(child(facts,'0.1').data?.childSenderVerified,false);
 assert.equal(child(facts,'0.1').data?.childOwnerVerified,false);
 assert.ok(!JSON.stringify(facts).includes(approval));assert.ok(!JSON.stringify(facts).includes(transfer));
 assert.ok(facts.every(f=>f.status!=='pass'),'Structural extraction cannot certify execution or identity.');
});

test('deadline multicall and nested paths are extracted while the recursion ceiling remains explicit',()=>{
 const leaf=encode('transfer',[account,1n]);
 const deadline=encode('multicall',[2000000000n,[multicall([leaf])]]),facts=inspect(deadline);
 assert.equal(facts.find(f=>f.id==='batch_structure')?.data?.deadline,'2000000000');
 assert.equal(child(facts,'0.0').data?.wrapperEncodingRecognized,true);
 assert.equal(child(facts,'0.0').data?.abiShapeDecoded,false);
 assert.equal(child(facts,'0.0.0').data?.category,'token_transfer');
 let deep=leaf;for(let i=0;i<5;i++)deep=multicall([deep]);
 const bounded=inspect(deep);
 assert.equal(bounded.filter(f=>f.id.startsWith('batch_child_')).length,BATCH_LIMITS.depth);
 assert.ok(bounded.some(f=>f.data?.reason==='depth_limit'));
 assert.ok(!bounded.some(f=>f.data?.path==='0.0.0.0.0'));
});

test('Safe and packed MultiSend operation modes reveal delegatecall authority but never include signatures',()=>{
 const approval=encode('approve',[spender,100n]),second=encode('transfer',[account,1n]);
 const raw=(packed(0,token,2n,approval)+packed(1,spender,999n,second).slice(2)) as `0x${string}`;
 const multi=encode('multiSend',[raw]),secret=('0x'+'ab'.repeat(65)) as `0x${string}`;
 const safe=encode('execTransaction',[token,7n,multi,1,21000n,100n,2n,zeroAddress,spender,secret]),facts=inspect(safe);
 assert.equal(facts.find(f=>f.id==='batch_structure')?.data?.signatureBytes,65);
 assert.equal(facts.find(f=>f.id==='batch_structure')?.data?.signaturesVerified,false);
 assert.equal(child(facts,'0.0').status,'risk');
 assert.equal(child(facts,'0.0').data?.callType,'DELEGATECALL');
 assert.equal(child(facts,'0.0').data?.valueWei,null);
 assert.equal(child(facts,'0.0').data?.encodedValueWei,'7');
 assert.equal(child(facts,'0.0').data?.encodedValueIgnoredByDelegatecall,true);
 assert.equal(child(facts,'0.0.0').data?.target,token);
 assert.equal(child(facts,'0.0.0').data?.valueWei,'2');
 assert.equal(child(facts,'0.0.1').status,'risk');
 assert.equal(child(facts,'0.0.1').data?.valueWei,null);
 assert.equal(child(facts,'0.0.1').data?.encodedValueWei,'999');
 assert.ok(!JSON.stringify(facts).includes(secret));assert.ok(!JSON.stringify(facts).includes(multi));
});

test('noncanonical ABI offsets, padding and trailing bytes are explicit gaps rather than accepted child success',()=>{
 const valid=multicall([('0x12') as `0x${string}`]);
 const offset=(valid.slice(0,10)+toHex(64n,{size:32}).slice(2)+valid.slice(74)) as `0x${string}`;
 const padding=(valid.slice(0,-2)+'01') as `0x${string}`;
 for(const data of [offset,padding,(valid+'00') as `0x${string}`]) {
  const facts=inspect(data);assert.ok(facts.some(f=>f.data?.reason==='malformed'));
  assert.equal(facts.filter(f=>f.id.startsWith('batch_child_')).length,0);
 }
 const malformedPacked=encode('multiSend',[('0x'+'00'.repeat(84)) as `0x${string}`]);
 assert.ok(inspect(malformedPacked).some(f=>f.data?.reason==='malformed'));
 const invalidLength=(toHex(0,{size:1})+token.slice(2)+toHex(0,{size:32}).slice(2)+toHex(maxUint256,{size:32}).slice(2)) as `0x${string}`;
 assert.ok(inspect(encode('multiSend',[invalidLength])).some(f=>f.data?.reason==='malformed'));
});

test('unsupported packed/Safe operation modes are unknown; packed zero-address semantics are not guessed',()=>{
 const unknownOperation=encode('multiSend',[packed(2,token,0n,'0x')]);
 assert.ok(inspect(unknownOperation).some(f=>f.data?.reason==='unsupported_operation'));
 const safe=encode('execTransaction',[token,0n,'0x',2,0n,0n,0n,zeroAddress,zeroAddress,'0x']);
 assert.ok(inspect(safe).some(f=>f.data?.reason==='unsupported_operation'));
 const opaqueDelegate=inspect(encode('multiSend',[packed(1,token,0n,'0xdeadbeef')]));
 assert.equal(child(opaqueDelegate,'0.0').status,'risk');
 assert.ok(opaqueDelegate.some(f=>f.data?.reason==='unknown_child'&&f.data?.path==='0.0'));
 const zero=inspect(encode('multiSend',[packed(0,zeroAddress,0n,'0x')]));
 assert.equal(child(zero,'0.0').data?.target,null);
 assert.equal(child(zero,'0.0').data?.zeroTargetSemanticsUnverified,true);
 assert.equal(child(zero,'0.0').status,'unknown');
});

test('the entry count is global across nesting and over-limit children remain explicit',()=>{
 const leaf=encode('transfer',[account,1n]);
 const facts=inspect(multicall(Array.from({length:33},()=>leaf)));
 assert.equal(facts.filter(f=>f.id.startsWith('batch_child_')).length,32);
 assert.ok(facts.some(f=>f.data?.reason==='entry_limit'));
 const nested=inspect(multicall([multicall(Array.from({length:40},()=>leaf)),leaf]));
 assert.equal(nested.filter(f=>f.id.startsWith('batch_child_')).length,32);
 assert.ok(nested.some(f=>f.data?.reason==='entry_limit'));
 assert.ok(!nested.some(f=>f.data?.path==='0.1'));
});

test('body and aggregate recursive byte budgets stop inspection without exposing opaque data',()=>{
 const large=multicall([('0x'+'12'.repeat(BATCH_LIMITS.bodyBytes)) as `0x${string}`]);
 assert.ok(inspect(large).some(f=>f.data?.reason==='body_limit'));
 let nested=('0x'+'12'.repeat(9000)) as `0x${string}`;for(let i=0;i<3;i++)nested=multicall([nested]);
 const facts=inspect(nested);assert.ok(facts.some(f=>f.data?.reason==='byte_limit'));
 assert.ok(Number(facts.find(f=>f.id==='batch_inventory')?.data?.recursivelyInspectedBytes)<=BATCH_LIMITS.totalBytes);
 assert.ok(!JSON.stringify(facts).includes('12'.repeat(100)));
});

test('unknown child methods, unsupported wrappers and truncated field arrays retain explicit unknowns',()=>{
 assert.equal(child(inspect(multicall(['0xdeadbeef'])),'0.0').status,'unknown');
 const execute=encode('execute',['0x00',['0xdeadbeef'],100n]);
 const unsupported=inspect(execute);assert.ok(unsupported.some(f=>f.data?.reason==='unsupported_wrapper'));
 const ids=Array.from({length:17},(_,i)=>BigInt(i));
 const nft=encode('safeBatchTransferFrom',[account,spender,ids,ids.map(()=>1n),'0x']);
 const truncated=inspect(multicall([nft]));
 assert.equal((child(truncated,'0.0').data?.parameters as any).ids.length,16);
 assert.equal(child(truncated,'0.0').data?.parametersTruncated,true);
 assert.ok(truncated.some(f=>f.data?.reason==='parameter_limit'));
 assert.deepEqual(inspect(encode('transfer',[account,1n])),[]);
 const signature:SecurityRequest={kind:'signature',chainId:1,signature:{from:account,method:'personal_sign',data:'hello'}};
 assert.deepEqual(batchEvidence(signature,decodeRequest(signature)),[]);
});

test('sender-derived child defaults and unknown native input values are not invented as encoded parameters',()=>{
 const deposit=encode('depositETH',[0,'0x']);
 const swap=encode('swapExactETHForTokens',[0n,[token,spender],account,2000000000n]);
 const facts=inspect(multicall([deposit,swap]));
 assert.equal((child(facts,'0.0').data?.parameters as any).recipient,undefined);
 assert.equal((child(facts,'0.1').data?.parameters as any).amountIn,undefined);
 const empty=inspect(multicall([]));
 assert.equal(empty.find(f=>f.id==='batch_structure')?.data?.declaredChildren,0);
 assert.equal(empty.find(f=>f.id==='batch_execution_context')?.status,'unknown');
});
