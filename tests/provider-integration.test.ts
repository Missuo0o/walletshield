import test from 'node:test';
import assert from 'node:assert/strict';
import {createWalletShieldProvider,normalizeProviderRequest,type ProviderRequest,type ProviderAdvisory} from '../src/integration/provider.js';
import {assess} from '../src/security/rules.js';
import {decodeRequest} from '../src/security/decode.js';
import type {SecurityRequest} from '../src/security/types.js';
const account=`0x${'11'.repeat(20)}`,target=`0x${'22'.repeat(20)}`,context=()=>({chainId:1,account,origin:'https://dapp.example/path'});
const report=()=>{const value=assess({kind:'transaction',chainId:1,transaction:{from:account,to:target,data:'0x',value:'0x1'}},[]);value.level='high';value.score=99;value.scoreSource='ai';return value;};
const permission:ProviderRequest={method:'wallet_grantPermissions',params:[{owner:account,permissions:[{target,amount:'100'}]}]};
test('SDK reports high risk or analysis failure but forwards the original request exactly once and preserves wallet cancellation',async()=>{
 for(const failure of [false,true]){const forwarded:ProviderRequest[]=[],events:ProviderAdvisory[]=[],cancellation=Object.assign(Error('Wallet user rejected'),{code:4001}),provider={request:async(args:ProviderRequest)=>{forwarded.push(args);throw cancellation;}};
  const wrapped=createWalletShieldProvider(provider,{context,analyze:async()=>{if(failure)throw Error('Evidence unavailable');return report();},onAdvisory:event=>{events.push(event);throw Error('Broken advisory UI');}});
  await assert.rejects(wrapped.request(permission),error=>error===cancellation);assert.equal(forwarded.length,1);assert.deepEqual(forwarded[0],permission);assert.equal(events.length,1);assert.equal(events[0].source,'integration-sdk');assert.equal(failure?events[0].unavailable:events[0].report?.level,failure?'Evidence unavailable':'high');
 }
});
test('default SDK bypasses reads, internal Snap traffic and transaction/signature hooks; explicit connection has no fabricated params',async()=>{
 const forwarded:ProviderRequest[]=[],seen:SecurityRequest[]=[],provider={request:async(args:ProviderRequest)=>{forwarded.push(args);return 'wallet-result';}},wrapped=createWalletShieldProvider(provider,{context,analyze:async request=>{seen.push(request);return report();},onAdvisory:()=>{}});
 for(const method of ['eth_accounts','eth_chainId','eth_blockNumber','eth_gasPrice','eth_feeHistory','eth_maxPriorityFeePerGas','eth_syncing','eth_getBalance','eth_call','eth_estimateGas','eth_estimateUserOperationGas','eth_subscribe','eth_unsubscribe','net_version','web3_clientVersion','wallet_getPermissions','wallet_getSnaps','wallet_requestSnaps','wallet_invokeSnap','metamask_getProviderState','eth_sendTransaction','eth_signTransaction','personal_sign','eth_signTypedData_v4'])assert.equal(await wrapped.request({method,params:[]}), 'wallet-result');
 assert.equal(seen.length,0);assert.equal(forwarded.length,24);assert.equal(await wrapped.request({method:'eth_requestAccounts'}),'wallet-result');assert.equal(seen.length,1);assert.equal(seen[0].kind,'permission');assert.deepEqual(seen[0].kind==='permission'?seen[0].params:null,[]);assert.deepEqual(forwarded.at(-1),{method:'eth_requestAccounts'});
});
test('caller mutations and analyzer/advisory changes cannot alter the forwarded typed-data snapshot',async()=>{
 const args:ProviderRequest={method:'eth_signTypedData_v4',params:[account,{types:{Example:[{name:'value',type:'uint256'}]},primaryType:'Example',domain:{chainId:1},message:{value:'100'}}]},expected=structuredClone(args),forwarded:ProviderRequest[]=[];let release!:()=>void,entered!:()=>void;const started=new Promise<void>(resolve=>entered=resolve),gate=new Promise<void>(resolve=>release=resolve);
 const wrapped=createWalletShieldProvider({request:async request=>{forwarded.push(request);return 'signed';}},{context,analyzeSignatures:true,analyze:async request=>{assert.equal(request.kind,'signature');if(request.kind==='signature'){(request.signature.data as any).message.value='999';(request.signature.data as any).domain.chainId=666;}entered();await gate;const value=report();value.request=request;return value;},onAdvisory:event=>{if(event.report?.request.kind==='signature')(event.report.request.signature.data as any).message.value='callback-mutation';}});
 const outcome=wrapped.request(args);await started;((args.params as any[])[1].message).value='caller-mutation';release();assert.equal(await outcome,'signed');assert.equal(forwarded.length,1);assert.deepEqual(forwarded[0],expected);
});
test('analysis timeout and a never-settling advisory remain bounded and never become a policy gate',async()=>{
 const events:ProviderAdvisory[]=[],forwarded:ProviderRequest[]=[],signals:AbortSignal[]=[];let resolveLate!:(value:ReturnType<typeof report>)=>void;const late=new Promise<ReturnType<typeof report>>(resolve=>resolveLate=resolve);
 const wrapped=createWalletShieldProvider({request:async args=>{forwarded.push(args);return 'wallet';}},{context,timeoutMs:15,analyze:async(_request,signal)=>{signals.push(signal);return late;},onAdvisory:async event=>{events.push(event);await new Promise(()=>{});}});
 const started=Date.now();assert.equal(await wrapped.request(permission),'wallet');assert.ok(Date.now()-started<2500);assert.equal(signals[0].aborted,true);assert.match(events[0].unavailable??'',/timed out/);assert.equal(forwarded.length,1);resolveLate(report());await new Promise(resolve=>setTimeout(resolve,10));assert.equal(forwarded.length,1);
});
test('concurrent integration requests do not recursively analyze and preserve each exact original forwarding',async()=>{
 let release!:(value:ReturnType<typeof report>)=>void;const gate=new Promise<ReturnType<typeof report>>(resolve=>release=resolve),forwarded:ProviderRequest[]=[],events:ProviderAdvisory[]=[];let analyses=0;
 const wrapped=createWalletShieldProvider({request:async args=>{forwarded.push(args);return args.method;}},{context,analyze:async()=>{analyses++;return gate;},onAdvisory:event=>{events.push(event);}});
 const first=wrapped.request(permission),second={method:'wallet_createSession',params:[{owner:account}]};assert.equal(await wrapped.request(second),second.method);assert.equal(analyses,1);release(report());await first;assert.equal(forwarded.length,2);assert.deepEqual(forwarded,[second,permission]);assert.match(events[0].unavailable??'',/in progress/);
});
test('unsupported transaction fields remain explicit in analysis and untouched when forwarded; malformed or truncated inputs become unavailable',async()=>{
 const args:ProviderRequest={method:'eth_sendTransaction',params:[{from:account,to:target,data:'0x',value:'0x1',type:'0x3',blobVersionedHashes:[`0x${'ab'.repeat(32)}`],maxFeePerBlobGas:'0x2',accessList:[{address:target,storageKeys:[]}]}]},seen:SecurityRequest[]=[],events:ProviderAdvisory[]=[],forwarded:ProviderRequest[]=[];
 const wrapped=createWalletShieldProvider({request:async arg=>{forwarded.push(arg);return true;}},{context,analyzeTransactions:true,analyze:async request=>{seen.push(request);return report();},onAdvisory:event=>{events.push(event);}});
 await wrapped.request(args);assert.equal(seen[0].kind,'transaction');if(seen[0].kind==='transaction')for(const field of ['type_blob','blobVersionedHashes','maxFeePerBlobGas','accessList'])assert.ok(seen[0].transaction.unsupportedFields?.includes(field as any));assert.deepEqual(forwarded[0],args);
 await wrapped.request({method:'eth_sendRawTransaction',params:['0x1234']});await wrapped.request({method:'wallet_createSession',params:[{grants:Array.from({length:65},()=>({target}))}]});assert.equal(seen.length,1);assert.equal(forwarded.length,3);assert.match(events[1].unavailable??'',/already signed/);assert.match(events[2].unavailable??'',/exceeds the analysis budget/);
 assert.throws(()=>normalizeProviderRequest(permission,{...context(),chainId:0}));assert.throws(()=>normalizeProviderRequest({method:'eth_sendTransaction',params:[{from:target,to:account,data:'0x'}]},context()),/differs/);
});
test('SDK advisory discloses its public unsigned input subset without adding trusted client flags to backend requests',async()=>{
 const events:ProviderAdvisory[]=[],seen:SecurityRequest[]=[],forwarded:ProviderRequest[]=[],args:ProviderRequest={method:'eth_sendUserOperation',params:[{sender:account,nonce:'0x1',callData:'0x12345678',signature:'OMITTED_AUTHORIZATION',session_key:'OMITTED_SESSION_SECRET'},target]};
 const wrapped=createWalletShieldProvider({request:async input=>{forwarded.push(input);return 'wallet';}},{context,analyze:async request=>{seen.push(request);return report();},onAdvisory:event=>{events.push(event);}});
 assert.equal(await wrapped.request(args),'wallet');assert.equal(events.length,1);assert.equal(events[0].publicFieldsOnly,true);assert.equal(events[0].inputFieldsRemoved,true);assert.match(events[0].note??'',/omitted.*unverified/);assert.ok(!JSON.stringify(seen[0]).includes('OMITTED_'));assert.ok(!Object.hasOwn(seen[0],'publicFieldsOnly'));assert.deepEqual(forwarded,[args]);
});
test('SDK preserves input aliases and explicit transaction networks, and rejects conflicting or unknown execution semantics only for analysis',async()=>{
 const calldata=`0x095ea7b3${target.slice(2).padStart(64,'0')}${'1'.padStart(64,'0')}`,seen:SecurityRequest[]=[],events:ProviderAdvisory[]=[],forwarded:ProviderRequest[]=[];
 const wrapped=createWalletShieldProvider({request:async args=>{forwarded.push(args);return 'forwarded';}},{context,analyzeTransactions:true,analyze:async request=>{seen.push(request);return report();},onAdvisory:event=>{events.push(event);}});
 for(const chainId of ['0x1','1',1]){const args:ProviderRequest={method:'eth_sendTransaction',params:[{from:account,to:target,input:calldata,chainId}]};assert.equal(await wrapped.request(args),'forwarded');const normalized=seen.at(-1)!;assert.equal(normalized.kind,'transaction');if(normalized.kind==='transaction')assert.equal(normalized.transaction.data,calldata);assert.equal(decodeRequest(normalized).category,'approval');assert.deepEqual(forwarded.at(-1),args);}
 const equivalent:ProviderRequest={method:'eth_signTransaction',params:[{from:account,to:target,data:calldata,input:'0x'+calldata.slice(2).toUpperCase(),chainId:'0x1'}]};await wrapped.request(equivalent);assert.equal(seen.length,4);assert.deepEqual(forwarded.at(-1),equivalent);
 for(const extra of [{chainId:'0x2'},{chainId:null},{chainId:9007199254740992},{data:'0x',input:calldata},{input:'0x123'},{data:null},{customData:{rollupGas:100}},{gasLimit:'0x1000'}]){const args:ProviderRequest={method:'eth_sendTransaction',params:[{from:account,to:target,data:calldata,...extra}]};const before:number=seen.length;assert.equal(await wrapped.request(args),'forwarded');assert.equal(seen.length,before);assert.ok(events.at(-1)?.unavailable);assert.equal(events.at(-1)?.report,undefined);assert.deepEqual(forwarded.at(-1),args);}
 assert.equal(forwarded.length,12);assert.equal(seen.length,4);
 const extraParams:ProviderRequest={method:'eth_sendTransaction',params:[{from:account,to:target,data:calldata},{extraExecution:'unknown'}]};await wrapped.request(extraParams);assert.match(events.at(-1)?.unavailable??'',/Exactly one/);assert.deepEqual(forwarded.at(-1),extraParams);
});
test('non-JSON transaction parameters never produce a normalized substitute or prevent exactly-once forwarding',async()=>{
 const events:ProviderAdvisory[]=[],forwarded:ProviderRequest[]=[];let analyzed=0;const wrapped=createWalletShieldProvider({request:async args=>{forwarded.push(args);return 'wallet';}},{context,analyzeTransactions:true,analyze:async()=>{analyzed++;return report();},onAdvisory:event=>{events.push(event);}});
 for(const value of [1n,Number.NaN,undefined,()=>1,new Date()]){const args:ProviderRequest={method:'eth_sendTransaction',params:[{from:account,to:target,data:'0x',value}]};assert.equal(await wrapped.request(args),'wallet');assert.ok(events.at(-1)?.unavailable);assert.equal(events.at(-1)?.report,undefined);assert.deepEqual(forwarded.at(-1),args);}
 const cyclic:any={from:account,to:target,data:'0x'};cyclic.loop=cyclic;const args:ProviderRequest={method:'eth_sendTransaction',params:[cyclic]};await wrapped.request(args);assert.match(events.at(-1)?.unavailable??'',/Non-JSON/);assert.equal(analyzed,0);assert.equal(forwarded.length,6);
});
test('SDK withholds a completed report if the integrating app reports a changed account, chain or origin, while forwarding once',async()=>{
 for(const changed of [{chainId:2},{account:target},{origin:'https://other.example'}]){
  let current=context(),release!:(value:ReturnType<typeof report>)=>void,entered!:()=>void;const started=new Promise<void>(resolve=>entered=resolve),gate=new Promise<ReturnType<typeof report>>(resolve=>release=resolve),events:ProviderAdvisory[]=[],forwarded:ProviderRequest[]=[];
  const wrapped=createWalletShieldProvider({request:async args=>{forwarded.push(args);return 'wallet';}},{context:()=>current,analyze:async()=>{entered();return gate;},onAdvisory:event=>{events.push(event);}}),pending=wrapped.request(permission);await started;current={...current,...changed};release(report());assert.equal(await pending,'wallet');assert.equal(events.length,1);assert.match(events[0].unavailable??'',/context changed/);assert.equal(events[0].report,undefined);assert.deepEqual(forwarded,[permission]);
 }
});
