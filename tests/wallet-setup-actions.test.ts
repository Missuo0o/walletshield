import test from 'node:test';
import assert from 'node:assert/strict';
import {createWalletAction} from '../web/src/walletAction.js';
import {connectWalletSetup,readWalletSnapSetup,verifyWalletSetupIdentity,installWalletSetup} from '../web/src/walletSetup.js';
import {SNAP_ID,type WalletProvider} from '../web/src/wallet.js';
const account='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),signature='0x'+'1'.repeat(130),token='a'.repeat(64);
const credential={token,address:account,expiresAt:new Date(Date.now()+3600000).toISOString()};
const metadata={[SNAP_ID]:{id:SNAP_ID,enabled:true,blocked:false,version:'0.1.0'}};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>resolve=yes);return {promise,resolve};}
const tick=()=>new Promise<void>(yes=>setImmediate(yes));
const action=(provider:WalletProvider,isCurrent=()=>true)=>createWalletAction(provider,{isCurrent,readTimeoutMs:10,promptTimeoutMs:10,timeoutMs:1000});
type Api=<T>(path:string,body?:unknown)=>Promise<T>;
const identityApi:Api=async path=>(path.endsWith('challenge')?{id:'challenge',message:'Offline login'}:credential) as any;

test('connection bounds an unanswered account-consent prompt and never continues after a late reply',async()=>{
 const gate=deferred<unknown>(),calls:string[]=[];const provider:WalletProvider={request:async args=>{calls.push(args.method);return gate.promise;}};
 const pending=connectWalletSetup(action(provider));await assert.rejects(pending,/cannot cancel a wallet prompt/);gate.resolve([account]);await tick();assert.deepEqual(calls,['eth_requestAccounts']);
});
test('connection tolerates the expected initial accountsChanged but rechecks the real selected account',async()=>{
 let identityEpoch=0;const provider:WalletProvider={request:async args=>{if(args.method==='eth_requestAccounts'){identityEpoch++;return[account];}return args.method==='eth_accounts'?[account]:'0x1';}};
 const connected=await connectWalletSetup(action(provider));assert.equal(identityEpoch,1);assert.deepEqual(connected,{accounts:[account],chainId:1});
 const changed:WalletProvider={request:async args=>args.method==='eth_requestAccounts'?[account]:[other]};await assert.rejects(connectWalletSetup(action(changed)),/account changed/);
 let selected=account;const silent:WalletProvider={request:async args=>{if(args.method==='eth_chainId'){selected=other;return'0x1';}return[selected];}};await assert.rejects(connectWalletSetup(action(silent)),/account changed/);
});
test('provider invalidation during connection releases the wait without requesting another account prompt',async()=>{
 const gate=deferred<unknown>(),calls:string[]=[];const provider:WalletProvider={request:async args=>{calls.push(args.method);return gate.promise;}},guard=action(provider);const pending=connectWalletSetup(guard);await tick();guard.cancel();await assert.rejects(pending,/changed/);gate.resolve([account]);await tick();assert.equal(calls.length,1);
});
test('Snap health checks use bounded read waits and cannot finish a late health response',async()=>{
 for(const stalled of ['wallet_getSnaps','wallet_invokeSnap','eth_accounts']){
  const gate=deferred<unknown>(),calls:string[]=[];const provider:WalletProvider={request:async args=>{calls.push(args.method);if(args.method===stalled)return gate.promise;return args.method==='wallet_getSnaps'?metadata:{paired:true};}};
  const pending=readWalletSnapSetup(action(provider),false);await assert.rejects(pending,/deadline/);const count=calls.length;gate.resolve(stalled==='wallet_getSnaps'?metadata:stalled==='eth_accounts'?[account]:{paired:true});await tick();assert.equal(calls.length,count);
 }
});
test('Snap health requires an actual connected account and a valid unexpired hosted pairing',async()=>{
 let accounts=[account],health:any={paired:true,address:account,expiresAt:credential.expiresAt};const provider:WalletProvider={request:async args=>args.method==='wallet_getSnaps'?metadata:args.method==='eth_accounts'?accounts:health};
 assert.equal((await readWalletSnapSetup(action(provider),true)).ready,true);accounts=[];assert.equal((await readWalletSnapSetup(action(provider),true)).ready,false);accounts=[account];health={paired:true,address:other,expiresAt:credential.expiresAt};assert.equal((await readWalletSnapSetup(action(provider),true)).ready,false);health={paired:true,address:account,expiresAt:new Date(0).toISOString()};assert.equal((await readWalletSnapSetup(action(provider),true)).ready,false);
});
test('identity signing timeout cannot send a late signature to the verification endpoint',async()=>{
 const gate=deferred<unknown>(),calls:string[]=[],posts:string[]=[];const provider:WalletProvider={request:async args=>{calls.push(args.method);if(args.method==='personal_sign')return gate.promise;return args.method==='eth_accounts'?[account]:'0x1';}},api:Api=async path=>{posts.push(path);return identityApi(path);};
 const pending=verifyWalletSetupIdentity(action(provider),account,api);await assert.rejects(pending,/cannot cancel a wallet prompt/);gate.resolve(signature);await tick();assert.deepEqual(posts,['/api/wallet-auth/challenge']);assert.equal(calls.filter(method=>method==='personal_sign').length,1);
});
test('a late identity credential after account/provider epoch invalidation is discarded before post-login reads',async()=>{
 const gate=deferred<any>(),entered=deferred<void>(),calls:string[]=[];let current=true;const provider:WalletProvider={request:async args=>{calls.push(args.method);return args.method==='personal_sign'?signature:args.method==='eth_accounts'?[account]:'0x1';}},guard=action(provider,()=>current),api:Api=async path=>{if(path.endsWith('verify')){entered.resolve();return gate.promise;}return identityApi(path);};
 const pending=verifyWalletSetupIdentity(guard,account,api);await entered.promise;current=false;guard.cancel();await assert.rejects(pending,/changed/);const count=calls.length;gate.resolve(credential);await tick();assert.equal(calls.length,count);assert.equal(calls.filter(method=>method==='eth_accounts').length,1);
});
test('Snap installation timeout does not request a pairing token or continue when installation answers late',async()=>{
 const gate=deferred<unknown>(),stages:string[]=[],posts:string[]=[];const provider:WalletProvider={request:async()=>gate.promise},api:Api=async path=>{posts.push(path);return {token} as any;};
 const pending=installWalletSetup(action(provider),false,api,stage=>stages.push(stage));await assert.rejects(pending,/cannot cancel a wallet prompt/);gate.resolve(metadata);await tick();assert.deepEqual(posts,[]);assert.deepEqual(stages,[]);
});
test('a configure prompt timeout prevents late readiness checks and never repeats the configuration',async()=>{
 const gate=deferred<unknown>(),calls:string[]=[],stages:string[]=[];const provider:WalletProvider={request:async args=>{calls.push(args.method);return args.method==='wallet_requestSnaps'?metadata:gate.promise;}},api:Api=async()=>({token}) as any;
 const pending=installWalletSetup(action(provider),false,api,stage=>stages.push(stage));await assert.rejects(pending,/cannot cancel a wallet prompt/);gate.resolve({configured:true});await tick();assert.deepEqual(calls,['wallet_requestSnaps','wallet_invokeSnap']);assert.deepEqual(stages,['pair-token','pair-backend']);
});
test('pairing context invalidation while the backend token is pending cannot configure another wallet',async()=>{
 const gate=deferred<any>(),entered=deferred<void>(),calls:string[]=[];const provider:WalletProvider={request:async args=>{calls.push(args.method);return metadata;}},guard=action(provider),api:Api=async()=>{entered.resolve();return gate.promise;};
 const pending=installWalletSetup(guard,false,api,()=>{});await entered.promise;guard.cancel();await assert.rejects(pending,/changed/);gate.resolve({token});await tick();assert.deepEqual(calls,['wallet_requestSnaps']);
});
test('completed installation pairs once and only returns success after matching Snap health',async()=>{
 const calls:string[]=[],stages:string[]=[];const provider:WalletProvider={request:async args=>{calls.push(args.method);return args.method==='wallet_requestSnaps'||args.method==='wallet_getSnaps'?metadata:args.method==='eth_accounts'?[account]:(args.params as any)?.request?.method==='walletshield_configure'?{configured:true}:{paired:true,address:account,expiresAt:credential.expiresAt};}},api:Api=async()=>({token}) as any;
 const result=await installWalletSetup(action(provider),true,api,stage=>stages.push(stage));assert.equal(result.status.ready,true);assert.equal(result.installed.version,'0.1.0');assert.deepEqual(stages,['pair-token','pair-backend','verify']);assert.deepEqual(calls,['wallet_requestSnaps','wallet_invokeSnap','wallet_getSnaps','wallet_invokeSnap','eth_accounts']);
});
