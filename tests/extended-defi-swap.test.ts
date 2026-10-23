import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeFunctionData,encodeFunctionResult,keccak256,parseAbi,type Abi,type Address,type Hex} from 'viem';
import {decodeRequest} from '../src/security/decode.js';
import {V3_EXPERIMENT_ABI,MAX_V3_EXPERIMENT_HOPS,decodePackedV3Path,encodePackedV3Path,swapExperiment,reverseSwapCalldata} from '../src/security/swap-experiments.js';
import {swapFundingBinding} from '../src/security/swap-trust.js';
import {captureForkProtocolState,forkProtocolEvidence} from '../src/security/fork-protocol-state.js';
import {positionPoolEvidence} from '../src/security/position-pool.js';
import type {SecurityConfig} from '../src/security/config.js';
import type {SecurityRequest,Operation} from '../src/security/types.js';
import type {ForkSession} from '../src/security/simulation.js';

const at=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const caller=at(11),receiver=at(12),router=at(13),input=at(14),middle=at(15),output=at(16),pool=at(17),factory=at(18),hash=`0x${'ab'.repeat(32)}`,runtime='0x6000' as Hex;
const config:SecurityConfig={apiKey:'',model:'not-called',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{}};
type Transaction=Extract<SecurityRequest,{kind:'transaction'}>;
function v3(method:string,deadline:boolean,native=false):Transaction{
 const single=method.endsWith('Single'),exactOutput=method.startsWith('exactOutput'),tokens=[input,middle,output],fees=[500,3000];
 const abi=V3_EXPERIMENT_ABI.filter(item=>item.name===method&&item.inputs[0].components.some(field=>field.name==='deadline')===deadline) as Abi;
 const params={...(single?{tokenIn:input,tokenOut:output,fee:3000,sqrtPriceLimitX96:42n}:{path:encodePackedV3Path(exactOutput?[...tokens].reverse():tokens,exactOutput?[...fees].reverse():fees)}),recipient:caller,...(deadline?{deadline:2000000000n}:{}),...(exactOutput?{amountOut:80n,amountInMaximum:150n}:{amountIn:100n,amountOutMinimum:1n})};
 return {kind:'transaction',chainId:31337,transaction:{from:caller,to:router,data:encodeFunctionData({abi,functionName:method,args:[params]}),value:native?'0x64':'0x0',nonce:'0x5',gas:'0xf4240',maxFeePerGas:'0x64',maxPriorityFeePerGas:'0x1'}};
}
test('all eight canonical V3 forms normalize forward token/fee direction and reverse acquired output without reusing exact-output caps',()=>{
 for(const method of ['exactInputSingle','exactOutputSingle','exactInput','exactOutput'])for(const deadline of [true,false]){
  const request=v3(method,deadline),operation=decodeRequest(request);assert.equal(operation.category,'swap_v3');const route=swapExperiment(request,operation);assert.ok(route);
  assert.equal(route.input.toLowerCase(),input);assert.equal(route.output.toLowerCase(),output);assert.equal(route.deadlinePresent,deadline);assert.equal(route.exactOutput,method.startsWith('exactOutput'));assert.equal(route.declaredInput,route.exactOutput?150n:100n);assert.equal(route.requestedOutput,route.exactOutput?80n:undefined);
  const data=reverseSwapCalldata(route,73n,caller),decoded=decodeFunctionData({abi:V3_EXPERIMENT_ABI,data}),p=(decoded.args as any)[0];
  assert.equal(decoded.functionName,method.endsWith('Single')?'exactInputSingle':'exactInput');assert.equal(p.amountIn,73n);assert.equal(p.amountOutMinimum,0n);assert.equal(p.recipient.toLowerCase(),caller.toLowerCase());assert.equal(p.deadline,deadline?2000000000n:undefined);
  if(method.endsWith('Single')){assert.equal(p.tokenIn.toLowerCase(),output.toLowerCase());assert.equal(p.tokenOut.toLowerCase(),input.toLowerCase());assert.equal(p.fee,3000);assert.equal(p.sqrtPriceLimitX96,0n);}
  else assert.deepEqual(decodePackedV3Path(p.path),{tokens:[output,middle,input],fees:[3000,500]});
 }
});
test('malformed, over-limit and cyclic packed routes do not become accepted experiments; router-balance zero remains unsupported',()=>{
 const path=encodePackedV3Path([input,middle,output],[500,3000]);assert.equal(decodePackedV3Path(path+'00'),null);assert.equal(decodePackedV3Path('0x1234'),null);
 const over='0x'+at(100).slice(2)+Array.from({length:MAX_V3_EXPERIMENT_HOPS+1},(_,i)=>'0001f4'+at(101+i).slice(2)).join('');assert.equal(decodePackedV3Path(over),null);
 const request=v3('exactInput',false),decoded=decodeFunctionData({abi:V3_EXPERIMENT_ABI,data:request.transaction.data as Hex}),p=(decoded.args as any)[0],abi=V3_EXPERIMENT_ABI.filter(item=>item.name==='exactInput'&&!item.inputs[0].components.some(field=>field.name==='deadline')) as Abi;
 for(const params of [{...p,amountIn:0n},{...p,path:encodePackedV3Path([input,middle,input],[500,3000])}]){const invalid={...request,transaction:{...request.transaction,data:encodeFunctionData({abi,functionName:'exactInput',args:[params]})}};assert.equal(swapExperiment(invalid,decodeRequest(invalid)),null);}
 assert.throws(()=>encodePackedV3Path([input,output],[2**24]));
});

function trustedConfig():SecurityConfig{return {...config,trustedDeployments:[{chainId:31337,address:router,protocol:'uniswap-v3',version:'swap-router-02',role:'router',codeHash:keccak256(runtime),sourceUrl:'https://source.example/router'},{chainId:31337,address:input,protocol:'wrapped-native',version:'fixture',role:'wrapped_native',codeHash:keccak256(runtime),sourceUrl:'https://source.example/wrapper'}]};}
function bindingFork(options:{badCode?:boolean;wrongWrapper?:boolean;fail?:boolean}={}):ForkSession{
 return {chainId:31337,blockNumber:'40',blockHash:hash,blockTimestampSeconds:'1900000000',close:async()=>{},rpc:async(method,params=[])=>{
  assert.ok(['eth_getCode','eth_getStorageAt','eth_call','eth_getBlockByNumber'].includes(method),'Funding checks must be read-only.');if(options.fail)throw Error('SENSITIVE RPC URL');
  if(method==='eth_getCode')return options.badCode?'0x6001':runtime;
  if(method==='eth_getBlockByNumber')return {number:'0x29',hash,timestamp:'0x713fb300'};
  if(method==='eth_call')return encodeFunctionResult({abi:parseAbi(['function WETH9() view returns(address)']),functionName:'WETH9',result:options.wrongWrapper?middle:input});
  return `0x${'0'.repeat(64)}`;
 }};
}
test('native funding requires both maintained code bindings and router-wrapper association; sentinel resolution needs an explicit matched version',async()=>{
 const request=v3('exactInputSingle',false,true),route=swapExperiment(request,decodeRequest(request))!;
 assert.equal((await swapFundingBinding(request,route,config,bindingFork())).allowed,false);
 assert.equal((await swapFundingBinding(request,route,trustedConfig(),bindingFork())).allowed,true);
 assert.equal((await swapFundingBinding(request,route,trustedConfig(),bindingFork({badCode:true}))).allowed,false);
 assert.equal((await swapFundingBinding(request,route,trustedConfig(),bindingFork({wrongWrapper:true}))).allowed,false);
 const missing=trustedConfig();missing.trustedDeployments=missing.trustedDeployments!.slice(0,1);assert.equal((await swapFundingBinding(request,route,missing,bindingFork())).allowed,false);
 const unavailable=await swapFundingBinding(request,route,trustedConfig(),bindingFork({fail:true}));assert.equal(unavailable.allowed,false);assert.ok(!unavailable.reason?.includes('SENSITIVE'));
 const alias={...route,nativeInput:false,recipient:at(1)};assert.equal((await swapFundingBinding(request,alias,trustedConfig(),bindingFork(),'current')).binding?.recipientResolution,'matched_swap_router_02_sender_sentinel');const wrong=trustedConfig();wrong.trustedDeployments![0].version='unknown';assert.equal((await swapFundingBinding(request,alias,wrong,bindingFork())).allowed,false);
});

const stateAbi=parseAbi(['function asset() view returns(address)','function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)','function totalAssets() view returns(uint256)','function totalSupply() view returns(uint256)','function allowance(address,address) view returns(uint256)','function maxWithdraw(address) view returns(uint256)','function maxRedeem(address) view returns(uint256)','function previewDeposit(uint256) view returns(uint256)','function getUserAccountData(address) view returns(uint256,uint256,uint256,uint256,uint256,uint256)']);
const base={chainId:31337,blockNumber:'40',blockHash:hash,blockTimestampSeconds:'1900000000'};
function stateRpc(kind:'vault'|'lending',options:{afterFailure?:boolean;changedAsset?:boolean;changedDecimals?:boolean;missingAfterHeader?:boolean;partialAfterHeader?:boolean}={}){
 const calls:{method:string;params:any[]}[]=[];
 const rpc=async(method:string,params:any[]=[])=>{
  calls.push({method,params});assert.ok(['eth_getBlockByNumber','eth_call'].includes(method));const after=params[0]==='0x29'||params[1]==='0x29';
  if(method==='eth_getBlockByNumber'){if(after&&options.missingAfterHeader)throw Error('Missing header');return {number:after?'0x29':'0x28',...(!after||!options.partialAfterHeader?{timestamp:'0x713fb300',hash}:{})};}
  const call=params[0],decoded=decodeFunctionData({abi:stateAbi,data:call.data}),args=decoded.args as readonly any[]|undefined;let result:any;
  assert.equal(call.from,caller);assert.ok(['0x28','0x29'].includes(params[1]),'All phase reads must use its pinned block.');
  if(decoded.functionName==='asset')result=after&&options.changedAsset?output:input;
  else if(decoded.functionName==='decimals')result=call.to.toLowerCase()===router.toLowerCase()?(after&&options.changedDecimals?6:18):6;
  else if(decoded.functionName==='getUserAccountData'){if(after&&options.afterFailure)throw Error('Unavailable account data');result=[1000n,after?900n:100n,after?0n:400n,8000n,7500n,after?800000000000000000n:8000000000000000000n];}
  else if(decoded.functionName==='balanceOf'){if(call.to.toLowerCase()===router.toLowerCase())result=args![0].toLowerCase()===receiver.toLowerCase()?(after?110n:20n):10n;else result=args![0].toLowerCase()===caller.toLowerCase()?(after?400n:500n):200n;}
  else if(decoded.functionName==='totalAssets')result=after?1100n:1000n;
  else if(decoded.functionName==='totalSupply')result=after?990n:900n;
  else if(decoded.functionName==='allowance')result=after?900n:1000n;
  else if(decoded.functionName==='maxWithdraw')result=100n;else if(decoded.functionName==='maxRedeem')result=10n;else if(decoded.functionName==='previewDeposit')result=90n;else throw Error('Unexpected getter');
  return encodeFunctionResult({abi:stateAbi as Abi,functionName:decoded.functionName,result});
 };
 const request:Transaction={kind:'transaction',chainId:31337,transaction:{from:caller,to:router,data:'0x'}};
 const op:Operation={category:kind,label:'fixture',decoded:true,targets:[],fields:kind==='vault'?{action:'deposit',amount:'100',receiver}:{action:'borrow',asset:input,onBehalfOf:caller,amount:'800'}};
 return {rpc,request,op,calls};
}
test('actual fork-phase vault reads separate caller assets and receiver shares, retain units/preview/allowance, and never invent dollar amounts',async()=>{
 const fixture=stateRpc('vault'),before=await captureForkProtocolState(fixture.rpc,fixture.request,fixture.op,'before',base,'0x28'),after=await captureForkProtocolState(fixture.rpc,fixture.request,fixture.op,'after',base,'0x29'),facts=forkProtocolEvidence(before,after);
 assert.equal(before?.values.receiverSharesRaw,'20');assert.equal(after?.values.receiverSharesRaw,'110');assert.equal(after?.values.ownerSharesRaw,'10');assert.equal(before?.values.requestPreviewRaw,'90');
 const changed=facts.find(check=>check.id==='fork_vault_change')!;assert.equal(changed.status,'pass');assert.equal((changed.data?.differences as any).receiverSharesRaw,'90');assert.equal((changed.data?.differences as any).callerUnderlyingRaw,'-100');assert.equal((changed.data?.differences as any).callerUnderlyingAllowanceToVaultRaw,'-100');assert.equal(changed.data?.identityVerified,false);assert.equal(changed.data?.simulationOnly,true);assert.ok(!JSON.stringify(facts).includes('usdValue'));
});
test('post-fork lending health is observed rather than forecast, and partial failures/header or asset changes preserve independent facts',async()=>{
 const lending=stateRpc('lending'),before=await captureForkProtocolState(lending.rpc,lending.request,lending.op,'before',base,'0x28'),after=await captureForkProtocolState(lending.rpc,lending.request,lending.op,'after',base,'0x29'),facts=forkProtocolEvidence(before,after);
 assert.equal(facts.find(check=>check.id==='fork_lending_health')?.status,'risk');assert.equal(after?.values.totalDebtBaseRaw,'900');assert.equal((facts.find(check=>check.id==='fork_lending_change')?.data?.differences as any).totalDebtBaseRaw,'800');
 const partial=stateRpc('lending',{afterFailure:true,missingAfterHeader:true}),partialAfter=await captureForkProtocolState(partial.rpc,partial.request,partial.op,'after',base,'0x29'),partialFacts=forkProtocolEvidence(before,partialAfter);assert.equal(partialFacts.find(check=>check.id==='fork_lending_after')?.status,'unknown');assert.equal(partialAfter?.values.callerUnderlyingRaw,'400');assert.equal(partialAfter?.snapshot.blockHash,undefined);assert.equal(partialAfter?.snapshot.blockNumber,'41');assert.ok(!partialFacts.some(check=>check.id==='fork_lending_health'));
 const partialHeader=stateRpc('lending',{partialAfterHeader:true}),headerAfter=await captureForkProtocolState(partialHeader.rpc,partialHeader.request,partialHeader.op,'after',base,'0x29');assert.equal(headerAfter?.snapshot.blockHash,undefined);assert.equal(headerAfter?.snapshot.blockTimestampSeconds,undefined);assert.equal(headerAfter?.snapshot.baseBlockHash,hash);assert.equal(headerAfter?.values.totalDebtBaseRaw,'900');
 const changed=stateRpc('vault',{changedAsset:true,changedDecimals:true}),changedBefore=await captureForkProtocolState(changed.rpc,changed.request,changed.op,'before',base,'0x28'),changedAfter=await captureForkProtocolState(changed.rpc,changed.request,changed.op,'after',base,'0x29'),delta=forkProtocolEvidence(changedBefore,changedAfter).find(check=>check.id==='fork_vault_change')!;assert.equal(delta.status,'unknown');assert.equal((delta.data?.differences as any).callerUnderlyingRaw,undefined);assert.equal((delta.data?.differences as any).receiverSharesRaw,undefined);
});

test('candidate pool tick/liquidity and binding checks preserve partial observations without authenticating price or deployment',async()=>{
 const abi=parseAbi(['function factory() view returns(address)','function getPool(address,address,uint24) view returns(address)','function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)','function liquidity() view returns(uint128)']);
 let missingSlot=false,mismatch=false;const calls:any[]=[];
 const client={getCode:async()=>runtime,readContract:async(params:any)=>{calls.push(params);assert.equal(params.blockNumber,40n);switch(params.functionName){case'factory':return factory;case'getPool':return pool;case'token0':return input;case'token1':return mismatch?middle:output;case'fee':return 3000;case'liquidity':return 1234n;case'slot0':if(missingSlot)throw Error('No slot');return [2n**96n,-5,0,12,16,0,true];default:throw Error('Unknown getter');}}};
 const full=(await positionPoolEvidence(client,router,input,output,'3000',{lower:'-120',upper:'120'},40n,base))[0];assert.equal(full.status,'pass');assert.equal(full.data?.currentTick,'-5');assert.equal(full.data?.withinDeclaredTickRange,true);assert.equal(full.data?.activeLiquidityRaw,'1234');assert.equal(full.data?.interfaceBindingConsistent,true);assert.equal(full.data?.identityVerified,false);assert.equal(full.data?.priceQuoteEstablished,false);
 missingSlot=true;const partial=(await positionPoolEvidence(client,router,input,output,'3000',{},40n,base))[0];assert.equal(partial.status,'unknown');assert.equal(partial.data?.currentTick,undefined);assert.equal(partial.data?.activeLiquidityRaw,'1234');missingSlot=false;mismatch=true;assert.equal((await positionPoolEvidence(client,router,input,output,'3000',{},40n,base))[0].status,'warning');assert.ok(calls.length>0);assert.ok(abi.length>0);
});
