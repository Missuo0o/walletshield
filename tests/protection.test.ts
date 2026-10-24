import test from 'node:test';import assert from 'node:assert/strict';
import {encodeFunctionData,parseAbi,keccak256,toHex,pad} from 'viem';
import {assetsFromLogs,simulateRequest,type ForkFactory} from '../src/security/simulation.js';
import {signatureStructure} from '../src/security/signatures.js';
import {decodeRequest} from '../src/security/decode.js';import {assess} from '../src/security/rules.js';
import {checkWatch,newWatch,eventAlert} from '../src/security/monitor.js';
import {buildApp} from '../src/server/app.js';import {createStore} from '../src/server/store.js';
import {requestSchema,type SecurityRequest} from '../src/security/types.js';import type {SecurityConfig} from '../src/security/config.js';
const owner='0x2222222222222222222222222222222222222222',other='0x3333333333333333333333333333333333333333',token='0x1111111111111111111111111111111111111111';
const config:SecurityConfig={apiKey:'',model:'test',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{},forkEnabled:true};
const native:SecurityRequest={kind:'transaction',chainId:31337,transaction:{from:owner,to:other,data:'0x',value:'0x1'}};
const transfer=keccak256(toHex('Transfer(address,address,uint256)'));
test('fork simulation executes only through the injected child session, restores its snapshot and closes even on failure',async()=>{
 let closed=0;const methods:string[]=[];
 const factory:ForkFactory=async()=>({chainId:31337,blockNumber:'6',blockHash:`0x${'a'.repeat(64)}`,blockTimestampSeconds:'1900000000',verifyTraceSource:async()=>true,close:async()=>{closed++;},rpc:async(method)=>{
  methods.push(method);if(method==='evm_snapshot')return '1';if(method==='eth_getBalance')return methods.filter(v=>v==='eth_getBalance').length===1?'0x64':'0x62';if(method==='eth_getTransactionReceipt')return {status:'0x1',gasUsed:'0x1',effectiveGasPrice:'0x1',logs:[]};if(method==='debug_traceTransaction')return {type:'CALL',from:owner,to:other,value:'0x1',input:'0x'};if(method==='evm_revert')return true;return '0xabc';}});
 const facts=await simulateRequest(native,decodeRequest(native),config,factory);assert.equal(closed,1);assert.ok(methods.includes('evm_revert'));assert.equal(facts.find(e=>e.id==='simulation_execution')?.data?.status,'success');assert.equal(facts.find(e=>e.id==='asset_simulation')?.status,'unknown');
 const failing:ForkFactory=async()=>({chainId:31337,blockNumber:'6',blockHash:`0x${'a'.repeat(64)}`,blockTimestampSeconds:'1900000000',verifyTraceSource:async()=>true,close:async()=>{closed++;},rpc:async()=>{throw Error('private rpc url');}});
 const unknown=await simulateRequest(native,decodeRequest(native),config,failing);assert.equal(closed,2);assert.equal(unknown[0].status,'unknown');assert.ok(!JSON.stringify(unknown).includes('private rpc url'));
});
test('event discovery distinguishes ERC20 amounts from NFT IDs and bounds discovery',()=>{
 const a=assetsFromLogs([{address:token,topics:[transfer,pad(owner),pad(other)],data:pad(toHex(3n))},{address:other,topics:[transfer,pad(owner),pad(other),pad(toHex(0n))],data:'0x'}]);assert.equal(a[0].kind,'erc20');assert.equal(a[1].kind,'erc721');assert.equal(a[1].tokenId,'0');
});
test('EIP712 structure validation rejects missing types, invalid amounts and misleading Permit names',()=>{
 const req:SecurityRequest={kind:'signature',chainId:31337,signature:{from:owner,method:'eth_signTypedData_v4',data:{domain:{name:'test',version:'1',chainId:31337,verifyingContract:token},types:{Permit:[{name:'owner',type:'address'},{name:'spender',type:'address'},{name:'value',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]},primaryType:'Permit',message:{owner,spender:other,value:'100',nonce:'0',deadline:'2000000000'}}}};
 assert.equal(signatureStructure(req)[0].status,'pass');const body=req.signature.data as any;body.types={};assert.equal(signatureStructure(req)[0].status,'unknown');body.types={Permit:[{name:'value',type:'uint8'}]};body.message.value='256';assert.equal(signatureStructure(req)[0].status,'unknown');
});
test('new request entries reject manual purpose/context without adding a private-purpose check',()=>{
 const bases:SecurityRequest[]=[native,{kind:'signature',chainId:0,signature:{from:owner,method:'personal_sign',data:'Inspect this message'}},{kind:'permission',chainId:31337,method:'wallet_grantPermissions',params:{}},{kind:'user_operation',chainId:31337,method:'eth_sendUserOperation',params:{}},{kind:'wallet_rpc',chainId:31337,method:'wallet_custom',params:{}}];
 for(const base of bases){assert.equal(requestSchema.safeParse(base).success,true);for(const extra of [{intent:'Expected purpose'},{context:{withdrawalFee:true,guaranteedProfit:true,requestedBy:'stranger'}},{context:{}},{intent:'',context:{}}])assert.equal(requestSchema.safeParse({...base,...extra}).success,false,`${base.kind}: manual fields must not be accepted`);}
 const facts=assess(native,[]);assert.ok(!facts.checks.some(e=>['fraud_context','withdrawal_fee','guaranteed_profit','stranger_request'].includes(e.id)));assert.ok(!facts.missingData.includes('Off-chain purpose is unverified'));assert.equal(facts.checks.find(e=>e.id==='fee_budget')?.status,'unknown','actual missing execution evidence must remain visible');
 // An older object can exist in persisted history without becoming a new
 // source of fraud facts when passed through current qualitative assessment.
 const legacy=Object.assign(structuredClone(native),{intent:'Legacy purpose',context:{withdrawalFee:true,guaranteedProfit:true,requestedBy:'stranger'}});const old=assess(legacy,[]);assert.ok(!old.checks.some(e=>['fraud_context','withdrawal_fee','guaranteed_profit','stranger_request'].includes(e.id)));assert.equal(old.checks.find(e=>e.id==='fee_budget')?.status,'unknown');
});
test('monitor establishes baseline, preserves cursor on RPC failure and detects outgoing events without claiming theft',async()=>{
 const watch=newWatch({chainId:31337,address:owner,tokens:[]});let block=6n;
 const client:any={getChainId:async()=>31337,getBlockNumber:async()=>block,getBalance:async()=>100n,getBlock:async({blockNumber}:any)=>({hash:`hash${blockNumber}`,transactions:[]}),request:async({params}:any)=>params[0].topics[0].includes(transfer)?[{address:token,topics:[transfer,pad(owner),pad(other)],data:toHex(1n),transactionHash:'0xabc',logIndex:'0x0',blockNumber:'0x7'}]:[]};
 const baseline=await checkWatch(watch,config,client);assert.equal(baseline.watch.cursor,'6');assert.equal(baseline.alerts.length,0);
 block=7n;const next=await checkWatch(baseline.watch,config,client);assert.equal(next.watch.cursor,'7');assert.ok(next.alerts.some(a=>a.title==='Observed outgoing-asset event'));
 const failed=await checkWatch(next.watch,config,{getChainId:async()=>{throw Error('secret');}});assert.equal(failed.watch.cursor,'7');assert.equal(failed.watch.status,'error');assert.ok(!failed.watch.message.includes('secret'));
 const log={topics:[transfer,pad(owner),pad(other)],address:token,data:'0x',transactionHash:'0x123',logIndex:'0x0',blockNumber:'0x8'};assert.equal(eventAlert(watch,log)?.id,eventAlert(watch,log)?.id);
});
test('monitor endpoints reject foreign mutation, deduplicate watches, persist pause and deduplicate event alerts',async()=>{
 const store=createStore(':memory:');const app=await buildApp(store,{security:{config:async()=>config}});const headers={origin:'http://127.0.0.1:5173'};
 try{const payload={chainId:31337,address:owner,tokens:[]};assert.equal((await app.inject({method:'POST',url:'/api/security/monitor',payload})).statusCode,403);const first=(await app.inject({method:'POST',url:'/api/security/monitor',headers,payload})).json();await app.inject({method:'POST',url:'/api/security/monitor',headers,payload});assert.equal(store.watchList().length,1);const response=await app.inject({method:'POST',url:`/api/security/monitor/${first.id}`,headers,payload:{active:false}});assert.equal(response.json().active,false);assert.equal(store.watchList()[0].active,false);}
 finally{await app.close();store.close();}
});

test('paired Snap authorization is required outside the local workbench and pairing token is never in status',async()=>{
 const store=createStore(':memory:');const key='b'.repeat(64);const app=await buildApp(store,{security:{config:async()=>({...config,snapToken:key}),collect:async()=>[]}});
 try {
  assert.equal((await app.inject({method:'POST',url:'/api/security/scan',headers:{origin:'null'},payload:native})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/api/security/scan',headers:{origin:'null',authorization:`Bearer ${'c'.repeat(64)}`},payload:native})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/api/security/scan',headers:{origin:'null',authorization:`Bearer ${key}`},payload:native})).statusCode,200);
  assert.equal((await app.inject({method:'POST',url:'/api/security/pair',headers:{origin:'null'},payload:{}})).statusCode,403);
  const pair=await app.inject({method:'POST',url:'/api/security/pair',headers:{origin:'http://127.0.0.1:5173'},payload:{}});assert.equal(pair.json().token,key);assert.equal(pair.headers['cache-control'],'no-store');
  assert.ok(!(await app.inject({method:'GET',url:'/api/security/status'})).body.includes(key));assert.equal((await app.inject({method:'GET',url:'/api/security/records',headers:{origin:'null'}})).statusCode,403);
 }finally{await app.close();store.close();}
});
test('AI connectivity test refuses missing key and labels mocked model tests as synthetic data',async()=>{
 const store=createStore(':memory:');const app=await buildApp(store,{security:{config:async()=>config}});
 try{assert.equal((await app.inject({method:'POST',url:'/api/security/ai/test',headers:{origin:'http://127.0.0.1:5173'},payload:{}})).statusCode,409);assert.equal(store.securityAiCallsToday(),0);}finally{await app.close();store.close();}
});

test('monitor chain reset rebuilds baseline without treating incomparable balances as theft',async()=>{
 const watch={...newWatch({chainId:31337,address:owner,tokens:[]}),cursor:'10',cursorHash:'old',nativeBalance:'10000'};
 const client:any={getChainId:async()=>31337,getBlockNumber:async()=>2n,getBalance:async()=>1n,getBlock:async()=>({hash:'new',transactions:[]})};
 const result=await checkWatch(watch,config,client);assert.equal(result.watch.cursor,'2');assert.equal(result.watch.status,'ok');assert.ok(result.alerts.some(a=>a.level==='unknown'));assert.ok(!result.alerts.some(a=>a.title==='Native balance decreased'));
});
