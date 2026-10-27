import {LAB_CHAIN_ID,LAB_RPC_URL,LAB_CHAIN} from './network.js';
import {encodeFunctionData,getAddress,isAddress,keccak256,parseAbi,parseAbiItem,parseEther,zeroAddress,type Abi,type Address,type Hex} from 'viem';
import {readDeployment,type Deployment} from '../server/chain.js';
import {labClient,labWallet,labInventory,preflightLab,type Artifact,type LabDeployment} from './contracts.js';

/** Only verified local fixture balances are affected; this is not a protocol reset. */
export const LOCAL_BALANCE_SINK='0x000000000000000000000000000000000000dEaD' as Address;
export const MAX_CLEANUP_NFT_IDS=512;
const tokenAbi=parseAbi(['function balanceOf(address) view returns(uint256)','function burn(uint256)']);
const baseAbi=parseAbi(['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)','function transferFrom(address,address,uint256) returns(bool)']);
const wrappedAbi=parseAbi(['function balanceOf(address) view returns(uint256)','function withdraw(uint256)']);
const nftAbi=parseAbi(['function balanceOf(address) view returns(uint256)','function ownerOf(uint256) view returns(address)','function transferFrom(address,address,uint256)']);
const multiAbi=parseAbi(['function balanceOf(address,uint256) view returns(uint256)','function safeTransferFrom(address,address,uint256,uint256,bytes)']);
const mintEvent=parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)');
const requiredContracts=['token','quote','honey','nft','multi','router','vault','lending','actions','control','permit2','wrapped'];
type CleanupClient=Pick<typeof labClient,'getChainId'|'getBlockNumber'|'getCode'|'getBalance'|'getLogs'|'readContract'|'request'|'waitForTransactionReceipt'>;
type CleanupWallet=Pick<typeof labWallet,'writeContract'>;
export type LocalBalanceCleanupDependencies={client:CleanupClient;wallet:CleanupWallet;deployment:LabDeployment;baseDeployment:Deployment;artifacts:Record<string,Artifact>};
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
function uint(value:unknown,label:string){if(typeof value!=='bigint'||value<0n)throw Error(`Local cleanup could not verify ${label}. No balance result was assumed.`);return value;}
function emptyCode(code:Hex|undefined){return code===undefined||code==='0x';}

export async function clearLocalTestBalances(account:Address,deps:LocalBalanceCleanupDependencies){
 const {client,wallet,deployment:d,baseDeployment:base,artifacts}=deps;
 if(!isAddress(account)||same(account,zeroAddress)||same(account,LOCAL_BALANCE_SINK))throw Error('Choose a nonzero local test account, other than the cleanup sink.');
 account=getAddress(account);
 if(await client.getChainId()!==LAB_CHAIN_ID||!String(await client.request({method:'web3_clientVersion'})).toLowerCase().includes('anvil'))throw Error(`Balance clearing is allowed only on local Anvil chain ${LAB_CHAIN_ID}.`);
 if(d.version!==1||d.chainId!==LAB_CHAIN_ID||base.chainId!==LAB_CHAIN_ID||!isAddress(d.baseToken)||!same(d.baseToken,base.token)||requiredContracts.some(key=>!d.contracts?.[key]))throw Error('The verified local test manifest is incomplete or mismatched.');
 const entries=Object.entries(d.contracts);
 if(entries.length>64||entries.some(([,c])=>!isAddress(c.address)||same(c.address,zeroAddress)||!/^0x[\da-f]{64}$/i.test(c.codeHash))||!/^0x[\da-f]{64}$/i.test(base.tokenCodeHash))throw Error('The local test contract manifest is invalid.');
 const targets=[base.token,...['token','quote','honey','nft','multi','wrapped'].map(key=>d.contracts[key].address)];
 if(new Set(targets.map(address=>address.toLowerCase())).size!==targets.length)throw Error('Local cleanup asset addresses must be distinct.');
 const block=await client.getBlockNumber({cacheTime:0});
 const [accountCode,sinkCode]=await Promise.all([client.getCode({address:account,blockNumber:block}),client.getCode({address:LOCAL_BALANCE_SINK,blockNumber:block})]);
 if(!emptyCode(accountCode)||!emptyCode(sinkCode))throw Error('Local balance clearing requires an EOA test account and an EOA cleanup sink; contract or delegated accounts are not supported.');
 await Promise.all([{address:base.token,codeHash:base.tokenCodeHash},...entries.map(([,c])=>c)].map(async c=>{
  const code=await client.getCode({address:c.address,blockNumber:block});
  if(!code||code==='0x'||!same(keccak256(code),c.codeHash))throw Error('The local test contract code changed. No cleanup was started.');
 }));
 // Validate every required ABI before the first mutation. Calls themselves use
 // fixed, known fixture interfaces rather than caller-provided ABI encodings.
 const requirements:[string,Abi,string,readonly unknown[]][]=[
  ['LabToken',tokenAbi,'balanceOf',[account]],['LabToken',tokenAbi,'burn',[0n]],
  ['LabNFT',nftAbi,'balanceOf',[account]],['LabNFT',nftAbi,'ownerOf',[1n]],['LabNFT',nftAbi,'transferFrom',[account,LOCAL_BALANCE_SINK,1n]],
  ['LabMultiNFT',multiAbi,'balanceOf',[account,1n]],['LabMultiNFT',multiAbi,'safeTransferFrom',[account,LOCAL_BALANCE_SINK,1n,0n,'0x']],
  ['LabWrapped',wrappedAbi,'balanceOf',[account]],['LabWrapped',wrappedAbi,'withdraw',[0n]]
 ];
 for(const [name,abi,functionName,args] of requirements){
  try{if(!artifacts[name]||encodeFunctionData({abi:artifacts[name].abi,functionName,args})!==encodeFunctionData({abi,functionName,args}))throw Error('ABI mismatch');}
  catch{throw Error(`The ${name}.${functionName} fixture artifact is missing or mismatched. No cleanup was started.`);}
 }
 const read=async(address:Address,abi:Abi,functionName:string,args:readonly unknown[],blockNumber:bigint)=>client.readContract({address,abi,functionName,args,blockNumber});
 const balance=async(address:Address,abi:Abi,blockNumber:bigint)=>uint(await read(address,abi,'balanceOf',[account],blockNumber),'token balance');
 const [native,baseBalance,previousSelfAllowance,tokenBalances,wrappedBalance,nftBalance,multiBalances]=await Promise.all([
  client.getBalance({address:account,blockNumber:block}),balance(base.token,baseAbi,block),read(base.token,baseAbi,'allowance',[account,account],block).then(v=>uint(v,'self allowance')),
  Promise.all(['token','quote','honey'].map(key=>balance(d.contracts[key].address,tokenAbi,block))),balance(d.contracts.wrapped.address,wrappedAbi,block),balance(d.contracts.nft.address,nftAbi,block),
  Promise.all([1n,2n].map(id=>read(d.contracts.multi.address,multiAbi,'balanceOf',[account,id],block).then(v=>uint(v,'multi-token balance'))))
 ]);
 uint(native,'native balance');
 // LabNFT.nextId is private. Its complete mint history is bounded and checked,
 // then every minted ID is queried at the same block, including incoming IDs
 // that are absent from testId(account).
 const mints=await client.getLogs({address:d.contracts.nft.address,event:mintEvent,args:{from:zeroAddress},fromBlock:0n,toBlock:block,strict:true});
 if(mints.length>MAX_CLEANUP_NFT_IDS)throw Error(`NFT cleanup supports at most ${MAX_CLEANUP_NFT_IDS} locally minted IDs. No cleanup was started.`);
 const minted=mints.map(log=>uint(log.args.tokenId,'minted NFT ID'));
 if(minted.some(id=>id===0n||id>BigInt(MAX_CLEANUP_NFT_IDS))||new Set(minted.map(String)).size!==minted.length||minted.some((_,i)=>!minted.includes(BigInt(i+1))))throw Error('The bounded local NFT mint history could not be verified. No cleanup was started.');
 const owners=await Promise.all(minted.map(id=>read(d.contracts.nft.address,nftAbi,'ownerOf',[id],block)));
 if(owners.some(owner=>typeof owner!=='string'||!isAddress(owner)))throw Error('Local NFT ownership could not be verified. No cleanup was started.');
 const ownedIds=minted.filter((_,i)=>same(String(owners[i]),account));
 if(BigInt(ownedIds.length)!==nftBalance)throw Error('The NFT balance does not match the complete bounded ownership inventory. No cleanup was started.');
 const unlocked:unknown=await client.request({method:'eth_accounts'} as never);
 if(!Array.isArray(unlocked)||unlocked.some(address=>typeof address!=='string'||!isAddress(address)))throw Error('Local node account availability could not be verified. No cleanup was started.');
 let impersonated=false,restoreSelfAllowance=false,writeCount=0;
 const rpc=(method:string,params:unknown[])=>client.request({method,params} as never);
 async function write(address:Address,abi:Abi,functionName:string,args:readonly unknown[],stage:string){
  try{
   const hash=await wallet.writeContract({account,address,abi,functionName,args});
   const receipt=await client.waitForTransactionReceipt({hash,timeout:15000,pollingInterval:100});
   if(receipt.status!=='success')throw Error('Receipt reverted');
   writeCount++;
  }catch{throw Error(`${stage} did not complete successfully. Some earlier local balance changes may remain; refresh the inventory before retrying.`);}
 }
 const hasTokenWrites=baseBalance>0n||tokenBalances.some(v=>v>0n)||wrappedBalance>0n||ownedIds.length>0||multiBalances.some(v=>v>0n);
 try{
  if(hasTokenWrites){
   if(!unlocked.some(address=>same(address,account))){await rpc('anvil_impersonateAccount',[account]);impersonated=true;}
   // This temporary gas reserve is local-only and removed at the end. No other
   // account is charged and zero-balance wallets can clear received test assets.
   if(native<parseEther('1'))await rpc('anvil_setBalance',[account,`0x${parseEther('1').toString(16)}`]);
   if(baseBalance>0n){
    restoreSelfAllowance=true;
    await write(base.token,baseAbi,'approve',[account,baseBalance],'TEST-USD temporary self-approval');
    await write(base.token,baseAbi,'transferFrom',[account,LOCAL_BALANCE_SINK,baseBalance],'TEST-USD balance clearing');
    await write(base.token,baseAbi,'approve',[account,previousSelfAllowance],'TEST-USD self-allowance restoration');
    restoreSelfAllowance=false;
   }
   for(const [i,key] of ['token','quote','honey'].entries())if(tokenBalances[i]>0n)await write(d.contracts[key].address,tokenAbi,'burn',[tokenBalances[i]],`${key} test-token balance clearing`);
   if(wrappedBalance>0n)await write(d.contracts.wrapped.address,wrappedAbi,'withdraw',[wrappedBalance],'Wrapped test-token balance clearing');
   for(const id of ownedIds)await write(d.contracts.nft.address,nftAbi,'transferFrom',[account,LOCAL_BALANCE_SINK,id],`NFT ${id} balance clearing`);
   for(const [i,id] of [1n,2n].entries())if(multiBalances[i]>0n)await write(d.contracts.multi.address,multiAbi,'safeTransferFrom',[account,LOCAL_BALANCE_SINK,id,multiBalances[i],'0x'],`Multi-token ${id} balance clearing`);
  }
  await rpc('anvil_setBalance',[account,'0x0']);
 }finally{
  try{if(restoreSelfAllowance)await write(base.token,baseAbi,'approve',[account,previousSelfAllowance],'TEST-USD self-allowance restoration after failure');}
  finally{if(impersonated)await rpc('anvil_stopImpersonatingAccount',[account]);}
 }
 const finalBlock=await client.getBlockNumber({cacheTime:0});
 const finalValues=await Promise.all([
  client.getBalance({address:account,blockNumber:finalBlock}),balance(base.token,baseAbi,finalBlock),
  ...['token','quote','honey'].map(key=>balance(d.contracts[key].address,tokenAbi,finalBlock)),balance(d.contracts.wrapped.address,wrappedAbi,finalBlock),balance(d.contracts.nft.address,nftAbi,finalBlock),
  ...[1n,2n].map(id=>read(d.contracts.multi.address,multiAbi,'balanceOf',[account,id],finalBlock).then(v=>uint(v,'final multi-token balance')))
 ]);
 const finalSelfAllowance=uint(await read(base.token,baseAbi,'allowance',[account,account],finalBlock),'restored self allowance');
 if(finalValues.some(value=>uint(value,'final balance')!==0n)||finalSelfAllowance!==previousSelfAllowance)throw Error('Local balance clearing could not verify zero balances and the restored self allowance. Refresh the inventory before retrying.');
 return {account,chainId:LAB_CHAIN_ID,cleared:true as const,sink:LOCAL_BALANCE_SINK,blockNumber:String(finalBlock),transactionCount:writeCount,clearedNftIds:ownedIds.map(String),balances:{eth:'0',base:'0',token:'0',quote:'0',honey:'0',wrapped:'0',nft:'0',multi1:'0',multi2:'0'},positionsUnchanged:true as const,erc20AllowancesUnchanged:true as const,operatorApprovalsUnchanged:true as const,nftTokenApprovalsClearedByTransfer:ownedIds.length>0};
}

export async function clearLabAssets(account:Address){
 const {deployment,artifacts}=await preflightLab(),baseDeployment=await readDeployment();
 if(!baseDeployment)throw Error('Deploy the base TEST-USD fixture before clearing balances.');
 const result=await clearLocalTestBalances(account,{client:labClient,wallet:labWallet,deployment,baseDeployment,artifacts});
 return {...result,address:result.account,inventory:await labInventory(account),scope:'local-wallet-balances' as const,message:'Cleared only this account’s known local test balances. Protocol positions, ERC-20 allowances and NFT operator approvals remain unchanged. Transferring ERC-721 NFTs clears their individual token approvals. This is not a full protocol or history reset.'};
}
