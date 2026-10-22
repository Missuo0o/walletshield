import test from 'node:test';
import assert from 'node:assert/strict';
import {unsupportedTransactionFields} from '../src/security/transaction-fields.js';
import {requestSchema} from '../src/security/types.js';
import {decodeRequest} from '../src/security/decode.js';
import {simulateRequest} from '../src/security/simulation.js';
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
