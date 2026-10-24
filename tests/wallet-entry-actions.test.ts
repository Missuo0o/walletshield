import test from 'node:test';
import assert from 'node:assert/strict';
import {createWalletAction} from '../web/src/walletAction.js';
import type {WalletProvider} from '../web/src/wallet.js';
import {elements,walletComponentHarness} from './fixtures/wallet-ui-harness.js';
const account=`0x${'1'.repeat(40)}`,other=`0x${'2'.repeat(40)}`,signature=`0x${'1'.repeat(130)}`;
type Request=Parameters<WalletProvider['request']>[0];
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>resolve=yes);return {promise,resolve};}
const tick=()=>new Promise<void>(yes=>setImmediate(yes));

test('wallet-action timeouts close the action and late replies cannot enqueue a new prompt',async()=>{
 const gate=deferred<unknown>(),calls:string[]=[];const provider:WalletProvider={request:async args=>{calls.push(args.method);return gate.promise;}};
 const action=createWalletAction(provider,{isCurrent:()=>true,readTimeoutMs:10});const reading=action.request({method:'eth_accounts'});await assert.rejects(reading,/deadline/);gate.resolve([account]);await tick();
 await assert.rejects(action.request({method:'personal_sign',params:['0x',account]},true),/deadline/);assert.deepEqual(calls,['eth_accounts']);
});
test('an invalidated action releases an open prompt without claiming cancellation or retrying it',async()=>{
 const gate=deferred<unknown>(),calls:string[]=[];const provider:WalletProvider={request:async args=>{calls.push(args.method);return gate.promise;}};
 const action=createWalletAction(provider,{isCurrent:()=>true,promptTimeoutMs:5000});const waiting=action.request({method:'personal_sign',params:['0x',account]},true);await tick();action.cancel();await assert.rejects(waiting,/changed/);gate.resolve(signature);await tick();assert.deepEqual(calls,['personal_sign']);
});
test('a wallet prompt deadline is actionable, does not automatically retry, and rejects late continuations',async()=>{
 let calls=0;const provider:WalletProvider={request:async()=>{calls++;return new Promise(()=>{});}};const action=createWalletAction(provider,{isCurrent:()=>true,promptTimeoutMs:10});
 await assert.rejects(action.request({method:'personal_sign'},true),/cannot cancel a wallet prompt/);await assert.rejects(action.request({method:'eth_chainId'}),/cannot cancel/);assert.equal(calls,1);
});

test('public signing callback discards late status replies across account, provider and A-to-B-to-A changes',async()=>{
 const h=await walletComponentHarness('PublicWalletCheck'),oldWindow=(globalThis as any).window,oldApi=(globalThis as any).__walletUiTestApi;
 try{
  (globalThis as any).window={location:{origin:'https://workbench.example'}};(globalThis as any).__walletUiTestApi=async()=>[];
  for(const variant of ['account','provider','round-trip']){
   const entered=deferred<void>(),health=deferred<unknown>(),calls:Request[]=[],busy:boolean[]=[];
   const provider:WalletProvider={request:async args=>{calls.push(args);if(args.method==='eth_accounts')return[account];if(args.method==='eth_chainId')return'0x1';if(args.method==='wallet_invokeSnap'){entered.resolve();return health.promise;}return signature;}};
   const props={provider,account,chainId:1,configured:true,snapReady:true,busy:false,onBusy:(value:boolean)=>busy.push(value)};
   const run=elements(h.renderComponent(props),'button')[0].props.onClick();await entered.promise;
   h.renderComponent({...props,...(variant==='provider'?{provider:{request:async()=>null}}:{account:other})});if(variant==='round-trip')h.renderComponent(props);
   health.resolve({paired:true});await run;assert.equal(calls.filter(c=>c.method==='personal_sign').length,0,variant);assert.equal(h.state()[2],null);assert.equal(busy.at(-1),false);h.dispose();
  }
 }finally{await h.close();(globalThis as any).window=oldWindow;(globalThis as any).__walletUiTestApi=oldApi;}
});
test('public signing rechecks the real account after health and never signs an old account after silent wallet selection change',async()=>{
 const h=await walletComponentHarness('PublicWalletCheck'),oldWindow=(globalThis as any).window,oldApi=(globalThis as any).__walletUiTestApi;let selected=account;const calls:Request[]=[];
 try{
  (globalThis as any).window={location:{origin:'https://workbench.example'}};(globalThis as any).__walletUiTestApi=async()=>[];
  const provider:WalletProvider={request:async args=>{calls.push(args);if(args.method==='eth_accounts')return[selected];if(args.method==='eth_chainId')return'0x1';if(args.method==='wallet_invokeSnap'){selected=other;return{paired:true};}return signature;}};
  const tree=h.renderComponent({provider,account,chainId:1,configured:true,snapReady:true,busy:false,onBusy:()=>{}});await elements(tree,'button')[0].props.onClick();assert.equal(calls.filter(c=>c.method==='personal_sign').length,0);assert.match(String(h.state()[1]),/check the account/);
 }finally{await h.close();(globalThis as any).window=oldWindow;(globalThis as any).__walletUiTestApi=oldApi;}
});
test('public signing only displays a paired-Snap report matching the unique message, not a website-only report',async()=>{
 const h=await walletComponentHarness('PublicWalletCheck'),oldWindow=(globalThis as any).window,oldApi=(globalThis as any).__walletUiTestApi;
 try{
  (globalThis as any).window={location:{origin:'https://workbench.example'}};
  for(const channel of ['workbench','paired-snap']){
   let data='';const provider:WalletProvider={request:async args=>{if(args.method==='eth_accounts')return[account];if(args.method==='eth_chainId')return'0x1';if(args.method==='wallet_invokeSnap')return{paired:true};data=(args.params as string[])[0];return signature;}};
   (globalThis as any).__walletUiTestApi=async()=>[{id:'matched',capture:{channel},request:{kind:'signature',signature:{from:account,data}}}];
   await elements(h.renderComponent({provider,account,chainId:1,configured:true,snapReady:true,busy:false,onBusy:()=>{}}),'button')[0].props.onClick();
   assert.equal((h.state()[2] as {id?:string}|null)?.id,channel==='paired-snap'?'matched':undefined);if(channel==='workbench')assert.match(String(h.state()[1]),/No Snap report/);h.dispose();
  }
 }finally{await h.close();(globalThis as any).window=oldWindow;(globalThis as any).__walletUiTestApi=oldApi;}
});
test('public signing discards a report arriving after a provider change on the same account and network',async()=>{
 const h=await walletComponentHarness('PublicWalletCheck'),oldWindow=(globalThis as any).window,oldApi=(globalThis as any).__walletUiTestApi;
 try{
  (globalThis as any).window={location:{origin:'https://workbench.example'}};const entered=deferred<void>(),gate=deferred<unknown>();let data='';
  const provider:WalletProvider={request:async args=>{if(args.method==='eth_accounts')return[account];if(args.method==='eth_chainId')return'0x1';if(args.method==='wallet_invokeSnap')return{paired:true};data=(args.params as string[])[0];return signature;}};
  (globalThis as any).__walletUiTestApi=async()=>{entered.resolve();return gate.promise;};const props={provider,account,chainId:1,configured:true,snapReady:true,busy:false,onBusy:()=>{}};
  const run=elements(h.renderComponent(props),'button')[0].props.onClick();await entered.promise;h.renderComponent({...props,provider:{request:async()=>null}});gate.resolve([{id:'stale',capture:{channel:'paired-snap'},request:{kind:'signature',signature:{from:account,data}}}]);await run;assert.equal(h.state()[2],null);assert.equal(h.state()[0],'');
 }finally{await h.close();(globalThis as any).window=oldWindow;(globalThis as any).__walletUiTestApi=oldApi;}
});

test('lab callback does not issue a captured signature or transaction after account/provider changes during session creation',async()=>{
 const h=await walletComponentHarness('WalletLab'),original=globalThis.fetch;
 try{
  for(const kind of ['signature','transaction'])for(const variant of ['account','provider','round-trip']){
   const entered=deferred<void>(),gate=deferred<void>(),calls:Request[]=[],posts:string[]=[],busy:boolean[]=[];
   const request=kind==='signature'?{kind,chainId:31337,signature:{from:account,method:'personal_sign',data:'0x6869'}}:{kind,chainId:31337,transaction:{from:account,to:other,value:'0x1',data:'0x'}};
   const session={id:'fixture',caseId:'approve-unlimited',createdAt:new Date().toISOString(),request,status:'pending',token:'synthetic-token'};
   globalThis.fetch=async path=>{let data:unknown;if(String(path)==='/api/lab/status')data={ready:true,unavailable:[],cases:[{id:'approve-unlimited',kind,group:'Fixture',name:'Fixture'}]};else if(String(path)==='/api/lab/sessions')data=[];else if(String(path)==='/api/lab/begin'){entered.resolve();await gate.promise;data=session;}else{posts.push(String(path));data=session;}return new Response(JSON.stringify(data));};
   const provider:WalletProvider={request:async args=>{calls.push(args);if(args.method==='eth_accounts')return[account];if(args.method==='eth_chainId')return'0x7a69';if(args.method==='wallet_invokeSnap')return{};return signature;}};
   const props={provider,externalBusy:false,account,snapReady:true,inventory:{ready:true},inventoryLoading:false,inventoryError:'',preparing:false,clearing:false,onPrepare:async()=>{},onClear:async()=>{},onRefreshInventory:async()=>{},onSetup:()=>{},onBusy:(value:boolean)=>busy.push(value),switchLocal:async()=>{}};
   h.renderComponent(props);await tick();await tick();const button=elements(h.renderComponent(props),'button').find(b=>String(b.props.className).includes('primary wide'));assert.ok(button);const run=button.props.onClick();await entered.promise;
   h.renderComponent({...props,...(variant==='provider'?{provider:{request:async()=>null}}:{account:other})});if(variant==='round-trip')h.renderComponent(props);gate.resolve();await run;
   assert.ok(!calls.some(c=>c.method==='personal_sign'||c.method==='eth_sendTransaction'),`${kind}:${variant}`);assert.equal(posts.length,0);assert.equal(busy.at(-1),false);h.dispose();
  }
 }finally{globalThis.fetch=original;await h.close();}
});
