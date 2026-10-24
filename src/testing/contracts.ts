import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import solc from 'solc';
import {createPublicClient,createWalletClient,http,keccak256,parseEther,formatEther,formatUnits,type Address,type Abi} from 'viem';
import {foundry} from 'viem/chains';
import {localStatus,localClient} from '../server/chain.js';
export const labClient=createPublicClient({chain:foundry,transport:http('http://127.0.0.1:8545',{timeout:5000,retryCount:0})});
export const labWallet=createWalletClient({chain:foundry,transport:http('http://127.0.0.1:8545',{timeout:5000,retryCount:0})});
const wallet=labWallet;
export type Artifact={abi:Abi;bytecode:`0x${string}`};
export type LabDeployment={version:1;chainId:31337;baseToken:Address;owner:Address;recipient:Address;deployedAt:string;contracts:Record<string,{address:Address;codeHash:`0x${string}`}>};
const file=()=>resolve(process.cwd(),'.local/lab-deployment.json');
export async function assertLocalAnvil(){if(await labClient.getChainId()!==31337||!(await labClient.request({method:'web3_clientVersion'})).toLowerCase().includes('anvil'))throw Error('Only the local Anvil node on chain 31337 is allowed.');}
export async function readLab(){try{return JSON.parse(await readFile(file(),'utf8')) as LabDeployment;}catch{return null;}}
export async function verifiedLab(){
 await assertLocalAnvil();const base=await localStatus(),d=await readLab();
 if(!base.ready||!base.deployment||!d||d.version!==1||d.chainId!==31337||base.deployment.token.toLowerCase()!==d.baseToken.toLowerCase())throw Error('Run npm run deploy:lab to prepare the local wallet test contracts.');
 const required=['token','quote','honey','nft','multi','router','vault','lending','actions','control','permit2','wrapped'];
 if(required.some(key=>!d.contracts?.[key]?.address||!d.contracts[key].codeHash))throw Error('The local test contract manifest is incomplete. Deploy the lab again.');
 await Promise.all(Object.values(d.contracts).map(async c=>{const code=await labClient.getCode({address:c.address});if(!code||keccak256(code)!==c.codeHash)throw Error('The local test contract code changed. Deploy the lab contracts again.');}));return d;
}
export async function labArtifacts():Promise<Record<string,Artifact>>{return JSON.parse(await readFile(resolve(process.cwd(),'.local/lab-artifacts.json'),'utf8'));}
export async function compileLabArtifacts():Promise<Record<string,Artifact>>{
 const source=await readFile(resolve(process.cwd(),'contracts/WalletLab.sol'),'utf8');
 const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'WalletLab.sol':{content:source}},settings:{evmVersion:'cancun',optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
 const errors=(output.errors??[]).filter((e:any)=>e.severity==='error');if(errors.length)throw Error(errors.map((e:any)=>e.formattedMessage).join('\n'));
 const artifacts:Record<string,Artifact>={};for(const [name,c] of Object.entries(output.contracts['WalletLab.sol']) as [string,any][])if(c.evm.bytecode.object)artifacts[name]={abi:c.abi,bytecode:`0x${c.evm.bytecode.object}`};
 return artifacts;
}
export async function deployLab(){
 let existing:LabDeployment|null=null;try {existing=await verifiedLab();}catch{/* Local fixtures may not yet exist. */}
 await assertLocalAnvil();const base=await localStatus();if(!base.ready||!base.deployment)throw Error('Deploy the base TEST-USD contract first.');
 const [nodeOwner,nodeRecipient]=await wallet.getAddresses();if(!nodeOwner||!nodeRecipient)throw Error('Local test accounts are unavailable.');
 const owner=existing?.owner??nodeOwner,recipient=existing?.recipient??nodeRecipient;
 const compiled=await compileLabArtifacts();
 // An explicit deploy:lab may add optional fixtures to a verified older lab.
 // Keep its existing contracts, addresses, artifacts and balances intact.
 const previous=existing?await labArtifacts().catch(()=>({} as Record<string,Artifact>)):{};
 const artifacts:Record<string,Artifact>={...compiled,...previous,LabAccount:compiled.LabAccount,LabOrderVerifier:compiled.LabOrderVerifier};
 const d:LabDeployment=existing??{version:1,chainId:31337,baseToken:base.deployment.token,owner,recipient,deployedAt:new Date().toISOString(),contracts:{}};
 async function deploy(key:string,name:string,args:unknown[]=[]){const a=artifacts[name];const hash=await wallet.deployContract({account:owner,abi:a.abi,bytecode:a.bytecode,args});const r=await labClient.waitForTransactionReceipt({hash});if(r.status!=='success'||!r.contractAddress)throw Error('Test contract deployment failed.');const code=await labClient.getCode({address:r.contractAddress});if(!code)throw Error('Test contract code is missing.');d.contracts[key]={address:r.contractAddress,codeHash:keccak256(code)};return r.contractAddress;}
 if(existing){
  if(!d.contracts.account)await deploy('account','LabAccount',[recipient]);
  if(!d.contracts.orders)await deploy('orders','LabOrderVerifier');
  await mkdir(resolve(process.cwd(),'.local'),{recursive:true});
  await writeFile(resolve(process.cwd(),'.local/lab-artifacts.json'),JSON.stringify(artifacts));await writeFile(file(),JSON.stringify(d,null,2));return d;
 }
 const token=await deploy('token','LabToken',['WalletShield Lab USD','LAB-USD',6]);
 const quote=await deploy('quote','LabToken',['WalletShield Lab Quote','LAB-Q',6]);
 const honey=await deploy('honey','LabToken',['WalletShield Blocked Sell Fixture','LAB-BLOCK',6]);
 await deploy('nft','LabNFT');await deploy('multi','LabMultiNFT');
 const router=await deploy('router','LabRouter');await deploy('vault','LabVault',[token]);await deploy('lending','LabLending',[token]);const actions=await deploy('actions','LabActions',[token]);
 await deploy('control','LabControl');await deploy('permit2','LabPermit2');await deploy('wrapped','LabWrapped');
 await deploy('account','LabAccount',[recipient]);
 await deploy('orders','LabOrderVerifier');
 async function write(address:Address,name:string,args:unknown[]){const hash=await wallet.writeContract({account:owner,address,abi:artifacts.LabToken.abi,functionName:name,args});await labClient.waitForTransactionReceipt({hash});}
 for(const t of [token,quote,honey])await write(t,'seed',[router,1000000n*10n**6n]);
 await write(token,'seed',[actions,1000000n*10n**6n]);await write(honey,'blockRecipient',[router]);
 await localClient.request({method:'anvil_setBalance' as never,params:[router,`0x${parseEther('1000').toString(16)}`] as never});
 await mkdir(resolve(process.cwd(),'.local'),{recursive:true});await writeFile(resolve(process.cwd(),'.local/lab-artifacts.json'),JSON.stringify(artifacts));await writeFile(file(),JSON.stringify(d,null,2));return d;
}
export async function preflightLab(){
 const deployment=await verifiedLab(),artifacts=await labArtifacts();
 const required:Record<string,string[]>={LabToken:['faucet','balanceOf','symbol','decimals'],LabNFT:['faucet','testId','ownerOf'],LabMultiNFT:['faucet','balanceOf'],LabControl:['resetTester','owner'],LabWrapped:['balanceOf','symbol','decimals'],LabVault:['balanceOf'],LabLending:['collateral','debt'],LabActions:['staked','liquidity'],...(deployment.contracts.account?{LabAccount:['resetTester','getOwners','getThreshold']}:{})};
 for(const [name,methods] of Object.entries(required)){
  if(!Array.isArray(artifacts[name]?.abi)||methods.some(method=>!artifacts[name].abi.some(item=>item.type==='function'&&item.name===method)))throw Error(`The ${name} fixture artifact is missing or incomplete. Run npm run deploy:lab before preparing assets.`);
 }
 return {deployment,artifacts};
}
export async function waitLabWrite(hash:`0x${string}`,stage:string){
 const receipt=await labClient.waitForTransactionReceipt({hash,timeout:15000,pollingInterval:100});
 if(receipt.status!=='success')throw Error(`${stage} reverted. Some earlier local setup steps may already have completed; refresh balances and retry.`);
 return receipt;
}
export async function prepareLab(address:Address){
 const {deployment:d,artifacts}=await preflightLab();
 for(const [key,name] of [['token','LabToken'],['quote','LabToken'],['honey','LabToken'],['nft','LabNFT'],['multi','LabMultiNFT']] as const){const hash=await wallet.writeContract({account:d.owner,address:d.contracts[key].address,abi:artifacts[name].abi,functionName:'faucet',args:[address]});await waitLabWrite(hash,`${key} asset preparation`);}
 const hash=await wallet.writeContract({account:d.owner,address:d.contracts.control.address,abi:artifacts.LabControl.abi,functionName:'resetTester',args:[address]});await waitLabWrite(hash,'Control fixture reset');
 if(d.contracts.account){
  const other=address.toLowerCase()===d.recipient.toLowerCase()?d.owner:d.recipient;
  const reset=await wallet.writeContract({account:d.owner,address:d.contracts.account.address,abi:artifacts.LabAccount.abi,functionName:'resetTester',args:[address,other]});await waitLabWrite(reset,'Account fixture reset');
  const [owners,threshold]=await Promise.all([labClient.readContract({address:d.contracts.account.address,abi:artifacts.LabAccount.abi,functionName:'getOwners'}),labClient.readContract({address:d.contracts.account.address,abi:artifacts.LabAccount.abi,functionName:'getThreshold'})]);
  if(!Array.isArray(owners)||owners.length!==2||!owners.some(owner=>String(owner).toLowerCase()===address.toLowerCase())||!owners.some(owner=>String(owner).toLowerCase()===other.toLowerCase())||threshold!==2n)throw Error('The account fixture reset could not be verified. Prepare assets again.');
 }
 const inventory=await labInventory(address);
 if(!inventory.ready||inventory.positions.controlOwner.toLowerCase()!==address.toLowerCase())throw Error('Asset or control fixture verification failed after preparation. Refresh the inventory.');
 return {address,inventory,token:d.contracts.token.address,quote:d.contracts.quote.address,nft:d.contracts.nft.address,scope:'local-fixtures',message:'LAB-USD, LAB-Q, a restricted-sale test token and NFTs are ready on the local chain. They have no real value. The control fixture is reset for this test account. '+(d.contracts.account?'The optional simplified account fixture is reset too; this does not create a production multisig.':'Run npm run deploy:lab to add the optional simplified account fixture.')};
}

/** Read-only inventory: token display in MetaMask is separate from chain ownership.
 * Positions are shown, never created by silently authorizing/spending user funds. */
export async function labInventory(account:Address){
 const d=await verifiedLab(),artifacts=await labArtifacts(),block=await labClient.getBlockNumber({cacheTime:0});
 const read=(key:string,artifact:string,name:string,args:unknown[]=[])=>labClient.readContract({address:d.contracts[key].address,abi:artifacts[artifact].abi,functionName:name,args,blockNumber:block}) as Promise<any>;
 const native=await labClient.getBalance({address:account,blockNumber:block});
 const assets=await Promise.all((['token','quote','honey','wrapped'] as const).map(async(key)=>{const artifact=key==='wrapped'?'LabWrapped':'LabToken';const [balance,symbol,decimals]=await Promise.all([read(key,artifact,'balanceOf',[account]),read(key,artifact,'symbol'),read(key,artifact,'decimals')]);return {key,address:d.contracts[key].address,symbol:String(symbol),decimals:Number(decimals),balanceRaw:String(balance),balance:formatUnits(balance,Number(decimals)),standard:'ERC20' as const};}));
 const testId=await read('nft','LabNFT','testId',[account]);
 const [owner,multi1,multi2,shares,collateral,debt,staked,liquidity,controlOwner]=await Promise.all([
  testId>0n?read('nft','LabNFT','ownerOf',[testId]):Promise.resolve(null),read('multi','LabMultiNFT','balanceOf',[account,1n]),read('multi','LabMultiNFT','balanceOf',[account,2n]),read('vault','LabVault','balanceOf',[account]),read('lending','LabLending','collateral',[account]),read('lending','LabLending','debt',[account]),read('actions','LabActions','staked',[account]),read('actions','LabActions','liquidity',[account]),read('control','LabControl','owner')]);
 const nftOwned=typeof owner==='string'&&owner.toLowerCase()===account.toLowerCase();
 const baseBalance=await labClient.readContract({address:d.baseToken,abi:artifacts.LabToken.abi,functionName:'balanceOf',args:[account],blockNumber:block}) as bigint;
 return {account,chainId:31337,blockNumber:String(block),eth:formatEther(native),ready:native>0n&&baseBalance>0n&&assets.slice(0,3).every(a=>BigInt(a.balanceRaw)>0n)&&nftOwned&&multi1>0n&&multi2>0n,
  assets:[{key:'base',address:d.baseToken,symbol:'TEST-USD',decimals:6,balanceRaw:String(baseBalance),balance:formatUnits(baseBalance,6),standard:'ERC20' as const},...assets],
  nfts:[{address:d.contracts.nft.address,standard:'ERC721',id:String(testId),balance:nftOwned?'1':'0'},{address:d.contracts.multi.address,standard:'ERC1155',id:'1',balance:String(multi1)},{address:d.contracts.multi.address,standard:'ERC1155',id:'2',balance:String(multi2)}],
  positions:{vaultSharesRaw:String(shares),collateralRaw:String(collateral),debtRaw:String(debt),stakedRaw:String(staked),liquidityUnitsRaw:String(liquidity),controlOwner},
  note:'Balances describe the local chain and have no real value. Acquire vault shares, staking positions, collateral and WLAB through their wallet operations. Preparing assets does not approve allowances, deposit funds or borrow for you.'};
}
export type LabInventory=Awaited<ReturnType<typeof labInventory>>;
