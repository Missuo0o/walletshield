import test from 'node:test';
import assert from 'node:assert/strict';
import {createLabInventoryController,type LabInventoryState} from '../web/src/labInventoryState.js';
import {requestPreparedAssetDisplay} from '../web/src/labAssetActions.js';
import type {LabInventory} from '../src/testing/contracts.js';
import type {WalletProvider} from '../web/src/wallet.js';

type Inventory={account:string;chainId:number;ready:boolean;block:number};
const alice='0x'+'1'.repeat(40),bob='0x'+'2'.repeat(40);
function snapshot(account=alice,ready=true,block=1):Inventory{return {account,chainId:31337,ready,block};}
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

test('latest inventory response wins; an older ready snapshot cannot overwrite current missing assets',async()=>{
 let visible:LabInventoryState<Inventory>|undefined;const controller=createLabInventoryController<Inventory>('wallet:alice:1',alice,state=>visible=state),older=deferred<Inventory>();
 const oldRequest=controller.refresh(()=>older.promise);await controller.refresh(async()=>snapshot(alice,false,2));
 older.resolve(snapshot(alice,true,1));await oldRequest;assert.equal(visible?.inventory?.ready,false);assert.equal(visible?.inventory?.block,2);
 const oldError=deferred<Inventory>();const pending=controller.refresh(()=>oldError.promise);await controller.refresh(async()=>snapshot(alice,true,3));oldError.reject(Error('old network failure'));await pending;
 assert.equal(visible?.inventory?.block,3);assert.equal(visible?.error,'');
});
test('inventory epochs discard late responses across A to B to A and after disposal',async()=>{
 const updates:LabInventoryState<Inventory>[]=[];const controller=createLabInventoryController<Inventory>('wallet:alice:1',alice,state=>updates.push(state)),older=deferred<Inventory>();
 const pending=controller.refresh(()=>older.promise);controller.reset('wallet:bob:2',bob);controller.reset('wallet:alice:3',alice);await controller.refresh(async()=>snapshot(alice,false,7));
 older.resolve(snapshot(alice,true,1));await pending;assert.equal(controller.state().identity,'wallet:alice:3');assert.equal(controller.state().inventory?.block,7);
 const afterUnmount=deferred<Inventory>();const unmounted=controller.refresh(()=>afterUnmount.promise);controller.dispose();const count=updates.length;afterUnmount.resolve(snapshot());await unmounted;assert.equal(updates.length,count);assert.equal(controller.state().inventory,null);
});
test('mutation invalidation cancels old reads and failed post-action verification never preserves ready state',async()=>{
 const controller=createLabInventoryController<Inventory>('wallet:alice:1',alice,()=>{});await controller.refresh(async()=>snapshot());
 const older=deferred<Inventory>();let signal!:AbortSignal;const pending=controller.refresh((_account,s)=>{signal=s;return older.promise;});controller.invalidate();assert.equal(signal.aborted,true);assert.equal(controller.state().inventory,null);
 await controller.refresh(async()=>{throw Error('partial preparation; inventory unavailable');});older.resolve(snapshot());await pending;
 assert.equal(controller.state().inventory,null);assert.equal(controller.state().loading,false);assert.match(controller.state().error,/partial preparation/);
});
test('inventory rejects another account or a public-chain response',async()=>{
 const controller=createLabInventoryController<Inventory>('wallet:alice:1',alice,()=>{});
 await controller.refresh(async()=>snapshot(bob));assert.equal(controller.state().inventory,null);assert.match(controller.state().error,/does not match/);
 await controller.refresh(async()=>({...snapshot(),chainId:1}));assert.equal(controller.state().inventory,null);assert.match(controller.state().error,/local chain/);
});

function displayInventory():LabInventory{
 return {account:alice,chainId:31337,blockNumber:'1',eth:'10',ready:true,
  assets:[{key:'base',address:alice,symbol:'TEST-USD',decimals:6,balanceRaw:'5000000000',balance:'5000',standard:'ERC20'},{key:'wrapped',address:bob,symbol:'WLAB',decimals:18,balanceRaw:'0',balance:'0',standard:'ERC20'}],
  nfts:[{address:alice,standard:'ERC721',id:'7',balance:'1'},{address:bob,standard:'ERC1155',id:'1',balance:'2'},{address:bob,standard:'ERC1155',id:'2',balance:'0'}],positions:{},note:''} as LabInventory;
}
test('prepared display requests include zero-balance lab tokens and owned NFTs with canonical wallet parameters',async()=>{
 const requests:{method:string;params?:unknown}[]=[];const provider={request:async(request:{method:string;params?:unknown})=>{requests.push(request);return true;}} as WalletProvider;
 let checks=0;const result=await requestPreparedAssetDisplay(provider,displayInventory(),async()=>{checks++;});
 assert.equal(result.displayed,4);assert.equal(checks,8);assert.equal(requests.length,4);
 assert.deepEqual(requests[1],{method:'wallet_watchAsset',params:{type:'ERC20',options:{address:bob,symbol:'WLAB',decimals:18}}});
 assert.deepEqual(requests[2],{method:'wallet_watchAsset',params:{type:'ERC721',options:{address:alice,tokenId:'7'}}});
 assert.deepEqual(requests[3],{method:'wallet_watchAsset',params:{type:'ERC1155',options:{address:bob,tokenId:'1'}}});
 assert.match(result.message,/experimental/);assert.match(result.message,/do not change on-chain balances/);
});
test('display refusals and unsupported NFTs do not fail successful funding or stop later prompts',async()=>{
 let count=0;const provider={request:async()=>{count++;if(count===1)return false;if(count===2)throw Object.assign(Error('Declined'),{code:4001});if(count===3)throw Object.assign(Error('Unsupported NFT'),{code:-32602});return true;}} as WalletProvider;
 const result=await requestPreparedAssetDisplay(provider,displayInventory(),async()=>{});assert.deepEqual({displayed:result.displayed,declined:result.declined,unavailable:result.unavailable},{displayed:1,declined:2,unavailable:1});assert.equal(count,4);
});
test('an identity change stops display prompts even when the account later looks the same',async()=>{
 let epoch=1,prompts=0;const capturedEpoch=epoch;const provider={request:async()=>{prompts++;epoch=3;return true;}} as WalletProvider;
 await assert.rejects(requestPreparedAssetDisplay(provider,displayInventory(),async()=>{if(epoch!==capturedEpoch)throw Error('Identity epoch changed');}),/Identity epoch/);
 assert.equal(prompts,1);
});
test('stalled or already-pending display stops without retrying and preserves successful funding semantics',async()=>{
 for(const code of [undefined,-32002]){
  let prompts=0;const provider:WalletProvider={request:async()=>{prompts++;if(code!==undefined)throw{code};return new Promise(()=>{});}};
  const result=await requestPreparedAssetDisplay(provider,displayInventory(),async()=>{},{requestTimeoutMs:10});
  assert.equal(prompts,1);assert.equal(result.pending,true);assert.equal(result.displayed,0);assert.match(result.message,/cannot cancel/);assert.match(result.message,/do not change on-chain balances/);
 }
});
test('late display approval after timeout cannot enqueue further display prompts',async()=>{
 let prompts=0,resolve!:(value:unknown)=>void;const provider:WalletProvider={request:async()=>{prompts++;return new Promise(yes=>{resolve=yes;});}};
 const result=await requestPreparedAssetDisplay(provider,displayInventory(),async()=>{},{requestTimeoutMs:10});assert.equal(result.pending,true);
 resolve(true);await new Promise(yes=>setTimeout(yes,2));assert.equal(prompts,1);assert.equal(result.displayed,0);
});
