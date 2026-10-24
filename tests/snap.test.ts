import test from 'node:test';
import assert from 'node:assert/strict';
import { onTransaction } from '../snap/src/index.js';
import { scenarios } from '../src/core/scenarios.js';
import { evaluate } from '../src/core/engine.js';
async function invoke(chainId = 'eip155:31337') {
  const result = await onTransaction({ transaction: scenarios[0].input.transaction, chainId, transactionOrigin: 'http://localhost:5173' } as Parameters<typeof onTransaction>[0]);
  assert.ok(result && 'content' in result);
  return result;
}

test('transaction insight deadline includes a stalled response body after headers arrive',async()=>{
 const originalFetch=globalThis.fetch,originalTimer=globalThis.setTimeout,oldSnap=(globalThis as any).snap;
 let signal:AbortSignal|undefined;
 (globalThis as any).snap={request:async()=>({backendToken:'a'.repeat(64)})};
 globalThis.setTimeout=((callback:any,delay?:number,...args:any[])=>originalTimer(callback,delay===85000?20:delay,...args)) as typeof setTimeout;
 globalThis.fetch=async(_url,init)=>{
  signal=init!.signal as AbortSignal;
  return {ok:true,json:()=>new Promise((_resolve,reject)=>{
   const fallback=originalTimer(()=>reject(Error('Test body remained open after its deadline')),200);
   const aborted=()=>{clearTimeout(fallback);reject(new DOMException('Body aborted','AbortError'));};
   if(signal!.aborted)aborted();else signal!.addEventListener('abort',aborted,{once:true});
  })} as Response;
 };
 try{const result=await invoke();assert.equal(signal?.aborted,true,'Headers must not disarm the body deadline');assert.ok(JSON.stringify(result).includes('Unable to assess'));}
 finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer;(globalThis as any).snap=oldSnap;}
});
test('Snap surfaces RPC findings and fails visibly for network, API, and untrusted response errors', async () => {
  const original = globalThis.fetch;
  const oldSnap=(globalThis as any).snap;(globalThis as any).snap={request:async()=>({backendToken:'a'.repeat(64)})};
  try {
    const result = { ...evaluate(scenarios[0].input, { ...scenarios[0].context, source: 'rpc' }), id: 'test' };
    let posted: Record<string, unknown> | undefined;
    globalThis.fetch = async (_url, init) => { posted = JSON.parse(init!.body as string); return new Response(JSON.stringify(result)); };
    const high = await invoke(); assert.equal(high.severity, 'critical'); assert.equal(posted?.chainId, 31337);
    assert.ok(JSON.stringify(high.content).includes('High risk'));
    globalThis.fetch = async () => { throw new Error('offline'); };
    const offline = await invoke(); assert.equal(offline.severity, 'critical'); assert.ok(JSON.stringify(offline.content).includes('Unable to assess'));
    const unsupported = await invoke('eip155:1'); assert.equal(unsupported.severity, 'critical');
    globalThis.fetch = async () => new Response(JSON.stringify({ ...result, source: 'demo' }));
    assert.ok(JSON.stringify((await invoke()).content).includes('Unable to assess'));
    globalThis.fetch = async () => new Response('{}', { status: 500 });
    assert.equal((await invoke()).severity, 'critical');
  } finally { globalThis.fetch = original;(globalThis as any).snap=oldSnap; }
});

test('signature hook forwards unsigned message with unknown current chain and uses critical presentation',async()=>{
  const {onSignature}=await import('../snap/src/index.js');const original=globalThis.fetch;const oldSnap=(globalThis as any).snap;(globalThis as any).snap={request:async()=>({backendToken:'a'.repeat(64)})};
  try{
    const result={...evaluate(scenarios[0].input,{...scenarios[0].context,source:'rpc'}),id:'signature-check'};
    let posted:any;globalThis.fetch=async(_url,init)=>{posted=JSON.parse(String(init?.body));return new Response(JSON.stringify(result));};
    const response=await onSignature({signature:{from:scenarios[0].input.transaction.from,signatureMethod:'personal_sign',data:'0x68656c6c6f'},signatureOrigin:'https://example.test'});
    assert.equal(posted.kind,'signature');assert.equal(posted.chainId,0);assert.equal(posted.signature.method,'personal_sign');assert.equal(response?.severity,'critical');assert.ok(JSON.stringify(response).includes('signature-check'));
    globalThis.fetch=async()=>new Response('{}',{status:500});assert.ok(JSON.stringify(await onSignature({signature:{from:scenarios[0].input.transaction.from,signatureMethod:'personal_sign',data:'0x'}})).includes('Unable to assess'));
  }finally{globalThis.fetch=original;(globalThis as any).snap=oldSnap;}
});

test('transaction and signature insights distinguish abstention from rejected output and model transport errors',async()=>{
 const {onSignature}=await import('../snap/src/index.js');const original=globalThis.fetch,oldSnap=(globalThis as any).snap;
 (globalThis as any).snap={request:async()=>({backendToken:'a'.repeat(64)})};
 try{
  const base={...evaluate(scenarios[0].input,{...scenarios[0].context,source:'rpc'}),id:'outcome-test',score:null,scoreSource:'none'};
  const states=[
   {ai:{status:'completed',message:'Insufficient observed evidence',result:{score:null,assessment:'unknown',summary:'Evidence could not support a number',reasons:[],suggested_action:'Review the evidence'}},label:'Evidence insufficient for a score'},
   {ai:{status:'failed',failureKind:'validation',message:'A cited observation did not support the claim'},label:'Model output rejected'},
   {ai:{status:'failed',failureKind:'transport',message:'Model request timed out'},label:'Model connection failed'}
  ];
  for(const state of states){
   globalThis.fetch=async()=>new Response(JSON.stringify({...base,ai:state.ai}));
   const tx=JSON.stringify(await invoke()),signature=JSON.stringify(await onSignature({signature:{from:scenarios[0].input.transaction.from,signatureMethod:'personal_sign',data:'hello'}}));
   assert.ok(tx.includes(state.label),state.label);assert.ok(signature.includes(state.label),state.label);assert.ok(!tx.includes('AI risk indicator:'),'A no-score state must never present a numeric risk indicator');
  }
 }finally{globalThis.fetch=original;(globalThis as any).snap=oldSnap;}
});

test('Snap pairing verifies backend health before storing token and never returns credentials',async()=>{
 const {onRpcRequest}=await import('../snap/src/index.js');const previous=(globalThis as any).snap,original=globalThis.fetch;let state:any=null,stored=0,lookups=0;
 (globalThis as any).snap={request:async(value:any)=>{if(value.params.operation==='get')return state;state=value.params.newState;stored++;return null;}};
 try{
  const request={jsonrpc:'2.0',id:1,method:'walletshield_configure',params:{token:'a'.repeat(64)}};
  globalThis.fetch=async(url,init)=>{lookups++;assert.ok(String(url).endsWith('/api/security/pair/status'));assert.equal((init?.headers as any).Authorization,'Bearer '+'a'.repeat(64));assert.equal(init?.body,undefined);return new Response(JSON.stringify({paired:true,expiresAt:null}));};
  await assert.rejects(()=>onRpcRequest({origin:'https://evil.example',request} as any));assert.equal(lookups,0);
  const result=await onRpcRequest({origin:'http://127.0.0.1:5173',request} as any);assert.deepEqual(result,{configured:true,paired:true,expiresAt:null});assert.equal(state.backendToken,'a'.repeat(64));assert.ok(!JSON.stringify(result).includes('aaaa'));
  const status=await onRpcRequest({origin:'http://127.0.0.1:5173',request:{...request,method:'walletshield_status',params:{}}} as any);assert.equal((status as any).paired,true);
  globalThis.fetch=async()=>new Response('{}',{status:401});await assert.rejects(()=>onRpcRequest({origin:'http://127.0.0.1:5173',request} as any));assert.equal(stored,1,'Rejected pairing cannot overwrite prior state');
 }finally{(globalThis as any).snap=previous;globalThis.fetch=original;}
});

test('Snap provider network is forwarded as separate context and never replaces the signing network',async()=>{
 const {onSignature}=await import('../snap/src/index.js');const original=globalThis.fetch,oldSnap=(globalThis as any).snap,oldEthereum=(globalThis as any).ethereum;let posted:any,calls:string[]=[];
 (globalThis as any).snap={request:async()=>({backendToken:'a'.repeat(64)})};(globalThis as any).ethereum={request:async(value:any)=>{calls.push(value.method);return '0x1';}};
 try{
  const result={...evaluate(scenarios[0].input,{...scenarios[0].context,source:'rpc'}),id:'context'};globalThis.fetch=async(_,init)=>{posted=JSON.parse(String(init?.body));return new Response(JSON.stringify(result));};
  await onSignature({signature:{from:scenarios[0].input.transaction.from,signatureMethod:'personal_sign',data:'hello'}});assert.equal(posted.chainId,0);assert.equal(posted.signature.providerContext.chainId,1);assert.equal(posted.signature.providerContext.source,'snap-provider');assert.deepEqual(calls,['eth_chainId']);
  (globalThis as any).ethereum={request:async()=>{throw Error('unavailable');}};await onSignature({signature:{from:scenarios[0].input.transaction.from,signatureMethod:'personal_sign',data:'hello'}});assert.equal(posted.signature.providerContext,undefined);assert.equal(posted.chainId,0);
 }finally{globalThis.fetch=original;(globalThis as any).snap=oldSnap;(globalThis as any).ethereum=oldEthereum;}
});

test('Snap includes AI explanations and forwards fee fields without signing or exposing backend configuration',async()=>{
 const original=globalThis.fetch,previous=(globalThis as any).snap;let posted:any;
 (globalThis as any).snap={request:async()=>({backendToken:'a'.repeat(64)})};
 try{
  const result={...evaluate(scenarios[0].input,{...scenarios[0].context,source:'rpc'}),id:'ai-test',score:88,scoreSource:'ai',ai:{status:'completed',message:'AI 完成',result:{summary:'基于证据的模型解释',reasons:[{text:'模型发现的具体风险',evidence_ids:['operation']}],suggested_action:'核实用途'}}};
  globalThis.fetch=async(_,init)=>{posted=JSON.parse(String(init?.body));return new Response(JSON.stringify(result));};
  const response=await onTransaction({transaction:{...scenarios[0].input.transaction,gas:'0x5208',maxFeePerGas:'0x64'},chainId:'eip155:31337'} as any);
  assert.equal(posted.transaction.gas,'0x5208');assert.equal(posted.transaction.maxFeePerGas,'0x64');assert.ok(JSON.stringify(response).includes('基于证据的模型解释'));assert.ok(JSON.stringify(response).includes('模型发现的具体风险'));
  globalThis.fetch=async()=>new Response(JSON.stringify({...result,score:101}));assert.ok(JSON.stringify(await invoke()).includes('Unable to assess'));
 }finally{globalThis.fetch=original;(globalThis as any).snap=previous;}
});

test('transaction and signature panels show case-specific boundaries, primary facts and missing evidence totals',async()=>{
 const {onSignature}=await import('../snap/src/index.js');const original=globalThis.fetch,oldSnap=(globalThis as any).snap;(globalThis as any).snap={request:async()=>({backendToken:'a'.repeat(64)})};
 try{
  const result={...evaluate(scenarios[0].input,{...scenarios[0].context,source:'rpc'}),id:'scope-check',operation:{category:'lending',label:'借贷候选',fields:{amount:'100',onBehalfOf:scenarios[0].input.transaction.from}},missingData:['头寸未计算','预言机未验证'],ai:{status:'failed',message:'HTTP 429'}};
  globalThis.fetch=async()=>new Response(JSON.stringify(result));const transaction=JSON.stringify(await invoke());assert.ok(transaction.includes('Scope of this analysis'));assert.ok(transaction.includes('Raw amount: 100'));assert.ok(transaction.includes('future prices'));assert.ok(transaction.includes('Base-currency fields are not automatically USD'));assert.ok(transaction.includes('Unfinished checks (2)'));
  const signature={...result,operation:{category:'siwe',label:'登录消息候选',fields:{domainName:'example.test'}}};globalThis.fetch=async()=>new Response(JSON.stringify(signature));const message=JSON.stringify(await onSignature({signature:{from:scenarios[0].input.transaction.from,signatureMethod:'personal_sign',data:'hello'}}));assert.ok(message.includes('does not verify a remote nonce store'));assert.ok(message.includes('does not force a block or continuously monitor after signing'));
 }finally{globalThis.fetch=original;(globalThis as any).snap=oldSnap;}
});

test('Snap home explains expanded partial coverage and manual-only entry points without making external calls',async()=>{
 const {onHomePage}=await import('../snap/src/index.js');const original=globalThis.fetch;
 try{globalThis.fetch=async()=>{throw Error('Home must not contact providers');};const text=JSON.stringify(await onHomePage());for(const phrase of ['include transfers as well as','Selected lending, vault and authority checks can compare state before and after an isolated execution','Currently requires explicit submission','does not force a block or continuously monitor after signing','A saved key does not prove'])assert.ok(text.includes(phrase),phrase);}finally{globalThis.fetch=original;}
});

test('large bounded evidence reports remain usable while Snap prioritizes risks and links to full evidence',async()=>{
 const original=globalThis.fetch,oldSnap=(globalThis as any).snap;(globalThis as any).snap={request:async()=>({backendToken:'a'.repeat(64)})};
 try{
  const base=evaluate(scenarios[0].input,{...scenarios[0].context,source:'rpc'});
  const checks=Array.from({length:110},(_,i)=>({title:i===109?'late-critical-evidence':`routine-${i}`,detail:'Observed bounded fixture.',status:i===109?'risk':'pass'}));
  globalThis.fetch=async()=>new Response(JSON.stringify({...base,id:'large-report',checks}));
  const result=JSON.stringify(await invoke());assert.ok(result.includes('late-critical-evidence'));assert.ok(result.includes('110 evidence items'));assert.ok(result.includes('large-report'));assert.ok(!result.includes('routine-30'));
 }finally{globalThis.fetch=original;(globalThis as any).snap=oldSnap;}
});

test('Snap test-session correlation is local-only, expires, and is forwarded separately from scored request data',async()=>{
 const {onRpcRequest}=await import('../snap/src/index.js');const previous=(globalThis as any).snap,original=globalThis.fetch;let state:any={backendToken:'a'.repeat(64)},headers:any,body:any;
 (globalThis as any).snap={request:async(value:any)=>{if(value.params.operation==='get')return state;state=value.params.newState;}};
 try{
  const request={jsonrpc:'2.0',id:1,method:'walletshield_test_session',params:{id:'12345678-abcd-abcd-abcd-123456789012'}};
  await assert.rejects(()=>onRpcRequest({origin:'https://evil.example',request} as any));
  await onRpcRequest({origin:'http://127.0.0.1:5173',request} as any);assert.equal(state.backendToken,'a'.repeat(64));
  globalThis.fetch=async(_url,init)=>{headers=init?.headers;body=JSON.parse(String(init?.body));return new Response('{}',{status:500});};
  await invoke();assert.equal(headers['X-WalletShield-Test-Session'],request.params.id);assert.ok(!JSON.stringify(body).includes(request.params.id));
  state.testSessionExpiresAt=0;await invoke();assert.equal(headers['X-WalletShield-Test-Session'],undefined);
 }finally{globalThis.fetch=original;(globalThis as any).snap=previous;}
});

test('chain-scoped contract-wallet pairing is verified, retained and fails closed on another or unobservable network',async()=>{
 const {onRpcRequest,onSignature}=await import('../snap/src/index.js');const oldSnap=(globalThis as any).snap,oldEthereum=(globalThis as any).ethereum,original=globalThis.fetch;
 let state:any=null,providerChain:string|undefined='0x7a69',scans=0,posted:any;
 (globalThis as any).snap={request:async(value:any)=>{if(value.params.operation==='get')return state;state=value.params.newState;}};
 (globalThis as any).ethereum={request:async()=>{if(!providerChain)throw Error('Provider unavailable');return providerChain;}};
 const result={...evaluate(scenarios[0].input,{...scenarios[0].context,source:'rpc'}),id:'bound-check'};
 globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/pair/status'))return new Response(JSON.stringify({paired:true,address:scenarios[0].input.transaction.from,chainId:31337,expiresAt:null}));scans++;posted=JSON.parse(String(init?.body));return new Response(JSON.stringify(result));};
 try{
  const configure={jsonrpc:'2.0',id:1,method:'walletshield_configure',params:{token:'a'.repeat(64)}};
  const paired:any=await onRpcRequest({origin:'http://127.0.0.1:5173',request:configure} as any);assert.equal(paired.chainId,31337);assert.equal(state.chainId,31337);
  await onRpcRequest({origin:'http://127.0.0.1:5173',request:{...configure,method:'walletshield_test_session',params:{id:'12345678-abcd-abcd-abcd-123456789012'}}} as any);assert.equal(state.chainId,31337,'A test session must not remove the contract-identity network binding');
  await invoke();assert.equal(scans,1);assert.equal(posted.chainId,31337);
  const signature={signature:{from:scenarios[0].input.transaction.from,signatureMethod:'personal_sign' as const,data:'hello'}};
  await onSignature(signature);assert.equal(scans,2);assert.equal(posted.chainId,31337);assert.equal(posted.signature.providerContext.chainId,31337);
  const wrongTransaction=JSON.stringify(await invoke('eip155:1'));assert.ok(wrongTransaction.includes('Reconnect on this network'));assert.ok(wrongTransaction.includes('No risk score was generated'));assert.equal(scans,2);
  providerChain='0x1';assert.ok(JSON.stringify(await onSignature(signature)).includes('Reconnect on this network'));assert.equal(scans,2);
  await assert.rejects(()=>onRpcRequest({origin:'http://127.0.0.1:5173',request:{...configure,method:'walletshield_status',params:{}}} as any),/contract-wallet pairing/);
  await assert.rejects(()=>onRpcRequest({origin:'http://127.0.0.1:5173',request:configure} as any),/contract-wallet pairing/);assert.equal(state.chainId,31337);
  providerChain=undefined;assert.ok(JSON.stringify(await onSignature(signature)).includes('Reconnect on this network'));assert.equal(scans,2);
 }finally{globalThis.fetch=original;(globalThis as any).snap=oldSnap;(globalThis as any).ethereum=oldEthereum;}
});
