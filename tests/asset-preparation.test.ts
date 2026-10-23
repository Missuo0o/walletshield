import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdir,mkdtemp,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {keccak256,parseAbi,parseEther} from 'viem';

const project=fileURLToPath(new URL('../',import.meta.url));
const address=(number:number)=>('0x'+number.toString(16).padStart(40,'0')) as `0x${string}`;
const tester=address(90),admin=address(91),recipient=address(92),baseToken=address(93),code='0x60006000' as const;
const fixtureAbi=parseAbi([
 'function faucet(address recipient)','function resetTester(address who)','function resetTester(address who,address other)',
 'function balanceOf(address who) view returns(uint256)','function balanceOf(address who,uint256 id) view returns(uint256)',
 'function symbol() view returns(string)','function decimals() view returns(uint8)','function testId(address who) view returns(uint256)',
 'function ownerOf(uint256 id) view returns(address)','function owner() view returns(address)',
 'function getOwners() view returns(address[])','function getThreshold() view returns(uint256)',
 'function collateral(address who) view returns(uint256)','function debt(address who) view returns(uint256)',
 'function staked(address who) view returns(uint256)','function liquidity(address who) view returns(uint256)'
]);

/** The copied source tree makes import-relative deployment reads resolve inside
 * this disposable fixture. Real project manifests, keys and Anvil are untouched.
 * Every transport is also denied so an unstubbed method fails closed. */
async function harness(t:TestContext){
 const original=process.cwd(),directory=await mkdtemp(join(tmpdir(),'walletshield-assets-test-'));
 await cp(join(project,'src'),join(directory,'src'),{recursive:true});
 await mkdir(join(directory,'.local'));await symlink(join(project,'node_modules'),join(directory,'node_modules'),'dir');
 await writeFile(join(directory,'package.json'),JSON.stringify({type:'module'}));
 const keys=['token','quote','honey','nft','multi','router','vault','lending','actions','control','permit2','wrapped','account'];
 const deployment={version:1,chainId:31337,baseToken,owner:admin,recipient,deployedAt:'2026-10-22T00:00:00Z',contracts:Object.fromEntries(keys.map((key,index)=>[key,{address:address(index+1),codeHash:keccak256(code)}]))};
 const artifacts:Record<string,{abi:typeof fixtureAbi;bytecode:typeof code}>=Object.fromEntries(['LabToken','LabNFT','LabMultiNFT','LabControl','LabWrapped','LabAccount','LabVault','LabLending','LabActions'].map(name=>[name,{abi:fixtureAbi,bytecode:code}]));
 const persist=async()=>{await writeFile(join(directory,'.local/lab-deployment.json'),JSON.stringify(deployment));await writeFile(join(directory,'.local/lab-artifacts.json'),JSON.stringify(artifacts));};
 await persist();
 await writeFile(join(directory,'.local/deployment.json'),JSON.stringify({chainId:31337,token:baseToken,owner:admin,spender:recipient,tokenCodeHash:keccak256(code),deployedAt:deployment.deployedAt}));
 process.chdir(directory);t.after(async()=>{process.chdir(original);await rm(directory,{recursive:true,force:true});});
 const module=await import(pathToFileURL(join(directory,'src/testing/contracts.ts')).href);
 const chain=await import(pathToFileURL(join(directory,'src/server/chain.ts')).href);
 const writes:Record<string,unknown>[]=[],receipts:Record<string,unknown>[]=[];
 const state={failureAt:-1,chainId:31337,controlOwner:tester,owners:[tester,recipient] as string[],threshold:2n,baseBalance:5000000000n};
 const deny=async()=>{throw Error('Unexpected transport use: no real node or network is allowed by this test.');};
 for(const client of [module.labClient,module.labWallet,chain.localClient])t.mock.method(client.transport,'request',deny);
 for(const client of [module.labClient,chain.localClient]){
  t.mock.method(client,'getChainId',async()=>state.chainId);
  t.mock.method(client,'getCode',async()=>code);
  t.mock.method(client,'request',async({method}:{method:string})=>{if(method==='web3_clientVersion')return 'anvil/offline-test';throw Error(`Unexpected RPC method ${method}`);});
 }
 t.mock.method(module.labClient,'getBlockNumber',async()=>100n);
 t.mock.method(module.labClient,'getBalance',async()=>parseEther('10'));
 t.mock.method(module.labClient,'readContract',async(params:{address:string;functionName:string;args?:unknown[]})=>{
  switch(params.functionName){
   case 'symbol':return params.address===deployment.contracts.wrapped.address?'WLAB':'LAB';
   case 'decimals':return params.address===deployment.contracts.wrapped.address?18:6;
   case 'balanceOf':return params.address===baseToken?state.baseBalance:params.args?.length===2?10n:5000000000n;
   case 'testId':return 1n;
   case 'ownerOf':return tester;
   case 'owner':return state.controlOwner;
   case 'getOwners':return state.owners;
   case 'getThreshold':return state.threshold;
   case 'collateral':case 'debt':case 'staked':case 'liquidity':return 0n;
   default:throw Error(`Unexpected contract read ${params.functionName}`);
  }
 });
 t.mock.method(module.labWallet,'writeContract',async(params:Record<string,unknown>)=>{writes.push(params);return '0x'+writes.length.toString(16).padStart(64,'0');});
 t.mock.method(module.labClient,'waitForTransactionReceipt',async(params:Record<string,unknown>)=>{const index=receipts.length;receipts.push(params);return {status:index===state.failureAt?'reverted':'success'};});
 return {module,state,writes,receipts,deployment,artifacts,persist};
}

test('preflight checks the local chain and required fixture artifacts before any setup write',async(t)=>{
 const fixture=await harness(t);
 const ready=await fixture.module.preflightLab();assert.equal(ready.deployment.baseToken,baseToken);assert.ok(ready.artifacts.LabAccount);
 assert.equal(fixture.writes.length,0);
 fixture.state.chainId=1;await assert.rejects(fixture.module.prepareLab(tester),/local Anvil|31337/);assert.equal(fixture.writes.length,0);
 fixture.state.chainId=31337;delete fixture.artifacts.LabMultiNFT;await fixture.persist();
 await assert.rejects(fixture.module.prepareLab(tester),/LabMultiNFT.*missing or incomplete/);assert.equal(fixture.writes.length,0);
});

test('a missing optional account artifact fails before topping up any lab asset',async(t)=>{
 const fixture=await harness(t);delete fixture.artifacts.LabAccount;await fixture.persist();
 await assert.rejects(fixture.module.prepareLab(tester),/LabAccount.*missing or incomplete/);
 assert.equal(fixture.writes.length,0);assert.equal(fixture.receipts.length,0);
});

test('missing inventory or reset-verification interfaces fail preflight before any setup mutation',async(t)=>{
 const fixture=await harness(t);
 const vault=fixture.artifacts.LabVault;delete fixture.artifacts.LabVault;await fixture.persist();
 await assert.rejects(fixture.module.prepareLab(tester),/LabVault.*missing or incomplete/);assert.equal(fixture.writes.length,0);
 fixture.artifacts.LabVault=vault;
 fixture.artifacts.LabAccount={...fixture.artifacts.LabAccount,abi:fixtureAbi.filter(item=>item.name!=='getThreshold') as unknown as typeof fixtureAbi};await fixture.persist();
 await assert.rejects(fixture.module.prepareLab(tester),/LabAccount.*missing or incomplete/);assert.equal(fixture.writes.length,0);
});

test('each of all seven preparation receipts is checked and a revert stops every later setup write',async(t)=>{
 const fixture=await harness(t);
 const labels=['token asset preparation','quote asset preparation','honey asset preparation','nft asset preparation','multi asset preparation','Control fixture reset','Account fixture reset'];
 for(let failed=0;failed<labels.length;failed++){
  fixture.writes.length=0;fixture.receipts.length=0;fixture.state.failureAt=failed;
  await assert.rejects(fixture.module.prepareLab(tester),error=>error instanceof Error&&error.message.includes(`${labels[failed]} reverted`)&&error.message.includes('earlier local setup steps may already have completed'));
  assert.equal(fixture.writes.length,failed+1,labels[failed]);assert.equal(fixture.receipts.length,failed+1,labels[failed]);
 }
});

test('successful preparation returns post-write inventory and verifies the selected account fixture',async(t)=>{
 const fixture=await harness(t),result=await fixture.module.prepareLab(tester);
 assert.equal(fixture.writes.length,7);assert.equal(fixture.receipts.length,7);
 assert.deepEqual(fixture.writes.map(write=>write.functionName),['faucet','faucet','faucet','faucet','faucet','resetTester','resetTester']);
 assert.deepEqual(fixture.writes[6].args,[tester,recipient]);
 assert.equal(result.inventory.ready,true);assert.equal(result.inventory.account,tester);assert.equal(result.inventory.eth,'10');
 assert.equal(result.inventory.positions.controlOwner,tester);
 assert.ok(fixture.receipts.every(receipt=>receipt.timeout===15000&&receipt.pollingInterval===100));
});

test('successful receipts cannot hide an incorrect account-owner or threshold reset postcondition',async(t)=>{
 const fixture=await harness(t);
 for(const scenario of ['owners','threshold']){
  fixture.writes.length=0;fixture.receipts.length=0;fixture.state.owners=scenario==='owners'?[tester,admin]:[tester,recipient];fixture.state.threshold=scenario==='threshold'?1n:2n;
  await assert.rejects(fixture.module.prepareLab(tester),/account fixture reset could not be verified/);
  assert.equal(fixture.writes.length,7);assert.equal(fixture.receipts.length,7);
 }
});

test('positive asset balances do not hide a failed control-owner reset, and missing base assets are not ready',async(t)=>{
 const fixture=await harness(t);fixture.state.controlOwner=admin;
 await assert.rejects(fixture.module.prepareLab(tester),/Asset or control fixture verification failed/);
 fixture.writes.length=0;fixture.receipts.length=0;fixture.state.controlOwner=tester;fixture.state.baseBalance=0n;
 await assert.rejects(fixture.module.prepareLab(tester),/Asset or control fixture verification failed/);
 assert.equal((await fixture.module.labInventory(tester)).ready,false);
});

test('a valid older lab without the optional account fixture still prepares and verifies its six existing writes',async(t)=>{
 const fixture=await harness(t);delete fixture.deployment.contracts.account;delete fixture.artifacts.LabAccount;await fixture.persist();
 const result=await fixture.module.prepareLab(tester);
 assert.equal(fixture.writes.length,6);assert.equal(fixture.receipts.length,6);assert.equal(result.inventory.ready,true);
 assert.match(result.message,/Run npm run deploy:lab to add the optional simplified account fixture/);
});
