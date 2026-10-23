import {randomBytes} from 'node:crypto';
import {encodeFunctionData,encodeDeployData,maxUint256,stringToHex,zeroAddress,type Address} from 'viem';
import type {SecurityRequest} from '../security/types.js';
import {labClient,type LabDeployment,type Artifact} from './contracts.js';
export type WalletCase={id:string;name:string;group:string;profile:string;kind:'transaction'|'signature';description:string;prerequisite?:string;boundary?:string};
const tx=(id:string,name:string,group:string,profile:string,description:string,prerequisite?:string,boundary?:string):WalletCase=>({id,name,group,profile,kind:'transaction',description,prerequisite,boundary});
const sig=(id:string,name:string,profile:string,description:string,boundary?:string):WalletCase=>({id,name,group:'Messages and signatures',profile,kind:'signature',description,boundary:'An actual wallet signature request. The browser checks the returned signature format, then discards it without uploading or submitting it for use.'+(boundary?' '+boundary:'')});
const accountBoundary='Simplified local account interface only. Any listed owner can call directly regardless of threshold. No production multisig signatures, module execution, guard/fallback enforcement or protocol identity are implemented.';
const candidateSignatureBoundary='Format/candidate test using the existing LAB-USD domain only. LabToken does not implement this signature-consumption method; no future acceptance, ERC-3009 authorizationState or token movement is established.';
export const WALLET_CASES:readonly WalletCase[]=[
 tx('approve-unlimited','Unlimited approval','Asset permissions','approval','Grant an unverified test address unlimited LAB-USD spending permission.'),
 tx('approve-limited','Limited approval','Asset permissions','approval','Approve 100 LAB-USD and inspect the finite allowance and spender identity.'),
 tx('approve-revoke','Revoke token approval','Asset permissions','approval','Set the same test address allowance for LAB-USD to zero.'),
 tx('native','Native token transfer','Transfers and NFTs','native','Send 0.001 test ETH to a local test account.'),
 tx('native-contract','Contract recipient','Transfers and NFTs','native','Send 0.001 test ETH to a local contract with an executable receive function.'),
 tx('token-transfer','ERC-20 transfer','Transfers and NFTs','token-transfer','Send 1 LAB-USD and inspect the recipient and actual balance change.'),
 tx('nft-approve','Approve one NFT','Asset permissions','approval','Approve one local NFT without granting permission over the entire collection.'),
 tx('nft-revoke','Revoke one NFT approval','Asset permissions','approval','Set the NFT approved address to the zero address.'),
 tx('nft-all','Approve all NFTs','Asset permissions','operator','Enable operator permission for the entire local NFT collection.'),
 tx('nft-all-revoke','Revoke all NFT approvals','Asset permissions','operator','Disable the collection operator permission.'),
 tx('multi-all','Approve all ERC-1155 assets','Asset permissions','operator','Enable operator permission for the local ERC-1155 collection. Inspect it separately from ERC-721 permissions.'),
 tx('nft-transfer','ERC-721 transfer','Transfers and NFTs','nft-transfer','Transfer one local NFT. Preparing assets again may mint another test NFT.'),
 tx('multi-transfer','ERC-1155 transfer','Transfers and NFTs','nft-transfer','Transfer one test NFT with token ID 1.'),
 tx('multi-batch','ERC-1155 batch transfer','Transfers and NFTs','nft-transfer','Transfer test NFTs with IDs 1 and 2 in the same request.'),
 tx('permit2-approve','Permit2 on-chain allowance','Asset permissions','permit2-chain','Set an allowance and expiration on a local contract exposing Permit2-style methods.',undefined,'A local interface experiment, not an official Permit2 deployment.'),
 tx('approve-router','Approve local swap router','Protocol prerequisites','approval','Approve 100 LAB-USD for the local fixed-price router.'),
 tx('approve-blocked','Approve restricted token','Protocol prerequisites','approval','Approve 100 LAB-BLOCK for the router. A successful approval does not prove it can be sold.'),
 tx('swap-normal','V2-style normal purchase','Swaps and protocols','swap-v2','Buy LAB-USD with 0.001 test ETH. This test token permits selling.',undefined,'A local fixed-price router without real pool depth, market pricing or MEV.'),
 tx('swap-blocked','V2-style restricted purchase','Swaps and protocols','swap-v2','Buy LAB-BLOCK, which deliberately prevents transfers back to the router, and inspect round-trip evidence.',undefined,'A deliberately restricted test contract, not a detection of fraud in a real project.'),
 tx('sell-blocked','Restricted token sale reverts','Swaps and protocols','swap-v2','Test a reverting sale. The wallet may stop at gas estimation; this does not verify that Snap analysis completed.','Complete Approve restricted token first.'),
 tx('swap-v3','V3-style swap','Swaps and protocols','swap-v3','Submit exactInputSingle parameters to a local fixed-ratio swap.','Complete Approve local swap router first.','Tests parameters and the execution entry point, not a real V3 pool, quote or tick model.'),
 tx('approve-vault','Approve local vault','Protocol prerequisites','approval','Prepare a 100 LAB-USD allowance for a vault deposit.'),
 tx('vault-deposit','Vault deposit','Swaps and protocols','vault','Deposit 1 LAB-USD for an equal number of test shares.','Complete Approve local vault first.','A local 1:1 share experiment that does not prove ERC-4626 protocol identity or solvency.'),
 tx('vault-redeem','Vault redemption','Swaps and protocols','vault','Redeem 1 local vault share.','Complete Vault deposit first.'),
 tx('approve-lending','Approve local lending contract','Protocol prerequisites','approval','Prepare a 100 LAB-USD allowance for local collateral.'),
 tx('lending-supply','Supply lending collateral','Swaps and protocols','lending','Supply 2 LAB-USD as local test collateral.','Complete Approve local lending contract first.','A simplified collateral ledger, not the Aave economic model or a real liquidation stress test.'),
 tx('lending-borrow','Borrow','Swaps and protocols','lending','Borrow 0.5 LAB-USD against the test collateral.','Complete Supply lending collateral first.'),
 tx('approve-actions','Approve local staking contract','Protocol prerequisites','approval','Prepare a 100 LAB-USD allowance for staking and liquidity.'),
 tx('approve-quote','Approve second liquidity token','Protocol prerequisites','approval','Prepare a 100 LAB-Q allowance for adding liquidity.'),
 tx('stake','Stake','Swaps and protocols','staking','Stake 1 LAB-USD in the local contract.','Complete Approve local staking contract first.','Real protocol lockups, slashing and yield sources are not implemented.'),
 tx('unstake','Unstake','Swaps and protocols','staking','Withdraw the 1 LAB-USD already staked.','Complete Stake first.'),
 tx('liquidity','Add liquidity','Swaps and protocols','liquidity','Deposit 1 LAB-USD and 1 LAB-Q, recording local test shares.','Approve both tokens for the local protocol first.','No real pool valuation, impermanent-loss model or LP market.'),
 tx('bridge','Bridge deposit entry point','Swaps and protocols','bridge','Call local bridgeETHTo to record a 0.001 test ETH deposit.',undefined,'An event on this chain only. No cross-chain message or destination-chain delivery.'),
 tx('claim','Claim test assets','Swaps and protocols','claim','Call claim to receive 1 LAB-USD.',undefined,'A local claim without a proof requirement. It does not verify real airdrop identity or a Merkle root.'),
 tx('wrap','Wrap test ETH','Other transactions','wrap','Deposit 0.001 test ETH to receive WLAB.'),
 tx('unwrap','Unwrap test ETH','Other transactions','wrap','Withdraw the 0.001 test ETH already wrapped.','Complete Wrap test ETH first.','The decoder reports a withdrawal / possible native redemption candidate. The local fixture is known to the lab; an arbitrary same-shaped contract is not a verified wrapper.'),
 tx('mint','Mint test tokens','Other transactions','mint-burn','Mint 1 LAB-USD to the current account.'),
 tx('burn','Burn test tokens','Other transactions','mint-burn','Burn 1 LAB-USD from the current account.'),
 tx('ownership','Transfer control','Other transactions','control','Transfer the local lab contract ownership to the test address.','Prepare local test assets first to receive control of the lab contract.'),
 tx('upgrade','Upgrade call entry point','Other transactions','control','Record a candidate implementation address on the local lab contract.','Prepare local test assets first to receive control of the lab contract.','Records an implementation address without delegatecall or an audit of upgrade code.'),
 tx('account-threshold','Lower account threshold','Smart-account fixture','control','Change the optional account fixture threshold from two owners to one.','Run npm run deploy:lab, then prepare local test assets.',accountBoundary),
 tx('account-module-enable','Enable account module flag','Smart-account fixture','control','Record the local actions contract as an enabled module flag.','Run npm run deploy:lab, then prepare local test assets.',accountBoundary),
 tx('account-module-disable','Disable account module flag','Smart-account fixture','control','Clear the local actions contract module flag.','Enable account module flag first to observe a state change.',accountBoundary),
 tx('account-guard-set','Set account guard candidate','Smart-account fixture','control','Record the local actions contract as a fixture guard candidate.','Run npm run deploy:lab, then prepare local test assets.',accountBoundary),
 tx('account-guard-remove','Remove account guard candidate','Smart-account fixture','control','Clear the fixture guard candidate.','Set account guard candidate first to observe a state change.',accountBoundary),
 tx('account-fallback-set','Set account fallback candidate','Smart-account fixture','control','Record the local actions contract as a fixture fallback-handler candidate.','Run npm run deploy:lab, then prepare local test assets.',accountBoundary),
 tx('account-fallback-remove','Remove account fallback candidate','Smart-account fixture','control','Clear the fixture fallback-handler candidate.','Set account fallback candidate first to observe a state change.',accountBoundary),
 tx('account-call','Account CALL wrapper','Smart-account fixture','batch','Use the simplified execTransaction CALL wrapper to mint 1 LAB-USD to the test account.','Run npm run deploy:lab, then prepare local test assets.',accountBoundary+' Empty signatures and zero refund parameters are required. DELEGATECALL is intentionally rejected.'),
 tx('deployment','Deploy a contract','Other transactions','deployment','Deploy a simple contract owned by the current test wallet.'),
 tx('batch','Batch contract calls','Other transactions','batch','Execute two local claim calls in one transaction.','', 'Known local child calls. Generic decoding cannot fully explain arbitrary aggregators.'),
 tx('unknown','Unknown call fallback','Other transactions','unknown','Send an unknown selector to the local fallback and check that it remains unidentified.'),
 sig('message','Plain message signature','personal','Exercise personal_sign with a message explicitly marked as a local experiment.'),
 sig('siwe','Wallet login message','siwe','Test a login message using the current site domain, account and network.'),
 sig('siwe-mismatch','Login domain mismatch','siwe','The message deliberately declares a domain different from the current website.'),
 sig('permit','Finite Permit signature','permit-sign','Sign a local EIP-2612 Permit with a 100 LAB-USD allowance.'),
 sig('permit-unlimited','Unlimited Permit signature','permit-sign','Sign a local unlimited Permit and inspect the authority risk explanation.'),
 sig('permit-expired','Expired Permit signature','permit-sign','The signature submission deadline is already in the past.'),
 sig('permit-owner','Permit account mismatch','permit-sign','The declared owner deliberately differs from the signing account.'),
 sig('permit-nonce','Permit nonce mismatch','permit-sign','The declared nonce is deliberately one greater than the on-chain value.'),
 sig('dai-allow','DAI-style Permit grant candidate','permit-sign','Sign holder/spender/nonce/expiry/allowed=true; reference semantics map true to unlimited allowance.',candidateSignatureBoundary),
 sig('dai-revoke','DAI-style Permit revoke candidate','permit-sign','Sign the same DAI-shaped fields with allowed=false; reference semantics map false to zero allowance.',candidateSignatureBoundary),
 sig('erc3009-transfer','ERC-3009 transfer authorization candidate','permit-sign','Sign a one-time exact 1 LAB-USD transfer with a random bytes32 nonce and a bounded validity window.',candidateSignatureBoundary),
 sig('erc3009-receive','ERC-3009 receive authorization candidate','permit-sign','Sign ReceiveWithAuthorization; the reference standard restricts the future caller to the signed recipient.',candidateSignatureBoundary),
 sig('permit2','Single Permit2 signature','permit2-sign','Submit an actual EIP-712 PermitSingle request for the local contract.'),
 sig('permit2-batch','Batch Permit2 signature','permit2-sign','Sign a PermitBatch containing two local tokens.'),
 sig('order','Order signature','typed-order','Sign a generic local Order structure without claiming full Seaport validation.')
];
export const UNAVAILABLE_WALLET_TESTS=[
 {name:'Raw eth_sign',reason:'Flask or the wallet may disable this method. The current Snap SDK does not guarantee an automatic entry point, so no blind-signing button is offered.'},
 {name:'Session keys and wallet permissions',reason:'The explicit provider SDK can submit public request parameters, but this Snap has no universal permission-request interception hook or complete validator-policy adapter.'},
 {name:'ERC-4337 / UserOperation / paymaster',reason:'Version-bound EntryPoint state and declared prefund observations have API tests. A dedicated real-wallet/account/bundler/paymaster validation environment is still required.'},
 {name:'Network settings and read-only RPC',reason:'The public-network page integrates network switching through the explicit SDK. These requests do not enter the existing automatic transaction/message insight hooks; read-only requests are skipped by default.'},
 {name:'EIP-7702 delegation',reason:'Actual tuple recovery, conditional ordered nonce/code eligibility and delegate observations have API tests. Full set-code execution, implementation policy and an end-to-end wallet lab case remain incomplete.'},
 {name:'Real DeFi, bridge delivery and complex aggregators',reason:'Local interface experiments do not verify real protocol identity, markets, destination chains or all child calls.'},
 {name:'Every method and signature variant within a profile',reason:'Each profile has representative cases. On-chain Permit use, NFT Permits, all order and witness variants, and every protocol method have not been fully tested.'},
 {name:'Non-EVM chains, other wallets, devices and private-key leaks',reason:'Only EVM requests supplied by MetaMask are integrated. Devices and custodial platforms are not inspected.'}
] as const;

export async function buildWalletCase(id:string,account:Address,d:LabDeployment,artifacts:Record<string,Artifact>,origin='http://127.0.0.1:5173'):Promise<SecurityRequest>{
 if(!WALLET_CASES.some(c=>c.id===id))throw Error('Unsupported wallet test case.');
 const c=d.contracts,recipient=account.toLowerCase()===d.recipient.toLowerCase()?d.owner:d.recipient,spender='0x3333333333333333333333333333333333333333' as Address;
 const deadline=BigInt(Math.floor(Date.now()/1000)+1800),amount=10n**6n;
 const transaction=(to:Address|null,data:`0x${string}`,value='0x0'):SecurityRequest=>({kind:'transaction',chainId:31337,origin,transaction:{from:account,to,data,value}});
 const call=(key:string,artifact:string,name:string,args:unknown[]=[],value='0x0')=>{if(!c[key]?.address||!artifacts[artifact])throw Error('Run npm run deploy:lab to add the optional account fixture, then prepare local test assets.');return transaction(c[key].address,encodeFunctionData({abi:artifacts[artifact].abi,functionName:name,args}),value);};
 if(id==='native')return transaction(recipient,'0x','0x38d7ea4c68000');
 if(id==='native-contract')return transaction(c.actions.address,'0x','0x38d7ea4c68000');
 if(id.startsWith('approve-')){
  const target:Record<string,[string,Address,bigint]>={unlimited:['token',spender,maxUint256],limited:['token',spender,100n*amount],revoke:['token',spender,0n],router:['token',c.router.address,100n*amount],blocked:['honey',c.router.address,100n*amount],vault:['token',c.vault.address,100n*amount],lending:['token',c.lending.address,100n*amount],actions:['token',c.actions.address,100n*amount],quote:['quote',c.actions.address,100n*amount]};
  const [key,to,value]=target[id.slice(8)];return call(key,'LabToken','approve',[to,value]);
 }
 if(id==='token-transfer')return call('token','LabToken','transfer',[recipient,amount]);
 if(id.startsWith('nft-')){
  if(id==='nft-all'||id==='nft-all-revoke')return call('nft','LabNFT','setApprovalForAll',[spender,id==='nft-all']);
  const tokenId=await labClient.readContract({address:c.nft.address,abi:artifacts.LabNFT.abi,functionName:'testId',args:[account]}) as bigint;
  if(tokenId===0n)throw Error('Prepare local test assets first.');
  if(id==='nft-transfer')return call('nft','LabNFT','safeTransferFrom',[account,recipient,tokenId]);
  return call('nft','LabNFT','approve',[id==='nft-revoke'?'0x0000000000000000000000000000000000000000':spender,tokenId]);
 }
 if(id==='multi-transfer')return call('multi','LabMultiNFT','safeTransferFrom',[account,recipient,1n,1n,'0x']);
 if(id==='multi-all')return call('multi','LabMultiNFT','setApprovalForAll',[spender,true]);
 if(id==='multi-batch')return call('multi','LabMultiNFT','safeBatchTransferFrom',[account,recipient,[1n,2n],[1n,1n],'0x']);
 if(id==='permit2-approve')return call('permit2','LabPermit2','approve',[c.token.address,spender,2n**160n-1n,Number(deadline)]);
 if(id==='swap-normal'||id==='swap-blocked')return call('router','LabRouter','swapExactETHForTokens',[1n,[c.wrapped.address,c[id==='swap-normal'?'token':'honey'].address],account,deadline],'0x38d7ea4c68000');
 if(id==='sell-blocked')return call('router','LabRouter','swapExactTokensForTokens',[amount,1n,[c.honey.address,c.quote.address],account,deadline]);
 if(id==='swap-v3')return call('router','LabRouter','exactInputSingle',[[c.token.address,c.quote.address,3000,account,deadline,amount,1n,0n]]);
 if(id==='vault-deposit')return call('vault','LabVault','deposit',[amount,account]);
 if(id==='vault-redeem')return call('vault','LabVault','redeem',[amount,account,account]);
 if(id==='lending-supply')return call('lending','LabLending','supply',[c.token.address,2n*amount,account,0]);
 if(id==='lending-borrow')return call('lending','LabLending','borrow',[c.token.address,amount/2n,2n,0,account]);
 if(id==='stake'||id==='unstake')return call('actions','LabActions',id,[amount]);
 if(id==='liquidity')return call('actions','LabActions','addLiquidity',[c.token.address,c.quote.address,amount,amount,1n,1n,account,deadline]);
 if(id==='bridge')return call('actions','LabActions','bridgeETHTo',[recipient,200000,'0x'],'0x38d7ea4c68000');
 if(id==='claim')return call('actions','LabActions','claim',[0n,account,amount,[]]);
 if(id==='wrap')return call('wrapped','LabWrapped','deposit',[],'0x38d7ea4c68000');
 if(id==='unwrap')return call('wrapped','LabWrapped','withdraw',[1000000000000000n]);
 if(id==='mint')return call('token','LabToken','mint',[account,amount]);
 if(id==='burn')return call('token','LabToken','burn',[amount]);
 if(id==='ownership')return call('control','LabControl','transferOwnership',[recipient]);
 if(id==='upgrade')return call('control','LabControl','upgradeToAndCall',[c.actions.address,'0x']);
 if(id==='account-threshold')return call('account','LabAccount','changeThreshold',[1n]);
 if(id==='account-module-enable')return call('account','LabAccount','enableModule',[c.actions.address]);
 if(id==='account-module-disable')return call('account','LabAccount','disableModule',['0x0000000000000000000000000000000000000001',c.actions.address]);
 if(id==='account-guard-set'||id==='account-guard-remove')return call('account','LabAccount','setGuard',[id==='account-guard-set'?c.actions.address:zeroAddress]);
 if(id==='account-fallback-set'||id==='account-fallback-remove')return call('account','LabAccount','setFallbackHandler',[id==='account-fallback-set'?c.actions.address:zeroAddress]);
 if(id==='account-call')return call('account','LabAccount','execTransaction',[c.token.address,0n,encodeFunctionData({abi:artifacts.LabToken.abi,functionName:'mint',args:[account,amount]}),0,0n,0n,0n,zeroAddress,zeroAddress,'0x']);
 if(id==='deployment')return transaction(null,encodeDeployData({abi:artifacts.LabOwned.abi,bytecode:artifacts.LabOwned.bytecode,args:[account]}));
 if(id==='batch')return call('actions','LabActions','multicall',[deadline,[0n,1n].map(index=>encodeFunctionData({abi:artifacts.LabActions.abi,functionName:'claim',args:[index,account,amount,[]]}))]);
 if(id==='unknown')return transaction(c.actions.address,'0x12345678');
 const signature=(data:unknown,method:'personal_sign'|'eth_signTypedData_v4'):SecurityRequest=>({kind:'signature',chainId:0,origin,signature:{from:account,method,data:data as any}});
 if(id==='message')return signature(stringToHex('WalletShield local wallet signature test. No real assets. This signature is not submitted to any contract.'),'personal_sign');
 if(id.startsWith('siwe'))return signature(stringToHex(`${id==='siwe-mismatch'?'different.walletshield.invalid':new URL(origin).host} wants you to sign in with your Ethereum account:\n${account}\n\nWalletShield local login test.\n\nURI: ${origin}\nVersion: 1\nChain ID: 31337\nNonce: ${crypto.randomUUID().replaceAll('-','').slice(0,16)}\nIssued At: ${new Date().toISOString()}\nExpiration Time: ${new Date(Number(deadline)*1000).toISOString()}`),'personal_sign');
 const domainTypes=[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}];
 const domain={name:'WalletShield Lab USD',version:'1',chainId:31337,verifyingContract:c.token.address};
 if(id==='dai-allow'||id==='dai-revoke'){
  const nonce=await labClient.readContract({address:c.token.address,abi:artifacts.LabToken.abi,functionName:'nonces',args:[account]}) as bigint;
  return signature({domain,types:{EIP712Domain:domainTypes,Permit:[{name:'holder',type:'address'},{name:'spender',type:'address'},{name:'nonce',type:'uint256'},{name:'expiry',type:'uint256'},{name:'allowed',type:'bool'}]},primaryType:'Permit',message:{holder:account,spender,nonce:String(nonce),expiry:String(deadline),allowed:id==='dai-allow'}},'eth_signTypedData_v4');
 }
 if(id==='erc3009-transfer'||id==='erc3009-receive'){
  const primaryType=id==='erc3009-transfer'?'TransferWithAuthorization':'ReceiveWithAuthorization';
  return signature({domain,types:{EIP712Domain:domainTypes,[primaryType]:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'}]},primaryType,message:{from:account,to:recipient,value:String(amount),validAfter:'0',validBefore:String(deadline),nonce:'0x'+randomBytes(32).toString('hex')}},'eth_signTypedData_v4');
 }
 if(id.startsWith('permit2')){
  const batch=id==='permit2-batch',primaryType=batch?'PermitBatch':'PermitSingle';
  const details=(token:Address)=>({token,amount:String(2n**160n-1n),expiration:String(deadline),nonce:'0'});
  return signature({domain:{...domain,name:'WalletShield Lab Permit2',verifyingContract:c.permit2.address},types:{EIP712Domain:domainTypes,PermitDetails:[{name:'token',type:'address'},{name:'amount',type:'uint160'},{name:'expiration',type:'uint48'},{name:'nonce',type:'uint48'}],[primaryType]:[{name:'details',type:batch?'PermitDetails[]':'PermitDetails'},{name:'spender',type:'address'},{name:'sigDeadline',type:'uint256'}]},primaryType,message:{details:batch?[details(c.token.address),details(c.quote.address)]:details(c.token.address),spender,sigDeadline:String(deadline)}},'eth_signTypedData_v4');
 }
 if(id.startsWith('permit')){
  const nonce=await labClient.readContract({address:c.token.address,abi:artifacts.LabToken.abi,functionName:'nonces',args:[account]}) as bigint;
  return signature({domain,types:{EIP712Domain:domainTypes,Permit:[{name:'owner',type:'address'},{name:'spender',type:'address'},{name:'value',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]},primaryType:'Permit',message:{owner:id==='permit-owner'?recipient:account,spender,value:String(id==='permit-unlimited'?maxUint256:100n*amount),nonce:String(id==='permit-nonce'?nonce+1n:nonce),deadline:String(id==='permit-expired'?1n:deadline)}},'eth_signTypedData_v4');
 }
 if(id==='order')return signature({domain:{...domain,name:'WalletShield Local Order',verifyingContract:c.actions.address},types:{EIP712Domain:domainTypes,Order:[{name:'offerer',type:'address'},{name:'recipient',type:'address'},{name:'token',type:'address'},{name:'amount',type:'uint256'},{name:'deadline',type:'uint256'}]},primaryType:'Order',message:{offerer:account,recipient,token:c.token.address,amount:String(amount),deadline:String(deadline)}},'eth_signTypedData_v4');
 throw Error('This test request is not implemented.');
}
