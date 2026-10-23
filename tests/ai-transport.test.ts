import test from 'node:test';
import assert from 'node:assert/strict';
import {MODEL_RESPONSE_LIMITS,scoreWithAI} from '../src/security/ai.js';
import type {SecurityConfig} from '../src/security/config.js';
import {finitePermitOutput,finitePermitReport} from './fixtures/model.js';
const config:SecurityConfig={apiKey:'synthetic-test-key',model:'muse-wonder-1.0',aiEnabled:true,lookups:false,goPlusToken:'',rpc:{}};
const envelope=(value:unknown)=>JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
function streamed(bytes:Uint8Array,status=200,chunk=1024){
 let offset=0,cancelled=false;
 const response=new Response(new ReadableStream<Uint8Array>({pull(controller){if(offset>=bytes.length){controller.close();return;}const end=Math.min(offset+chunk,bytes.length);controller.enqueue(bytes.slice(offset,end));offset=end;},cancel(){cancelled=true;}}),{status,headers:{'content-length':'1'}});
 Object.defineProperty(response,'text',{value:()=>{throw Error('Whole-body text buffering must not be used');}});
 return {response,state:()=>({offset,cancelled})};
}

test('successful Muse JSON is decoded across split UTF-8 bytes without Response.text buffering',async()=>{
 const expected=finitePermitOutput(31),bytes=new TextEncoder().encode(envelope(expected));
 const input=streamed(bytes,200,1);let calls=0;
 const result=await scoreWithAI(finitePermitReport(),config,async()=>{calls++;return input.response;});
 assert.equal(result.status,'completed');assert.equal(result.result?.score,31);assert.equal(calls,1);
 assert.equal(result.result?.summary,expected.summary);assert.equal(input.state().offset,bytes.length);assert.equal(input.state().cancelled,false);
});

test('a multibyte success body is limited by bytes, canceled before completion and never repaired',async()=>{
 const marker='SYNTHETIC_PRIVATE_PROVIDER_TEXT';
 const text=marker+'界'.repeat(Math.ceil(MODEL_RESPONSE_LIMITS.successBytes/2));
 assert.ok(text.length<MODEL_RESPONSE_LIMITS.successBytes);
 const bytes=new TextEncoder().encode(text),input=streamed(bytes);let calls=0,reservations=0;
 const result=await scoreWithAI(finitePermitReport(),config,async()=>{calls++;return input.response;},()=>{reservations++;return true;});
 assert.equal(result.status,'failed');assert.equal(result.result,undefined);assert.equal(calls,1);assert.equal(reservations,0);
 assert.equal(input.state().cancelled,true);assert.ok(input.state().offset<bytes.length);
 assert.ok(input.state().offset<=MODEL_RESPONSE_LIMITS.successBytes+2048);assert.ok(!result.message.includes(marker));
});

test('error responses have their smaller streamed byte cap and expose only local HTTP guidance',async()=>{
 const marker='SYNTHETIC_PRIVATE_PROVIDER_TEXT',bytes=new TextEncoder().encode(marker.repeat(3000));
 const input=streamed(bytes,429);let reservations=0;
 const result=await scoreWithAI(finitePermitReport(),config,async()=>input.response,()=>{reservations++;return true;});
 assert.equal(result.status,'failed');assert.match(result.message,/HTTP 429/);assert.match(result.message,/rate-limited/);
 assert.equal(input.state().cancelled,true);assert.ok(input.state().offset<bytes.length);
 assert.ok(input.state().offset<=MODEL_RESPONSE_LIMITS.errorBytes+2048);assert.equal(reservations,0);assert.ok(!result.message.includes(marker));
 const small=streamed(new TextEncoder().encode(JSON.stringify({error:{code:'insufficient_quota',message:marker}})),429,3);
 const quota=await scoreWithAI(finitePermitReport(),config,async()=>small.response);
 assert.match(quota.message,/quota is insufficient/);assert.ok(!quota.message.includes(marker));
});

test('malformed UTF-8 is canceled safely without a numeric fallback or repair',async()=>{
 const input=streamed(Uint8Array.from([0xff,0xff,0xff,0x61,0x62]),200,1);let reservations=0;
 const result=await scoreWithAI(finitePermitReport(),config,async()=>input.response,()=>{reservations++;return true;});
 assert.equal(result.status,'failed');assert.equal(result.result,undefined);assert.equal(input.state().cancelled,true);assert.equal(reservations,0);
});

test('one offline repair receives semantic feedback and the same server-owned support packet',async()=>{
 let calls=0,reservations=0,first:any;
 const result=await scoreWithAI(finitePermitReport(),config,async(_url,init)=>{
  calls++;const request=JSON.parse(String(init?.body));
  if(calls===1){first=JSON.parse(request.input);assert.ok(first.evidence_admissibility.length);assert.equal(first.claim_support.officialIdentity,false);const invalid=finitePermitOutput(9);invalid.suggested_action='The token can always be sold.';return new Response(envelope(invalid));}
  const repair=JSON.parse(request.input);assert.deepEqual(repair.evidence_packet,first);assert.match(repair.validation_feedback,/future execution\/sellability/);assert.ok(!request.instructions.includes('The token can always be sold.'));
  return new Response(envelope(finitePermitOutput(9)));
 },()=>{reservations++;return true;});
 assert.equal(result.status,'completed');assert.equal(result.result?.score,9);assert.equal(calls,2);assert.equal(reservations,1);
});
