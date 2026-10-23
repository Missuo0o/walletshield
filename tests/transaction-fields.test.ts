import test from 'node:test';
import assert from 'node:assert/strict';
import {unsupportedTransactionFields} from '../src/security/transaction-fields.js';
import {requestSchema} from '../src/security/types.js';
import {decodeRequest} from '../src/security/decode.js';
import {simulateRequest} from '../src/security/simulation.js';
import {assess} from '../src/security/rules.js';
import {evidencePacket} from '../src/security/ai.js';
import {collector} from '../src/security/providers.js';
test('unsupported wallet envelope data remains explicit and cannot produce a substitute simulation',async()=>{
  for(const [raw,expected] of [
    [{accessList:[{address:`0x${'1'.repeat(40)}`,storageKeys:[]}]},['accessList']],
    [{type:'0x03',maxFeePerBlobGas:'0x1'},['maxFeePerBlobGas','type_blob']],
    [{type:'0x04',authorizationList:[]},['authorizationList','type_7702']],
    [{type:'0x05'},['type_unknown']],
    [{gas:'bad'},['invalid_execution_fields']]
  ] as const){
    const unsupportedFields=unsupportedTransactionFields(raw);assert.deepEqual(unsupportedFields,expected);
    const request=requestSchema.parse({kind:'transaction',chainId:31337,transaction:{from:`0x${'2'.repeat(40)}`,to:`0x${'3'.repeat(40)}`,data:'0x',unsupportedFields}});
    let opened=false;const facts=await simulateRequest(request,decodeRequest(request),{rpc:{},apiKey:'',model:'test',aiEnabled:false,lookups:false,goPlusToken:'',forkEnabled:true},async()=>{opened=true;throw Error('must not execute');});
    assert.equal(opened,false);assert.equal(facts[0].status,'unknown');
  }
  assert.deepEqual(unsupportedTransactionFields({type:'0x02',gas:'0x5208',accessList:[]}),[]);
});
test('server/core derives special envelope limitations when an API caller omits or empties the marker',async()=>{
 const base={kind:'transaction' as const,chainId:31337,transaction:{from:`0x${'2'.repeat(40)}`,to:`0x${'3'.repeat(40)}`,data:'0x'}};
 for(const fields of [{type:'0x4'},{type:'0x3',unsupportedFields:[]},{type:'0x5'},{authorizationList:[]}]){
  const request=requestSchema.parse({...base,transaction:{...base.transaction,...fields}});let opened=false;
  const config={rpc:{},apiKey:'',model:'test',aiEnabled:false,lookups:false,goPlusToken:'',forkEnabled:true};
  const result=await simulateRequest(request,decodeRequest(request),config,async()=>{opened=true;throw Error('Must not execute an ordinary substitute');});assert.equal(opened,false);assert.equal(result[0].status,'unknown');assert.ok((result[0].data?.unsupportedFields as unknown[])?.length);
  const report=assess(request,[]);assert.ok(report.checks.some(c=>c.id==='unsupported_transaction_fields'&&c.status==='unknown'));assert.ok(evidencePacket(report).unsupportedTransactionFields.length);
 }
 const request=requestSchema.parse({...base,transaction:{...base.transaction,type:'0x4'}}),calls:string[]=[];const fetcher:typeof fetch=async(_url,init)=>{const r=JSON.parse(String(init?.body));calls.push(r.method);const result=r.method==='eth_chainId'?'0x7a69':r.method==='eth_blockNumber'?'0x1':r.method==='eth_getBlockByNumber'?{number:'0x1',hash:'0x'+'ab'.repeat(32),timestamp:'0x1234'}:r.method==='eth_getCode'?'0x':'0x1';return new Response(JSON.stringify({jsonrpc:'2.0',id:r.id,result}));};
 const original=globalThis.fetch;try{globalThis.fetch=fetcher;const facts=await collector({rpc:{31337:'https://configured.fixture.invalid'},apiKey:'',model:'test',aiEnabled:false,lookups:false,goPlusToken:'',forkEnabled:false},fetcher)(request,decodeRequest(request));assert.equal(facts.find(c=>c.id==='basic_call')?.status,'unknown');assert.ok(!calls.includes('eth_call'),'No ordinary basic call may substitute for a special envelope');}finally{globalThis.fetch=original;}
});
