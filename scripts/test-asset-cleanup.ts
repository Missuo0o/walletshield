import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile} from 'node:fs/promises';
import solc from 'solc';
import {createPublicClient,createWalletClient,http,keccak256,maxUint256,parseEther,toHex,zeroAddress,type Abi,type Address} from 'viem';
import {foundry} from 'viem/chains';
import {compileLabArtifacts,type Artifact,type LabDeployment} from '../src/testing/contracts.js';
import {clearLocalTestBalances,LOCAL_BALANCE_SINK,type LocalBalanceCleanupDependencies} from '../src/testing/cleanup.js';
import type {Deployment} from '../src/server/chain.js';

// This test never reads .local deployment files, uses a public RPC, or connects
// to the normal local node. All contracts and balances exist only in this child.
const listener=createServer();await new Promise<void>(resolve=>listener.listen(0,'127.0.0.1',resolve));
const allocated=listener.address();assert.ok(allocated&&typeof allocated!=='string');const port=allocated.port;assert.notEqual(port,8545);
await new Promise<void>(resolve=>listener.close(()=>resolve()));
const endpoint=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['node_modules/@foundry-rs/anvil/bin.mjs','--host','127.0.0.1','--port',String(port),'--chain-id','31337','--silent'],{stdio:'ignore'});
const client=createPublicClient({chain:foundry,transport:http(endpoint,{timeout:5000,retryCount:0})});
const wallet=createWalletClient({chain:foundry,transport:http(endpoint,{timeout:5000,retryCount:0})});
let serial=0;
async function rpc(method:string,params:unknown[]=[]):Promise<any>{
 const id=++serial,response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(5000)});
 assert.ok(response.ok);const body=await response.json();if(body.error)throw Error(`Isolated fixture RPC failed (${body.error.code}): ${body.error.message}`);assert.equal(body.id,id);return body.result;
}
async function stop(){await new Promise<void>(resolve=>{
 if(child.exitCode!==null||child.signalCode!==null){resolve();return;}const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},1500);
 child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGTERM');
});}
try{
 let ready=false;for(let attempt=0;attempt<60;attempt++){try{assert.equal(await rpc('eth_chainId'),'0x7a69');ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,80));}}
 assert.ok(ready,'The temporary Anvil did not start');assert.match(String(await rpc('web3_clientVersion')),/anvil/i);
 const accounts=await wallet.getAddresses(),owner=accounts[0],donor=accounts[1],operator=accounts[2],sentinel=accounts[3];assert.ok(owner&&donor&&operator&&sentinel);
 const target='0x00000000000000000000000000000000000A11cE' as Address;
 assert.ok(!accounts.some(account=>account.toLowerCase()===target.toLowerCase()),'The target must require temporary impersonation');
 const artifacts=await compileLabArtifacts();
 const source=await readFile(new URL('../contracts/TestUSD.sol',import.meta.url),'utf8');
 const compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'TestUSD.sol':{content:source}},settings:{evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
 const errors=(compiled.errors??[]).filter((error:{severity:string})=>error.severity==='error');assert.equal(errors.length,0,JSON.stringify(errors));
 const baseCompiled=compiled.contracts['TestUSD.sol'].TestUSD,baseArtifact:Artifact={abi:baseCompiled.abi,bytecode:`0x${baseCompiled.evm.bytecode.object}`};
 async function deploy(artifact:Artifact,args:unknown[]=[]){
  const hash=await wallet.deployContract({account:owner,abi:artifact.abi,bytecode:artifact.bytecode,args});const receipt=await client.waitForTransactionReceipt({hash,pollingInterval:10,timeout:15000});
  assert.equal(receipt.status,'success');assert.ok(receipt.contractAddress);return receipt.contractAddress;
 }
 const baseToken=await deploy(baseArtifact,[owner]),deployedAt=new Date().toISOString();
 const baseCode=await client.getCode({address:baseToken});assert.ok(baseCode);
 const baseDeployment:Deployment={chainId:31337,token:baseToken,owner,spender:operator,tokenCodeHash:keccak256(baseCode),deployedAt};
 const deployment:LabDeployment={version:1,chainId:31337,baseToken,owner,recipient:donor,deployedAt,contracts:{}};
 async function fixture(key:string,name:string,args:unknown[]=[]){const address=await deploy(artifacts[name],args),code=await client.getCode({address});assert.ok(code);deployment.contracts[key]={address,codeHash:keccak256(code)};return address;}
 const token=await fixture('token','LabToken',['WalletShield Lab USD','LAB-USD',6]);
 await fixture('quote','LabToken',['WalletShield Lab Quote','LAB-Q',6]);await fixture('honey','LabToken',['WalletShield Blocked Sell Fixture','LAB-BLOCK',6]);
 await fixture('nft','LabNFT');await fixture('multi','LabMultiNFT');await fixture('router','LabRouter');await fixture('vault','LabVault',[token]);await fixture('lending','LabLending',[token]);
 await fixture('actions','LabActions',[token]);await fixture('control','LabControl');await fixture('permit2','LabPermit2');await fixture('wrapped','LabWrapped');await fixture('account','LabAccount',[donor]);
 const address=(key:string)=>deployment.contracts[key].address;
 async function write(account:Address,to:Address,abi:Abi,functionName:string,args:unknown[]=[],value?:bigint){
  const hash=await wallet.writeContract({account,address:to,abi,functionName,args,...(value===undefined?{}:{value})});const receipt=await client.waitForTransactionReceipt({hash,pollingInterval:10,timeout:15000});assert.equal(receipt.status,'success',functionName);
 }
 const read=(to:Address,abi:Abi,functionName:string,args:unknown[]=[])=>client.readContract({address:to,abi,functionName,args}) as Promise<any>;
 const writeFixture=(account:Address,key:string,name:string,method:string,args:unknown[]=[],value?:bigint)=>write(account,address(key),artifacts[name].abi,method,args,value);
 const readFixture=(key:string,name:string,method:string,args:unknown[]=[])=>read(address(key),artifacts[name].abi,method,args);
 async function topUp(who:Address){
  await rpc('anvil_setBalance',[who,toHex(parseEther('10'))]);await write(owner,baseToken,baseArtifact.abi,'faucet',[who]);
  for(const key of ['token','quote','honey'])await writeFixture(owner,key,'LabToken','faucet',[who]);
  await writeFixture(owner,'nft','LabNFT','faucet',[who]);await writeFixture(owner,'multi','LabMultiNFT','faucet',[who]);
 }
 await topUp(target);await topUp(sentinel);
 const firstId=await readFixture('nft','LabNFT','testId',[target]);await writeFixture(owner,'nft','LabNFT','faucet',[donor]);
 const incomingId=await readFixture('nft','LabNFT','testId',[donor]);await writeFixture(donor,'nft','LabNFT','transferFrom',[donor,target,incomingId]);
 assert.notEqual(firstId,incomingId);assert.equal(await readFixture('nft','LabNFT','testId',[target]),firstId);assert.equal(await readFixture('nft','LabNFT','balanceOf',[target]),2n);
 await rpc('anvil_impersonateAccount',[target]);
 try{
  await write(target,baseToken,baseArtifact.abi,'approve',[target,37n]);await write(target,baseToken,baseArtifact.abi,'approve',[operator,101n]);
  await writeFixture(target,'token','LabToken','approve',[operator,123456789n]);await writeFixture(target,'token','LabToken','approve',[address('vault'),maxUint256]);
  await writeFixture(target,'vault','LabVault','deposit',[17_000_000n,target]);
  await writeFixture(target,'wrapped','LabWrapped','deposit',[],parseEther('1'));
  await writeFixture(target,'nft','LabNFT','setApprovalForAll',[operator,true]);await writeFixture(target,'nft','LabNFT','approve',[operator,firstId]);
  await writeFixture(target,'multi','LabMultiNFT','setApprovalForAll',[operator,true]);
 }finally{await rpc('anvil_stopImpersonatingAccount',[target]);}
 await writeFixture(owner,'control','LabControl','resetTester',[target]);await writeFixture(owner,'account','LabAccount','resetTester',[target,donor]);
 async function walletBalances(who:Address){return {
  eth:await client.getBalance({address:who}),base:await read(baseToken,baseArtifact.abi,'balanceOf',[who]),
  token:await readFixture('token','LabToken','balanceOf',[who]),quote:await readFixture('quote','LabToken','balanceOf',[who]),honey:await readFixture('honey','LabToken','balanceOf',[who]),
  wrapped:await readFixture('wrapped','LabWrapped','balanceOf',[who]),nft:await readFixture('nft','LabNFT','balanceOf',[who]),multi1:await readFixture('multi','LabMultiNFT','balanceOf',[who,1n]),multi2:await readFixture('multi','LabMultiNFT','balanceOf',[who,2n])
 };}
 async function retained(){return {
  vaultShares:await readFixture('vault','LabVault','balanceOf',[target]),vaultAssets:await readFixture('vault','LabVault','totalAssets'),
  baseSelf:await read(baseToken,baseArtifact.abi,'allowance',[target,target]),baseOperator:await read(baseToken,baseArtifact.abi,'allowance',[target,operator]),
  tokenOperator:await readFixture('token','LabToken','allowance',[target,operator]),vaultAllowance:await readFixture('token','LabToken','allowance',[target,address('vault')]),
  nftOperator:await readFixture('nft','LabNFT','isApprovedForAll',[target,operator]),multiOperator:await readFixture('multi','LabMultiNFT','isApprovedForAll',[target,operator]),
  controlOwner:await readFixture('control','LabControl','owner'),accountOwners:await readFixture('account','LabAccount','getOwners'),accountThreshold:await readFixture('account','LabAccount','getThreshold')
 };}
 const sentinelBefore=await walletBalances(sentinel),retainedBefore=await retained(),targetBefore=await walletBalances(target);
 assert.equal(retainedBefore.vaultShares,17_000_000n);assert.equal(retainedBefore.baseSelf,37n);
 const deps:LocalBalanceCleanupDependencies={client,wallet,deployment,baseDeployment,artifacts};
 async function rejectWithoutWrite(message:RegExp,overrides:Partial<LocalBalanceCleanupDependencies>){
  const before=await client.getBlockNumber({cacheTime:0});await assert.rejects(clearLocalTestBalances(target,{...deps,...overrides}),message);
  assert.equal(await client.getBlockNumber({cacheTime:0}),before);assert.deepEqual(await walletBalances(target),targetBefore);assert.deepEqual(await retained(),retainedBefore);
 }
 await rejectWithoutWrite(/only on local Anvil chain 31337/,{client:{...client,getChainId:async()=>1}});
 await rejectWithoutWrite(/contract code changed/,{baseDeployment:{...baseDeployment,tokenCodeHash:'0x'+'0'.repeat(64)}});
 await rejectWithoutWrite(/NFT balance does not match/,{client:{...client,getLogs:(async()=>[]) as typeof client.getLogs}});
 const result=await clearLocalTestBalances(target,deps);
 assert.equal(result.cleared,true);assert.deepEqual(new Set(result.clearedNftIds),new Set([String(firstId),String(incomingId)]));assert.ok(result.transactionCount>0);
 const zeros=Object.fromEntries(Object.keys(targetBefore).map(key=>[key,0n]));assert.deepEqual(await walletBalances(target),zeros);
 assert.deepEqual(await walletBalances(sentinel),sentinelBefore);assert.deepEqual(await retained(),retainedBefore);
 for(const id of [firstId,incomingId]){assert.equal(String(await readFixture('nft','LabNFT','ownerOf',[id])).toLowerCase(),LOCAL_BALANCE_SINK.toLowerCase());assert.equal(await readFixture('nft','LabNFT','getApproved',[id]),zeroAddress);}
 // Confirm the helper stopped its own impersonation, rather than only emptying
 // the account. The temporary gas is restored to zero immediately afterwards.
 await rpc('anvil_setBalance',[target,toHex(parseEther('1'))]);
 try{await assert.rejects(rpc('eth_sendTransaction',[{from:target,to:target,value:'0x0',gas:'0x5208'}]),/signer|account|unknown/i);}finally{await rpc('anvil_setBalance',[target,'0x0']);}
 const second=await clearLocalTestBalances(target,deps);assert.equal(second.transactionCount,0);assert.deepEqual(second.clearedNftIds,[]);assert.deepEqual(await walletBalances(target),zeros);assert.deepEqual(await retained(),retainedBefore);
 await topUp(target);await writeFixture(owner,'control','LabControl','resetTester',[target]);await writeFixture(owner,'account','LabAccount','resetTester',[target,donor]);
 const restored=await walletBalances(target);assert.equal(restored.eth,parseEther('10'));assert.equal(restored.base,5_000_000_000n);for(const key of ['token','quote','honey'] as const)assert.equal(restored[key],5_000_000_000n);
 assert.equal(restored.nft,1n);assert.equal(restored.multi1,10n);assert.equal(restored.multi2,10n);assert.equal(restored.wrapped,0n);assert.deepEqual(await retained(),retainedBefore);assert.deepEqual(await walletBalances(sentinel),sentinelBefore);
 console.log('PASS isolated local asset cleanup: all nine wallet balances cleared; incoming NFT IDs found; positions, standing allowances, operator approvals and other accounts retained; impersonation stopped; repeat clear idempotent; isolated top-up restores test assets. Wrong-chain, changed-code and missing-log preflights performed no writes. No normal local chain, public RPC, wallet UI, private key, model call or local deployment file used.');
}finally{await stop();}
