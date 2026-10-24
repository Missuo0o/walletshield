import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {createServer as createPortServer} from 'node:net';
import {simulateRequest,openFork,type ForkFactory} from '../src/security/simulation.js';
import {transactionTraceEvidence} from '../src/security/trace.js';
import {decodeRequest} from '../src/security/decode.js';
import type {SecurityConfig} from '../src/security/config.js';
import type {SecurityRequest} from '../src/security/types.js';

test('provider without either trace method still yields original-call trace via one isolated fork without source writes',{timeout:30000},async()=>{
 const from='0x1111111111111111111111111111111111111111',to='0x2222222222222222222222222222222222222222',third='0x3333333333333333333333333333333333333333';
 const listener=createPortServer();await new Promise<void>((ok,bad)=>{listener.once('error',bad);listener.listen(0,'127.0.0.1',ok);});const address=listener.address();assert.ok(address&&typeof address!=='string');const port=address.port;assert.notEqual(port,8545);await new Promise<void>(ok=>listener.close(()=>ok()));
 const url=`http://127.0.0.1:${port}`,child=spawn(process.execPath,['node_modules/@foundry-rs/anvil/bin.mjs','--host','127.0.0.1','--port',String(port),'--chain-id','31337','--accounts','0','--silent'],{stdio:'ignore'});
 let id=0;const rpc=async(method:string,params:unknown[]=[])=>{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal:AbortSignal.timeout(1800)}),body=await response.json();if(body.error)throw Error(`Fixture RPC ${body.error.code}`);return body.result;};
 const writes:string[]=[],traceMethods:string[]=[];const provider=createServer(async(req,res)=>{try{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));const calls=Array.isArray(body)?body:[body];const results=await Promise.all(calls.map(async(call:any)=>{
  if(['debug_traceCall','trace_call'].includes(call.method)){traceMethods.push(call.method);return {jsonrpc:'2.0',id:call.id,error:{code:-32601,message:'Fixture trace unavailable'}};}
  if(/^(eth_send|anvil_|evm_)/.test(call.method)){writes.push(call.method);return {jsonrpc:'2.0',id:call.id,error:{code:-32601,message:'Writes forbidden'}};}
  return {jsonrpc:'2.0',id:call.id,result:await rpc(call.method,call.params)};
 }));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(Array.isArray(body)?results:results[0]));}catch{res.writeHead(502);res.end('{}');}});
 try{
  let ready=false;for(let i=0;i<60;i++){try{assert.equal(await rpc('eth_chainId'),'0x7a69');ready=true;break;}catch{await new Promise(ok=>setTimeout(ok,50));}}assert.ok(ready);
  await rpc('anvil_setBalance',[from,'0x56bc75e2d63100000']);
  // A tiny fixture calls a second address; there is no deployment or upstream
  // transaction in the analysis path. Fixture setup only touches its own node.
  await rpc('anvil_setCode',[to,`0x6000600060006000600073${third.slice(2)}61fffff100`]);
  await new Promise<void>((ok,bad)=>{provider.once('error',bad);provider.listen(0,'127.0.0.1',ok);});const providerAddress=provider.address();assert.ok(providerAddress&&typeof providerAddress!=='string');
  const config:SecurityConfig={apiKey:'',model:'not-called',aiEnabled:false,lookups:false,goPlusToken:'',forkEnabled:true,rpc:{31337:`http://127.0.0.1:${providerAddress.port}`}};
  const before={header:await rpc('eth_getBlockByNumber',['latest',false]),nonce:await rpc('eth_getTransactionCount',[from,'latest']),balance:await rpc('eth_getBalance',[from,'latest'])};
  const request:SecurityRequest={kind:'transaction',chainId:31337,transaction:{from,to,data:'0x12345678',value:'0x0',gas:'0x100000',nonce:before.nonce}};
  const [remote]=await transactionTraceEvidence(request,config);assert.equal(remote.data?.traceAvailable,false);assert.deepEqual(traceMethods,['debug_traceCall','trace_call']);
  let opened=0,closed=0;const factory:ForkFactory=async(c,chain)=>{opened++;const fork=await openFork(c,chain),close=fork.close;assert.ok(fork.traceRpc);await assert.rejects(()=>fork.traceRpc!('eth_sendTransaction',[request.transaction],AbortSignal.timeout(1000)),/Read-only fork trace method/);return {...fork,close:async()=>{closed++;await close();}};};
  const checks=await simulateRequest(request,decodeRequest(request),config,factory),trace=checks.find(check=>check.id==='call_trace_fork');assert.equal(opened,1);assert.equal(closed,1);
  assert.equal(trace?.status,'pass',JSON.stringify(checks));assert.equal(trace.data?.traceAvailable,true);assert.equal(trace.data?.blockHash,before.header.hash);assert.equal(trace.data?.blockTimestampSeconds,String(BigInt(before.header.timestamp)));assert.equal((trace.data?.calls as any[])[0].selector,'0x12345678');assert.ok((trace.data?.calls as any[]).some(frame=>frame.to?.toLowerCase()===third));
  assert.equal(checks.find(check=>check.id==='simulation_execution')?.status,'pass',JSON.stringify(checks));assert.deepEqual(writes,[]);
  const after={header:await rpc('eth_getBlockByNumber',['latest',false]),nonce:await rpc('eth_getTransactionCount',[from,'latest']),balance:await rpc('eth_getBalance',[from,'latest'])};assert.equal(after.header.hash,before.header.hash);assert.equal(after.header.number,before.header.number);assert.equal(after.nonce,before.nonce);assert.equal(after.balance,before.balance);
 }finally{
  provider.closeAllConnections();await new Promise<void>(ok=>provider.close(()=>ok()));
  await new Promise<void>(ok=>{if(child.exitCode!==null||child.signalCode!==null){ok();return;}const timeout=setTimeout(()=>{child.kill('SIGKILL');ok();},1000);child.once('exit',()=>{clearTimeout(timeout);ok();});child.kill('SIGTERM');});
 }
});
