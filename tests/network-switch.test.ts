import test from 'node:test';
import assert from 'node:assert/strict';
import {switchWalletNetwork} from '../web/src/networkSwitch.js';
import type {WalletProvider} from '../web/src/wallet.js';

const target=11155111;
const quick={requestTimeoutMs:100,verificationTimeoutMs:60,pollIntervalMs:1};

test('network switch goes directly to the wallet and returns its confirmed chain without an account query or security scan',async()=>{
 const calls:Parameters<WalletProvider['request']>[0][]=[];
 const provider:WalletProvider={request:async args=>{calls.push(args);return args.method==='wallet_switchEthereumChain'?null:'0xaa36a7';}};
 assert.equal(await switchWalletNetwork(provider,target,quick),target);
 assert.deepEqual(calls,[{method:'wallet_switchEthereumChain',params:[{chainId:'0xaa36a7'}]},{method:'eth_chainId'}]);
});

test('network switch tolerates a briefly stale provider chain before accepting confirmation',async()=>{
 let switches=0,reads=0;
 const provider:WalletProvider={request:async args=>{if(args.method==='wallet_switchEthereumChain'){switches++;return null;}return ++reads<3?'0x1':'0xaa36a7';}};
 assert.equal(await switchWalletNetwork(provider,target,quick),target);
 assert.equal(switches,1);assert.equal(reads,3);
});

test('a resolved switch request is not success when the wallet stays on the old network',async()=>{
 const provider:WalletProvider={request:async args=>args.method==='wallet_switchEthereumChain'?null:'0x1'};
 await assert.rejects(()=>switchWalletNetwork(provider,target,{...quick,verificationTimeoutMs:15}),/has not confirmed/);
});

test('a wallet prompt that never responds times out without retrying or reading chain state',async()=>{
 const calls:string[]=[];
 const provider:WalletProvider={request:args=>{calls.push(args.method);return new Promise(()=>{});}};
 await assert.rejects(()=>switchWalletNetwork(provider,target,{...quick,requestTimeoutMs:15}),/may still be pending/);
 assert.deepEqual(calls,['wallet_switchEthereumChain']);
});

test('a stalled chain confirmation also releases the request',async()=>{
 const provider:WalletProvider={request:args=>args.method==='wallet_switchEthereumChain'?Promise.resolve(null):new Promise(()=>{})};
 await assert.rejects(()=>switchWalletNetwork(provider,target,{...quick,verificationTimeoutMs:15}),/has not confirmed/);
});

test('canceled, unknown-network and already-pending prompts have actionable errors and no automatic additions',async()=>{
 for(const [code,message] of [[4001,/canceled/],[4902,/Add it using official network information/],[-32002,/already pending/]] as const){
  const calls:string[]=[];
  const provider:WalletProvider={request:async args=>{calls.push(args.method);throw {code};}};
  await assert.rejects(()=>switchWalletNetwork(provider,target,quick),message);
  assert.deepEqual(calls,['wallet_switchEthereumChain']);
 }
});

test('a changed provider or account cannot return stale confirmation',async()=>{
 let current=true;const calls:string[]=[];
 const provider:WalletProvider={request:async args=>{calls.push(args.method);current=false;return null;}};
 await assert.rejects(()=>switchWalletNetwork(provider,target,{...quick,isCurrent:()=>current}),/changed/);
 assert.deepEqual(calls,['wallet_switchEthereumChain']);
});

test('invalid chains and stale page contexts do not send wallet requests',async()=>{
 let calls=0;const provider:WalletProvider={request:async()=>{calls++;return null;}};
 for(const chain of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1])await assert.rejects(()=>switchWalletNetwork(provider,chain),/valid wallet network/);
 await assert.rejects(()=>switchWalletNetwork(provider,target,{isCurrent:()=>false}),/changed/);
 assert.equal(calls,0);
});
