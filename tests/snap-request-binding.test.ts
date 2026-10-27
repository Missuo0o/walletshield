import test from 'node:test';
import assert from 'node:assert/strict';
import {reportMatchesRequest} from '../snap/src/request-binding.js';
import {onTransaction,onSignature} from '../snap/src/index.js';
import {assess} from '../src/security/rules.js';
import {executionLimitations} from '../src/security/transaction-fields.js';
import type {SecurityRequest} from '../src/security/types.js';
import {buildApp} from '../src/server/app.js';
import {createStore} from '../src/server/store.js';
const from=`0x${'1'.repeat(40)}`,to=`0x${'a'.repeat(40)}`,other=`0x${'3'.repeat(40)}`;
const tx=()=>({kind:'transaction',chainId:1,origin:'https://dapp.example',transaction:{from,to,data:'0xABCD',value:'0x01',gas:'0x5208',maxFeePerGas:'0x10',maxPriorityFeePerGas:'0x1',nonce:'0x0'}} as const);
const typed=()=>({kind:'signature',chainId:0,origin:'https://dapp.example',signature:{from,method:'eth_signTypedData_v4',data:{domain:{chainId:1,name:'Fixture'},types:{Message:[{name:'amount',type:'uint256'}]},primaryType:'Message',message:{amount:'1'}},providerContext:{chainId:1,observedAt:'2026-10-26T12:00:00.000Z',source:'snap-provider'}}} as const);

test('request comparison preserves all transaction semantics while accepting harmless backend quantity/address/marker normalization',()=>{
 const original=tx(),same=structuredClone(original) as any;same.transaction.to=to.toUpperCase().replace('0X','0x');same.transaction.data='0xabcd';same.transaction.value='0x1';same.transaction.gas='0x05208';same.transaction.unsupportedFields=[];
 assert.equal(reportMatchesRequest(original,same),true);
 const special:any={...tx(),transaction:{...tx().transaction,type:'0x4',authorizationList:[{chainId:'0x01',address:to,nonce:'0x0',yParity:'0x0',r:'0x1',s:'0x2'}]}};
 const normalized=structuredClone(special);normalized.transaction.unsupportedFields=executionLimitations(normalized.transaction).reverse();normalized.transaction.authorizationList[0].chainId='0x1';assert.equal(reportMatchesRequest(special,normalized),true);
 normalized.transaction.authorizationList[0].address=other;assert.equal(reportMatchesRequest(special,normalized),false);
});
test('missing echoes, wrong kind/network/origin/sender/target/value/calldata/gas/fees/nonce or unsupported markers never match',()=>{
 const mutations=[(r:any)=>r.kind='signature',(r:any)=>r.chainId=10,(r:any)=>r.origin='https://other.example',(r:any)=>r.transaction.from=other,(r:any)=>r.transaction.to=other,(r:any)=>r.transaction.value='0xff',(r:any)=>r.transaction.data='0x1234',(r:any)=>r.transaction.gas='0x1',(r:any)=>r.transaction.maxFeePerGas='0x2',(r:any)=>r.transaction.maxPriorityFeePerGas='0x2',(r:any)=>r.transaction.nonce='0x1',(r:any)=>r.transaction.unsupportedFields=['accessList'],(r:any)=>r.transaction.unsupportedFields=['unrecognized']];
 for(const mutate of mutations){const different=structuredClone(tx());mutate(different);assert.equal(reportMatchesRequest(tx(),different),false);}
 for(const returned of [undefined,null,{},[]])assert.equal(reportMatchesRequest(tx(),returned),false);
});
test('signature comparison binds actual data, method, signer and separate provider context without inventing a signing network',()=>{
 const original=typed(),same=JSON.parse(JSON.stringify(original));same.signature.data={message:{amount:'1'},primaryType:'Message',types:{Message:[{type:'uint256',name:'amount'}]},domain:{name:'Fixture',chainId:1}};assert.equal(reportMatchesRequest(original,same),true);
 for(const mutate of [(r:any)=>r.chainId=1,(r:any)=>r.signature.from=other,(r:any)=>r.signature.method='personal_sign',(r:any)=>r.signature.data.message.amount='2',(r:any)=>r.signature.providerContext.chainId=10,(r:any)=>r.signature.providerContext.observedAt='2026-10-26T12:00:01.000Z',(r:any)=>delete r.signature.providerContext]){const different=structuredClone(original);mutate(different);assert.equal(reportMatchesRequest(original,different),false);}
 const plain={kind:'signature',chainId:0,signature:{from,method:'personal_sign',data:'0xABCD'}};assert.equal(reportMatchesRequest(plain,{...plain,signature:{...plain.signature,data:'0xabcd'}}),true);
});
test('request comparison fails closed for cyclic or over-depth response objects',()=>{
 const cyclic:any=typed();cyclic.signature.data.message.self=cyclic;assert.equal(reportMatchesRequest(typed(),cyclic),false);
 let deep:Record<string,unknown>={};for(let index=0;index<40;index++)deep={nested:deep};const excessive:any=typed();excessive.signature.data.message=deep;assert.equal(reportMatchesRequest(excessive,structuredClone(excessive)),false);
});
test('transaction Snap rejects an otherwise valid unrelated backend report and preserves matching request display',async()=>{
 const original=globalThis.fetch,previous=(globalThis as any).snap;try{
  (globalThis as any).snap={request:async()=>({backendToken:'a'.repeat(64)})};
  for(const change of ['none','chain','sender','target','data','value','gas','nonce','missing']){
   globalThis.fetch=async(_url,init)=>{const sent=JSON.parse(String(init?.body)) as SecurityRequest,request=structuredClone(sent) as any;if(change==='chain')request.chainId=10;if(change==='sender')request.transaction.from=other;if(change==='target')request.transaction.to=other;if(change==='data')request.transaction.data='0xff';if(change==='value')request.transaction.value='0xff';if(change==='gas')request.transaction.gas='0x1';if(change==='nonce')request.transaction.nonce='0x2';const report:any={...assess(request,[]),id:'bound-transaction-report'};if(change==='missing')delete report.request;return new Response(JSON.stringify(report));};
   const panel=JSON.stringify(await onTransaction({transaction:tx().transaction,chainId:'eip155:1',transactionOrigin:tx().origin} as any));assert.equal(panel.includes('bound-transaction-report'),change==='none',change);if(change!=='none')assert.ok(panel.includes('Unable to assess'));
  }
 }finally{globalThis.fetch=original;(globalThis as any).snap=previous;}
});
test('signature Snap rejects unrelated signed data or provider snapshots and leaves EOA signing network unknown',async()=>{
 const original=globalThis.fetch,previous=(globalThis as any).snap,oldEthereum=(globalThis as any).ethereum;try{
  (globalThis as any).snap={request:async()=>({backendToken:'a'.repeat(64)})};(globalThis as any).ethereum={request:async()=>'0x1'};
  for(const change of ['none','chain','signer','method','data','snapshot']){
   globalThis.fetch=async(_url,init)=>{const sent=JSON.parse(String(init?.body)) as SecurityRequest;assert.equal(sent.chainId,0);const request=structuredClone(sent) as any;if(change==='chain')request.chainId=1;if(change==='signer')request.signature.from=other;if(change==='method')request.signature.method='eth_sign';if(change==='data')request.signature.data='0x7777';if(change==='snapshot')request.signature.providerContext.chainId=10;return new Response(JSON.stringify({...assess(request,[]),id:'bound-signature-report'}));};
   const panel=JSON.stringify(await onSignature({signature:{from,signatureMethod:'personal_sign',data:'0x6869'},signatureOrigin:'https://dapp.example'}));assert.equal(panel.includes('bound-signature-report'),change==='none',change);if(change!=='none')assert.ok(panel.includes('Unable to assess'));
  }
 }finally{globalThis.fetch=original;(globalThis as any).snap=previous;(globalThis as any).ethereum=oldEthereum;}
});
test('actual backend parsing and execution-marker normalization remain compatible with both bound Snap callbacks',async()=>{
 const token='a'.repeat(64),store=createStore(':memory:'),app=await buildApp(store,{service:{mode:'local',origin:'http://127.0.0.1:5173',origins:['http://127.0.0.1:5173'],hosts:['127.0.0.1'],walletDailyLimit:100,maxScans:1},security:{config:async()=>({apiKey:'',model:'not-called',aiEnabled:false,lookups:false,goPlusToken:'',rpc:{},snapToken:token}),collect:async()=>[]}});
 const original=globalThis.fetch,previous=(globalThis as any).snap,oldEthereum=(globalThis as any).ethereum;
 try{
  (globalThis as any).snap={request:async()=>({backendToken:token})};(globalThis as any).ethereum={request:async()=>'0x1'};
  globalThis.fetch=async(url,init)=>{const response=await app.inject({method:'POST',url:new URL(String(url)).pathname,headers:{...(init?.headers as Record<string,string>),origin:'null'},payload:JSON.parse(String(init?.body))});assert.equal(response.statusCode,200,response.body);return new Response(response.body,{status:response.statusCode});};
  const transaction=JSON.stringify(await onTransaction({transaction:{...tx().transaction,type:'0x4',authorizationList:[{chainId:'0x1',address:to,nonce:'0x0',yParity:'0x0',r:'0x1',s:'0x2'}]},chainId:'eip155:1',transactionOrigin:'https://dapp.example'} as any));const first=store.securityList()[0];assert.ok(transaction.includes(first.id));assert.equal(first.capture?.channel,'paired-snap');assert.ok(first.request.kind==='transaction'&&first.request.transaction.unsupportedFields?.includes('type_7702'));
  const signature=JSON.stringify(await onSignature({signature:{from,signatureMethod:'personal_sign',data:'0x6869'},signatureOrigin:'https://dapp.example'}));const second=store.securityList().find(report=>report.request.kind==='signature')!;assert.ok(signature.includes(second.id));assert.equal(second.request.chainId,0);assert.equal(second.capture?.channel,'paired-snap');
 }finally{globalThis.fetch=original;(globalThis as any).snap=previous;(globalThis as any).ethereum=oldEthereum;await app.close();store.close();}
});
