import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalWalletGuard,LOCAL_CHAIN_METADATA} from '../web/src/localWallet.js';
import type {WalletProvider} from '../web/src/wallet.js';

const account=`0x${'1'.repeat(40)}`,other=`0x${'2'.repeat(40)}`;
const quick={timeoutMs:300,readTimeoutMs:40,promptTimeoutMs:40,verificationTimeoutMs:40,pollIntervalMs:1};
type Request=Parameters<WalletProvider['request']>[0];
function providerWith(handler:(request:Request)=>Promise<unknown>){const calls:Request[]=[];return {calls,provider:{request:async(request:Request)=>{calls.push(request);return handler(request);}}};}
const stalled=()=>new Promise<never>(()=>{});

test('already-local wallet checks the captured account and never creates a network prompt',async()=>{
 const f=providerWith(async({method})=>method==='eth_accounts'?[account]:'0x7a69');
 const guard=createLocalWalletGuard(f.provider,account,quick);assert.equal(await guard.switchNetwork(),31337);
 assert.deepEqual(f.calls.map(c=>c.method),['eth_accounts','eth_chainId','eth_accounts','eth_chainId']);
});
test('local switch reuses confirmed switching and verifies both account and chain',async()=>{
 let chain='0x1';const f=providerWith(async({method})=>{if(method==='eth_accounts')return[account];if(method==='wallet_switchEthereumChain'){chain='0x7a69';return null;}return chain;});
 assert.equal(await createLocalWalletGuard(f.provider,account,quick).switchNetwork(),31337);
 assert.equal(f.calls.filter(c=>c.method==='wallet_switchEthereumChain').length,1);
 assert.ok(!f.calls.some(c=>c.method==='wallet_addEthereumChain'));
});
test('only unknown-local-chain adds canonical loopback metadata once and verifies without resubmitting the switch',async()=>{
 let chain='0x1';const f=providerWith(async({method})=>{if(method==='eth_accounts')return[account];if(method==='wallet_switchEthereumChain')throw{code:4902};if(method==='wallet_addEthereumChain'){chain='0x7a69';return null;}return chain;});
 await createLocalWalletGuard(f.provider,account,quick).switchNetwork();
 assert.deepEqual(f.calls.filter(c=>c.method==='wallet_addEthereumChain'),[{method:'wallet_addEthereumChain',params:[LOCAL_CHAIN_METADATA]}]);
 assert.equal(f.calls.filter(c=>c.method==='wallet_switchEthereumChain').length,1);
 assert.equal(LOCAL_CHAIN_METADATA.rpcUrls[0],'http://127.0.0.1:8545');
});
test('adding local metadata alone is not accepted if the wallet remains on the old chain',async()=>{
 const f=providerWith(async({method})=>{if(method==='eth_accounts')return[account];if(method==='wallet_switchEthereumChain')throw{code:4902};return method==='eth_chainId'?'0x1':null;});
 await assert.rejects(createLocalWalletGuard(f.provider,account,quick).switchNetwork(),/has not confirmed/);
 assert.equal(f.calls.filter(c=>c.method==='wallet_addEthereumChain').length,1);
});
test('a stalled account or chain read releases the local action before any wallet prompt',async()=>{
 for(const method of ['eth_accounts','eth_chainId']){
  const f=providerWith(async(args)=>args.method===method?stalled():[account]);
  await assert.rejects(createLocalWalletGuard(f.provider,account,{...quick,readTimeoutMs:10}).switchNetwork(),/pending request/);
  assert.ok(!f.calls.some(c=>c.method.startsWith('wallet_')));
 }
});
test('a stalled switch or add never causes an automatic retry or later identity checks',async()=>{
 for(const method of ['wallet_switchEthereumChain','wallet_addEthereumChain']){
  const f=providerWith(async args=>{if(args.method==='eth_accounts')return[account];if(args.method==='eth_chainId')return'0x1';if(args.method===method)return stalled();throw{code:4902};});
  await assert.rejects(createLocalWalletGuard(f.provider,account,{...quick,promptTimeoutMs:10}).switchNetwork(),/pending/);
  assert.equal(f.calls.at(-1)?.method,method);assert.equal(f.calls.filter(c=>c.method===method).length,1);
 }
});
test('wallet cancel and already-pending errors never add a network or resubmit requests',async()=>{
 for(const [code,pattern] of [[4001,/canceled/],[-32002,/already pending/]] as const){
  const f=providerWith(async({method})=>{if(method==='eth_accounts')return[account];if(method==='eth_chainId')return'0x1';throw{code};});
  await assert.rejects(createLocalWalletGuard(f.provider,account,quick).switchNetwork(),pattern);
  assert.equal(f.calls.filter(c=>c.method==='wallet_switchEthereumChain').length,1);assert.ok(!f.calls.some(c=>c.method==='wallet_addEthereumChain'));
 }
});
test('account mismatch and changed captured identity reject before continuing to another prompt',async()=>{
 const wrong=providerWith(async()=>[other]);await assert.rejects(createLocalWalletGuard(wrong.provider,account,quick).switchNetwork(),/account changed/);assert.equal(wrong.calls.length,1);
 let current=true;const changed=providerWith(async()=>{current=false;return[account];});
 await assert.rejects(createLocalWalletGuard(changed.provider,account,{...quick,isCurrent:()=>current}).switchNetwork(),/identity changed/);assert.equal(changed.calls.length,1);
});
test('account changes during switching and stale unknown-chain errors cannot continue the local action',async()=>{
 let chain='0x1',selected=account;const changed=providerWith(async({method})=>{if(method==='eth_accounts')return[selected];if(method==='wallet_switchEthereumChain'){chain='0x7a69';selected=other;return null;}return chain;});
 await assert.rejects(createLocalWalletGuard(changed.provider,account,quick).switchNetwork(),/account changed/);
 let current=true;const stale=providerWith(async({method})=>{if(method==='eth_accounts')return[account];if(method==='eth_chainId')return'0x1';current=false;throw{code:4902};});
 await assert.rejects(createLocalWalletGuard(stale.provider,account,{...quick,isCurrent:()=>current}).switchNetwork(),/identity changed/);
 assert.ok(!stale.calls.some(c=>c.method==='wallet_addEthereumChain'));
});
test('one overall deadline includes later identity checks and a late wallet reply cannot resume switching',async()=>{
 let resolve!:(value:unknown)=>void;const f=providerWith(async({method})=>method==='eth_accounts'?new Promise(yes=>{resolve=yes;}):'0x1');
 const guard=createLocalWalletGuard(f.provider,account,{...quick,timeoutMs:10,readTimeoutMs:100});await assert.rejects(guard.switchNetwork(),/pending/);
 resolve([account]);await new Promise(yes=>setTimeout(yes,2));assert.equal(f.calls.length,1);
 await assert.rejects(guard.checkIdentity(),/pending/);assert.equal(f.calls.length,1);
});
test('bounded provider also limits wallet display prompts without replacing the selected provider',async()=>{
 const f=providerWith(async()=>stalled());const guard=createLocalWalletGuard(f.provider,account,{...quick,promptTimeoutMs:10});
 await assert.rejects(guard.provider.request({method:'wallet_watchAsset',params:{type:'ERC20'}}),error=>(error as {code?:string}).code==='WALLETSHIELD_WALLET_TIMEOUT');
 assert.deepEqual(f.calls.map(c=>c.method),['wallet_watchAsset']);
});
