import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {loadSecurityConfig,META_MODEL,META_RESPONSES_URL} from '../src/security/config.js';
import {buildApp} from '../src/server/app.js';
import {createStore} from '../src/server/store.js';

async function fixture(files: Record<string,string>, run: (root:string)=>Promise<void>) {
 const root=await mkdtemp(join(tmpdir(),'walletshield-meta-'));
 try {await mkdir(join(root,'.local'));for(const [name,text] of Object.entries(files))await writeFile(join(root,'.local',name),text);await run(root);}
 finally {await rm(root,{recursive:true,force:true});}
}
test('Meta configuration never falls back to old OpenAI credentials or model names',async()=>{
 await fixture({'ai.env':'OPENAI_API_KEY=old-key\nOPENAI_MODEL=old-model\nMODEL_API_KEY=wrong-location\nENABLE_EXTERNAL_LOOKUPS=0'},async root=>{
  const c=await loadSecurityConfig({root,env:{OPENAI_API_KEY:'old-environment-key',OPENAI_MODEL:'old-model'}});
  assert.equal(c.apiKey,'');assert.equal(c.model,'muse-wonder-1.0');assert.equal(c.monitorEnabled,false);
  assert.equal(c.rpc[31337],'http://127.0.0.1:8545');assert.equal(c.rpc[1],undefined);
  assert.match(c.snapToken!,/^[a-f0-9]{64}$/);
 });
});
test('Meta key and flags come from meta.env, environment takes priority, pairing remains stable',async()=>{
 await fixture({'meta.env':' MODEL_API_KEY="meta-fixture"\nENABLE_META_AI=0\nMETA_MODEL=wrong-model'},async root=>{
  const c=await loadSecurityConfig({root,env:{}});assert.equal(c.apiKey,'meta-fixture');assert.equal(c.aiEnabled,false);assert.equal(c.model,META_MODEL);
  const other=await loadSecurityConfig({root,env:{MODEL_API_KEY:'override-fixture',ENABLE_META_AI:'1'}});
  assert.equal(other.apiKey,'override-fixture');assert.equal(other.aiEnabled,true);assert.equal(other.snapToken,c.snapToken);
  assert.ok((await readFile(join(root,'.local/meta.env'),'utf8')).includes('meta-fixture'));
 });
});
test('Infura key builds mainnet and Sepolia endpoints without becoming a model key',async()=>{
 await fixture({'rpc.env':'INFURA_API_KEY=infura-fixture-key'},async root=>{
  const c=await loadSecurityConfig({root,env:{}});
  assert.equal(c.rpc[1],'https://mainnet.infura.io/v3/infura-fixture-key');
  assert.equal(c.rpc[11155111],'https://sepolia.infura.io/v3/infura-fixture-key');
  assert.equal(c.apiKey,'');assert.equal(META_RESPONSES_URL,'https://api.meta.ai/v1/responses');
 });
});
test('explicit trusted RPC overrides Infura, invalid URLs and local chain overrides are ignored',async()=>{
 await fixture({'ai.env':'RPC_42161_URL=https://legacy.example/rpc','rpc.env':'INFURA_API_KEY=infura-fixture\nRPC_1_URL=https://trusted.example/rpc\nRPC_31337_URL=https://remote.example\nRPC_10_URL=http://untrusted.example\nRPC_56_URL=https://user:password@remote.example\nRPC_8453_URL=https://base.example/rpc'},async root=>{
  const c=await loadSecurityConfig({root,env:{RPC_8453_URL:'https://env.example/rpc'}});
  assert.equal(c.rpc[1],'https://trusted.example/rpc');assert.equal(c.rpc[31337],'http://127.0.0.1:8545');
  assert.equal(c.rpc[10],undefined);assert.equal(c.rpc[56],undefined);assert.equal(c.rpc[8453],'https://env.example/rpc');assert.equal(c.rpc[42161],'https://legacy.example/rpc');
 });
});
test('invalid Infura key does not silently create endpoints',async()=>{
 await fixture({'rpc.env':'INFURA_API_KEY=invalid/key?secret'},async root=>{
  const c=await loadSecurityConfig({root,env:{}});assert.equal(c.rpc[1],undefined);assert.equal(c.rpc[11155111],undefined);
 });
});
test('wallet test model budget is configurable, bounded, and does not change the model or key',async()=>{
 await fixture({'meta.env':'MODEL_API_KEY=test-only\nAI_DAILY_LIMIT=72'},async root=>{
  assert.equal((await loadSecurityConfig({root,env:{}})).aiDailyLimit,72);
  for(const value of ['0','-1','1001','1.5','invalid'])assert.equal((await loadSecurityConfig({root,env:{AI_DAILY_LIMIT:value}})).aiDailyLimit,100);
  const c=await loadSecurityConfig({root,env:{AI_DAILY_LIMIT:'120'}});assert.equal(c.aiDailyLimit,120);assert.equal(c.model,META_MODEL);assert.equal(c.apiKey,'test-only');
 });
 const store=createStore(':memory:');try{for(let i=0;i<54;i++)assert.equal(store.securityAiAttempt(100),true);assert.equal(store.securityAiCallsToday(),54);assert.throws(()=>store.securityAiAttempt(1001));}finally{store.close();}
});
test('status shows provider, model and chain IDs without exposing either credential or endpoints',async()=>{
 await fixture({'meta.env':'MODEL_API_KEY=meta-do-not-echo','rpc.env':'INFURA_API_KEY=infura-do-not-echo'},async root=>{
  const store=createStore(':memory:');const app=await buildApp(store,{security:{config:()=>loadSecurityConfig({root,env:{}})}});
  try {
   const response=await app.inject({url:'/api/security/status'});const body=response.json();
   assert.equal(body.version,'0.4.1');assert.equal(body.aiProvider,'Meta');assert.equal(body.model,META_MODEL);assert.equal(body.aiConfigured,true);
   assert.ok(body.configuredChains.includes(11155111));assert.ok(!response.body.includes('do-not-echo'));assert.ok(!response.body.includes('infura.io/v3'));
  } finally {await app.close();store.close();}
 });
});
