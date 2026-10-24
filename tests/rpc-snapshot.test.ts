import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,encodeFunctionResult,parseAbi} from 'viem';
import {pinnedRpc,rpcSnapshotGuard} from '../src/security/trusted-rpc.js';
import {evidence} from '../src/security/evidence.js';
import {accountEvidence,accountStateAbi} from '../src/security/account-evidence.js';
import {protocolEvidence} from '../src/security/protocols.js';
import {decodeRequest} from '../src/security/decode.js';
import type {Evidence,SecurityRequest} from '../src/security/types.js';
import type {SecurityConfig} from '../src/security/config.js';
const firstHash=`0x${'a'.repeat(64)}`,secondHash=`0x${'b'.repeat(64)}`,at=`0x${'1'.repeat(40)}`,owner=`0x${'2'.repeat(40)}`;
const header={number:'0x10',hash:firstHash,timestamp:'0x100'};
const config:SecurityConfig={apiKey:'',model:'unused',aiEnabled:false,lookups:true,goPlusToken:'',rpc:{1:'https://server-only.example/rpc'},forkEnabled:false};
const observations=():Evidence[]=>[
 evidence('encoded','warning','Signed commitment','Preserve independently encoded fields.','eip712',{owner,value:'100'}),
 evidence('balance','pass','Observed balance','State observation.','rpc',{chainId:1,blockNumber:'16',blockHash:firstHash,balance:'999'}),
 evidence('comparison','risk','State comparison','Derived from the related balance.','rpc',{chainId:1,blockNumber:'16',exceedsBalance:true}),
 evidence('pending','warning','Pending range','Dependent on the confirmed nonce.','rpc',{chainId:1,pendingNonce:'10',confirmedNonce:'9'}),
];
const guard=(verify:()=>Promise<{chain:unknown;header:any}>)=>rpcSnapshotGuard(1,16n,header,verify);
function fakeRpc(handle:(body:any)=>any){const calls:any[]=[];const fetcher:typeof fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));calls.push(body);const value=await handle(body);return Response.json({jsonrpc:'2.0',id:body.id,...(value&&typeof value==='object'&&'error'in value?value:{result:value})});};return {fetcher,calls};}
function unavailable(checks:Evidence[]){assert.equal(checks[0].source,'eip712');assert.equal(checks[0].data?.value,'100');for(const item of checks.filter(item=>item.source==='rpc')){assert.equal(item.status,'unknown');assert.equal(item.data?.snapshotConsistent,false);assert.equal(item.data?.blockHash,undefined);assert.equal(item.data?.balance,undefined);assert.equal(item.data?.exceedsBalance,undefined);assert.equal(item.data?.confirmedNonce,undefined);}}

test('ordinary RPC groups retain facts only after matching canonical chain, block hash and timestamp recheck',async()=>{
 const checks=observations(),fixed=guard(async()=>({chain:1,header:{number:16n,hash:firstHash.toUpperCase().replace('0X','0x'),timestamp:256n}}));
 assert.equal(await fixed.finish(checks,'test'),true);assert.equal(checks.length,4);assert.equal(checks[1].data?.balance,'999');assert.equal(checks[1].data?.snapshotConsistency,'verified_before_after');assert.equal(checks[3].data?.blockHash,undefined,'The node pending view must never inherit a fixed block hash.');
});
test('missing, malformed or mismatched initial headers cannot create a snapshot guard',()=>{
 for(const initial of [undefined,{...header,hash:'0x00'},{...header,timestamp:undefined},{...header,timestamp:'-1'},{...header,number:'0x11'},{...header,number:16},{...header,timestamp:256}])assert.throws(()=>rpcSnapshotGuard(1,16n,initial,async()=>({chain:1,header})),/Complete snapshot/);
});
test('reorg, wrong chain, height or timestamp invalidate all previously collected state and derived comparisons',async()=>{
 for(const current of [{chain:'0x1',header:{...header,hash:secondHash}},{chain:'0x2',header},{chain:'0x1',header:{...header,number:'0x11'}},{chain:'0x1',header:{...header,timestamp:'0x101'}},{chain:'0x1',header:null},{chain:'0x1',header:{...header,hash:'malformed'}}]){
  const checks=observations();assert.equal(await guard(async()=>current).finish(checks,'test'),false);unavailable(checks);assert.equal(checks.at(-1)?.id,'test_snapshot');
 }
});
test('a failed or hanging final verification discards the group under a bounded deadline',async()=>{
 const checks=observations(),started=Date.now();assert.equal(await guard(()=>new Promise(()=>{})).finish(checks,'test'),false);assert.ok(Date.now()-started<3500);unavailable(checks);
});
test('a concurrent stale verification cannot reset a previously invalidated snapshot',async()=>{
 let release!:(value:{chain:number;header:typeof header})=>void;let calls=0;
 const fixed=guard(async()=>++calls===1?await new Promise(resolve=>{release=resolve;}):{chain:1,header:{...header,hash:secondHash}});
 const pending=fixed.check();await new Promise(resolve=>setImmediate(resolve));assert.equal(await fixed.check(),false);release({chain:1,header});assert.equal(await pending,false);const checks=observations();assert.equal(await fixed.finish(checks,'test'),false);unavailable(checks);
});
test('pinned RPC prefers EIP-1898 block hashes and finalizes concurrent hash-bound reads together',async()=>{
 let changed=false;const fixture=fakeRpc(body=>body.method==='eth_chainId'?'0x1':body.method==='eth_getBlockByNumber'?{...header,...(changed?{hash:secondHash}:{})}:body.method==='eth_getCode'?'0x6000':body.method==='eth_getBalance'?'0x64':undefined);
 const client=await pinnedRpc(config,1,fixture.fetcher);const [code,balance]=await Promise.all([client.code(at),client.call('eth_getBalance',[owner,client.tag])]);assert.equal(code,'0x6000');assert.equal(balance,'0x64');
 for(const request of fixture.calls.filter(body=>['eth_getCode','eth_getBalance'].includes(body.method)))assert.deepEqual(request.params.at(-1),{blockHash:firstHash,requireCanonical:true});
 changed=true;const checks=observations();assert.equal(await client.finalize(checks,'test'),false);unavailable(checks);
});
test('providers rejecting hash selectors may fall back only with before/after canonical checks',async()=>{
 let numeric=0;const fixture=fakeRpc(body=>{
  if(body.method==='eth_chainId')return '0x1';if(body.method==='eth_getBlockByNumber')return header;
  if(body.method==='eth_getCode'){if(typeof body.params.at(-1)==='object')return {error:{code:-32602,message:'Invalid block selector'}};numeric++;return '0x6000';}throw Error('Unexpected RPC');
 });
 const client=await pinnedRpc(config,1,fixture.fetcher);assert.equal(await client.code(at),'0x6000');assert.equal(await client.code(at),'0x6000');assert.equal(numeric,2);assert.equal(fixture.calls.filter(body=>body.method==='eth_getCode'&&typeof body.params.at(-1)==='object').length,1);assert.ok(fixture.calls.filter(body=>body.method==='eth_getBlockByNumber').length>=5);assert.equal(await client.finalize([], 'test'),true);
});
test('a changed snapshot during numeric fallback rejects the read and erases earlier group observations',async()=>{
 let changed=false;const fixture=fakeRpc(body=>{
  if(body.method==='eth_chainId')return '0x1';if(body.method==='eth_getBlockByNumber')return {...header,...(changed?{hash:secondHash}:{})};
  if(body.method==='eth_getCode'){if(typeof body.params.at(-1)==='object')return {error:{code:-32602}};changed=true;return '0x6000';}throw Error('Unexpected RPC');
 });
 const client=await pinnedRpc(config,1,fixture.fetcher);await assert.rejects(client.code(at),/Snapshot changed/);const checks=observations();assert.equal(await client.finalize(checks,'test'),false);unavailable(checks);
});
test('transport and execution errors never trigger numeric fallback or permit an unpinned read',async()=>{
 const fixture=fakeRpc(body=>body.method==='eth_chainId'?'0x1':body.method==='eth_getBlockByNumber'?header:{error:{code:-32000}}),client=await pinnedRpc(config,1,fixture.fetcher);
 await assert.rejects(client.code(at));assert.equal(fixture.calls.filter(body=>body.method==='eth_getCode').length,1);await assert.rejects(client.call('eth_getBalance',[at,'latest']),/pinned block/);await assert.rejects(client.call('eth_sendTransaction',[{}]),/Read-only/);
});
test('account collector discards owner, threshold and authority facts when the canonical snapshot changes',async()=>{
 const tx:SecurityRequest={kind:'transaction',chainId:1,transaction:{from:owner,to:at,data:encodeFunctionData({abi:parseAbi(['function changeThreshold(uint256)']),functionName:'changeThreshold',args:[1n]})}};
 let headers=0;const fixture=fakeRpc(body=>{
  if(body.method==='eth_chainId')return '0x1';if(body.method==='eth_blockNumber')return '0x10';if(body.method==='eth_getBlockByNumber')return {...header,hash:++headers>1?secondHash:firstHash};if(body.method==='eth_getCode')return '0x6000';
  if(body.method==='eth_call'){const selector=body.params[0].data.slice(0,10),owners=encodeFunctionData({abi:accountStateAbi,functionName:'getOwners'}).slice(0,10);return encodeFunctionResult({abi:accountStateAbi,functionName:selector===owners?'getOwners':'getThreshold',result:selector===owners?[owner]:2n} as any);}throw Error('Unexpected RPC');
 });
 const checks=await accountEvidence(tx,decodeRequest(tx),config,fixture.fetcher);assert.equal(checks.find(item=>item.id==='account_owners')?.status,'unknown');assert.equal(checks.find(item=>item.id==='account_owners')?.data?.owners,undefined);assert.equal(checks.find(item=>item.id==='account_threshold_change')?.data?.currentThreshold,undefined);assert.equal(checks.find(item=>item.id==='account_semantics')?.source,'coverage');assert.ok(checks.some(item=>item.id==='account_snapshot'));
});
test('protocol collector discards controls observed before a failed final header recheck',async()=>{
 const tx:SecurityRequest={kind:'transaction',chainId:1,transaction:{from:owner,to:at,data:'0x12345678'}};let headers=0;
 const fixture=fakeRpc(body=>{if(body.method==='eth_chainId')return '0x1';if(body.method==='eth_blockNumber')return '0x10';if(body.method==='eth_getBlockByNumber')return ++headers>1?null:header;if(body.method==='eth_getCode')return '0x6000';if(body.method==='eth_getStorageAt')return `0x${'0'.repeat(64)}`;if(body.method==='eth_call')return {error:{code:3}};throw Error('Unexpected RPC');});
 const checks=await protocolEvidence(tx,decodeRequest(tx),config,fixture.fetcher),controls=checks.find(item=>item.id==='contract_controls');assert.equal(controls?.status,'unknown');assert.equal(controls?.data?.codeHash,undefined);assert.ok(checks.some(item=>item.id==='protocol_snapshot'));
});
