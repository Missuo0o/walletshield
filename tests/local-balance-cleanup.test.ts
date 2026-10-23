import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256,parseAbi,zeroAddress,type Address,type Hex} from 'viem';
import {clearLocalTestBalances,LOCAL_BALANCE_SINK,MAX_CLEANUP_NFT_IDS,type LocalBalanceCleanupDependencies} from '../src/testing/cleanup.js';

const address=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const tester=address(900),other=address(901),owner=address(902),code='0x60006000' as Hex;
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
function fixture(options:{unlocked?:boolean;zero?:boolean}={}){
 const keys=['token','quote','honey','nft','multi','router','vault','lending','actions','control','permit2','wrapped'];
 const contracts=Object.fromEntries(keys.map((key,i)=>[key,{address:address(i+10),codeHash:keccak256(code)}]));
 const deployment={version:1 as const,chainId:31337 as const,baseToken:address(1),owner,recipient:other,deployedAt:'2026-10-22T00:00:00Z',contracts};
 const baseDeployment={chainId:31337,token:deployment.baseToken,owner,spender:other,tokenCodeHash:keccak256(code),deployedAt:deployment.deployedAt};
 const abi={LabToken:parseAbi(['function balanceOf(address) view returns(uint256)','function burn(uint256)']),LabNFT:parseAbi(['function balanceOf(address) view returns(uint256)','function ownerOf(uint256) view returns(address)','function transferFrom(address,address,uint256)']),LabMultiNFT:parseAbi(['function balanceOf(address,uint256) view returns(uint256)','function safeTransferFrom(address,address,uint256,uint256,bytes)']),LabWrapped:parseAbi(['function balanceOf(address) view returns(uint256)','function withdraw(uint256)'])};
 const artifacts=Object.fromEntries(Object.entries(abi).map(([key,value])=>[key,{abi:value,bytecode:'0x' as Hex}]));
 const balances=new Map<string,bigint>([['base',15n],['token',11n],['quote',12n],['honey',13n],['wrapped',14n]]);
 const owners=new Map<bigint,Address>([[1n,tester],[2n,other],[3n,tester]]),multi=new Map<bigint,bigint>([[1n,8n],[2n,9n]]);
 if(options.zero){for(const key of balances.keys())balances.set(key,0n);owners.set(1n,other);owners.set(3n,other);multi.set(1n,0n);multi.set(2n,0n);}
 let selfAllowance=77n,native=options.zero?0n:10n,block=42n,serial=0,chainId=31337,version='anvil/v1',mintIds=[1n,2n,3n],nftBalanceOverride:bigint|undefined;
 let accountCode:Hex|undefined,sinkCode:Hex|undefined,badCode:Address|undefined,failFunction:string|undefined,impersonated=false;
 const rpcCalls:{method:string;params:unknown[]}[]=[],writes:{address:Address;functionName:string;args:readonly any[];account:Address}[]=[],reads:{address:Address;functionName:string;blockNumber:bigint}[]=[];
 const pending=new Map<string,typeof writes[number]>();
 const keyFor=(target:Address)=>same(target,deployment.baseToken)?'base':keys.find(key=>same(contracts[key].address,target));
 const client={
  getChainId:async()=>chainId,getBlockNumber:async()=>block,
  getCode:async({address:target}:any)=>same(target,tester)?accountCode:same(target,LOCAL_BALANCE_SINK)?sinkCode:same(target,badCode??zeroAddress)?'0x6001':code,
  getBalance:async({address:target}:any)=>{assert.ok(same(target,tester));return native;},
  getLogs:async(params:any)=>{assert.equal(params.address,contracts.nft.address);assert.equal(params.fromBlock,0n);assert.equal(params.toBlock,42n);assert.equal(params.args.from,zeroAddress);return mintIds.map(tokenId=>({args:{from:zeroAddress,to:other,tokenId}}));},
  readContract:async(params:any)=>{
   reads.push(params);const key=keyFor(params.address),args=params.args;
   assert.ok(['base','token','quote','honey','wrapped','nft','multi'].includes(key??''),'Only known asset balances/ownership may be read.');
   if(params.functionName==='allowance'){assert.equal(key,'base');assert.ok(same(args[0],tester)&&same(args[1],tester));return selfAllowance;}
   if(key==='nft'&&params.functionName==='ownerOf')return owners.get(args[0])??zeroAddress;
   if(params.functionName==='balanceOf'){
    assert.ok(same(args[0],tester));
    if(key==='nft')return nftBalanceOverride??BigInt([...owners.values()].filter(v=>same(v,tester)).length);
    if(key==='multi')return multi.get(args[1])??0n;
    return balances.get(key!)??0n;
   }
   throw Error('Unexpected fixture read');
  },
  request:async({method,params=[]}:any)=>{
   rpcCalls.push({method,params});
   if(method==='web3_clientVersion')return version;
   if(method==='eth_accounts')return options.unlocked?[tester]:[owner];
   assert.ok(same(params[0],tester),'Anvil account mutation is confined to selected account.');
   if(method==='anvil_impersonateAccount'){assert.equal(impersonated,false);impersonated=true;return null;}
   if(method==='anvil_stopImpersonatingAccount'){assert.equal(impersonated,true);impersonated=false;return null;}
   if(method==='anvil_setBalance'){native=BigInt(params[1]);return null;}
   throw Error('Unexpected RPC');
  },
  waitForTransactionReceipt:async({hash}:any)=>{
   const write=pending.get(hash)!;assert.ok(write);block++;
   if(write.functionName===failFunction)return {status:'reverted'};
   const key=keyFor(write.address),args=write.args;
   if(write.functionName==='approve'){assert.equal(key,'base');assert.ok(same(args[0],tester));selfAllowance=args[1];}
   else if(key==='base'&&write.functionName==='transferFrom'){assert.ok(same(args[0],tester)&&same(args[1],LOCAL_BALANCE_SINK));assert.ok(selfAllowance>=args[2]);selfAllowance-=args[2];balances.set('base',balances.get('base')!-args[2]);}
   else if(write.functionName==='burn'){assert.ok(['token','quote','honey'].includes(key!));balances.set(key!,balances.get(key!)!-args[0]);}
   else if(write.functionName==='withdraw'){assert.equal(key,'wrapped');balances.set('wrapped',balances.get('wrapped')!-args[0]);native+=args[0];}
   else if(key==='nft'){assert.equal(write.functionName,'transferFrom');assert.ok(same(args[0],tester)&&same(args[1],LOCAL_BALANCE_SINK));owners.set(args[2],LOCAL_BALANCE_SINK);}
   else if(key==='multi'){assert.equal(write.functionName,'safeTransferFrom');assert.ok(same(args[0],tester)&&same(args[1],LOCAL_BALANCE_SINK));assert.equal(args[4],'0x');multi.set(args[2],multi.get(args[2])!-args[3]);}
   else throw Error('Unexpected fixture write');
   native-=1n;return {status:'success'};
  }
 };
 const wallet={writeContract:async(params:any)=>{assert.ok(same(params.account,tester));assert.ok(options.unlocked||impersonated);writes.push(params);const hash=`0x${(++serial).toString(16).padStart(64,'0')}` as Hex;pending.set(hash,params);return hash;}};
 const deps={client,wallet,deployment,baseDeployment,artifacts} as unknown as LocalBalanceCleanupDependencies;
 return {deps,writes,rpcCalls,reads,balances,owners,multi,get allowance(){return selfAllowance;},get native(){return native;},get impersonated(){return impersonated;},set chainId(value:number){chainId=value;},set version(value:string){version=value;},set accountCode(value:Hex|undefined){accountCode=value;},set sinkCode(value:Hex|undefined){sinkCode=value;},set badCode(value:Address|undefined){badCode=value;},set mintIds(value:bigint[]){mintIds=value;},set nftBalanceOverride(value:bigint|undefined){nftBalanceOverride=value;},set failFunction(value:string|undefined){failFunction=value;}};
}
const mutationCalls=(f:ReturnType<typeof fixture>)=>f.rpcCalls.filter(call=>call.method.startsWith('anvil_'));

test('cleanup clears all selected fixture balances, discovers incoming NFT IDs, restores self allowance, and stops temporary impersonation',async()=>{
 const f=fixture(),result=await clearLocalTestBalances(tester,f.deps);
 assert.equal(result.cleared,true);assert.deepEqual(result.clearedNftIds,['1','3']);assert.equal(result.transactionCount,11);assert.equal(result.positionsUnchanged,true);assert.equal(result.erc20AllowancesUnchanged,true);assert.equal(result.operatorApprovalsUnchanged,true);assert.equal(result.nftTokenApprovalsClearedByTransfer,true);
 assert.deepEqual([...f.balances.values()],[0n,0n,0n,0n,0n]);assert.equal(f.native,0n);assert.equal(f.allowance,77n);assert.equal(f.impersonated,false);assert.equal(f.owners.get(2n),other);assert.equal(f.owners.get(1n),LOCAL_BALANCE_SINK);assert.equal(f.owners.get(3n),LOCAL_BALANCE_SINK);
 assert.deepEqual(f.writes.filter(write=>write.functionName==='approve').map(write=>write.args),[[tester,15n],[tester,77n]]);
 assert.deepEqual(mutationCalls(f).map(call=>call.method),['anvil_impersonateAccount','anvil_setBalance','anvil_setBalance','anvil_stopImpersonatingAccount']);
 assert.equal(new Set(f.reads.map(read=>read.blockNumber)).size,2);assert.ok(f.reads.every(read=>read.blockNumber===42n||read.blockNumber===53n));
 assert.ok(!f.writes.some(write=>['resetTester','setApprovalForAll','deposit','redeem'].includes(write.functionName)));
});

test('already unlocked selected accounts are never impersonated or locked; zero balances are idempotent',async()=>{
 const unlocked=fixture({unlocked:true});await clearLocalTestBalances(tester,unlocked.deps);assert.ok(!unlocked.rpcCalls.some(call=>/Impersonat|impersonat/.test(call.method)));
 const zero=fixture({zero:true}),result=await clearLocalTestBalances(tester,zero.deps);assert.equal(result.transactionCount,0);assert.deepEqual(result.clearedNftIds,[]);assert.equal(zero.writes.length,0);assert.equal(zero.allowance,77n);assert.deepEqual(mutationCalls(zero).map(call=>call.method),['anvil_setBalance']);
 const again=await clearLocalTestBalances(tester,zero.deps);assert.equal(again.transactionCount,0);assert.equal(zero.writes.length,0);
});

test('unsupported chain, node, contract/delegated account, sink code, manifest code, and artifact failures stop before any mutation',async()=>{
 const cases:[string,(f:ReturnType<typeof fixture>)=>void,RegExp][]=[
  ['chain',f=>{f.chainId=1;},/only on local Anvil/],['node',f=>{f.version='geth';},/only on local Anvil/],
  ['delegated account',f=>{f.accountCode='0xef010011';},/EOA test account/],['sink',f=>{f.sinkCode='0x6001';},/EOA cleanup sink/],
  ['code',f=>{f.badCode=f.deps.deployment.contracts.token.address;},/contract code changed/],
  ['artifact',f=>{delete f.deps.artifacts.LabWrapped;},/LabWrapped.*artifact/],
  ['wrong ABI',f=>{f.deps.artifacts.LabToken.abi=parseAbi(['function burn(address,uint256)']);},/LabToken.*artifact/],
  ['base mismatch',f=>{f.deps.baseDeployment.token=other;},/manifest.*mismatched/]
 ];
 for(const [name,change,expected] of cases){const f=fixture();change(f);await assert.rejects(clearLocalTestBalances(tester,f.deps),expected,name);assert.equal(f.writes.length,0,name);assert.equal(mutationCalls(f).length,0,name);}
 for(const account of [zeroAddress,LOCAL_BALANCE_SINK]){const f=fixture();await assert.rejects(clearLocalTestBalances(account,f.deps),/nonzero local test account/);assert.equal(f.rpcCalls.length,0);}
});

test('bounded complete NFT discovery rejects overflow, missing/duplicate IDs and balance mismatches before any writes',async()=>{
 for(const ids of [Array.from({length:MAX_CLEANUP_NFT_IDS+1},(_,i)=>BigInt(i+1)),[1n,3n],[1n,1n],[0n]]){
  const f=fixture();f.mintIds=ids;await assert.rejects(clearLocalTestBalances(tester,f.deps),/NFT/);assert.equal(f.writes.length,0);assert.equal(mutationCalls(f).length,0);
 }
 const f=fixture();f.nftBalanceOverride=3n;await assert.rejects(clearLocalTestBalances(tester,f.deps),/NFT balance does not match/);assert.equal(f.writes.length,0);assert.equal(mutationCalls(f).length,0);
});

test('a reverted base-token receipt yields a named failure, restores self allowance, and always releases impersonation',async()=>{
 const f=fixture();f.failFunction='transferFrom';
 await assert.rejects(clearLocalTestBalances(tester,f.deps),/TEST-USD balance clearing did not complete successfully/);
 assert.equal(f.allowance,77n);assert.equal(f.balances.get('base'),15n);assert.equal(f.impersonated,false);
 assert.deepEqual(f.writes.map(write=>write.functionName),['approve','transferFrom','approve']);assert.equal(mutationCalls(f).at(-1)?.method,'anvil_stopImpersonatingAccount');
});

test('partial cleanup never reports success after a later reverted receipt and does not change protocol fixtures',async()=>{
 const f=fixture();f.failFunction='burn';await assert.rejects(clearLocalTestBalances(tester,f.deps),/token test-token balance clearing did not complete successfully/);
 assert.equal(f.balances.get('base'),0n);assert.equal(f.balances.get('token'),11n);assert.equal(f.allowance,77n);assert.equal(f.impersonated,false);assert.equal(f.owners.get(1n),tester);
 assert.equal(f.writes.at(-1)?.address,f.deps.deployment.contracts.token.address);
});
