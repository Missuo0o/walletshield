import { encodeFunctionData, erc20Abi, parseAbi, maxUint256 } from 'viem';
import type { SecurityRequest, Evidence } from './types.js';
import { evidence } from './providers.js';
import { extendedAbi } from './operations.js';
const from='0x2222222222222222222222222222222222222222',to='0x3333333333333333333333333333333333333333',token='0x1111111111111111111111111111111111111111';
const tx=(data=`0x` as `0x${string}`,target:string|null=token,value='0x0'):SecurityRequest=>({kind:'transaction',chainId:31337,origin:'https://demo.walletshield.example',transaction:{from,to:target,data,value}});
const typed=(primaryType:string,message:Record<string,unknown>):SecurityRequest=>({kind:'signature',chainId:31337,origin:'https://demo.walletshield.example',signature:{from,method:'eth_signTypedData_v4',data:{domain:{name:'DEMO',chainId:31337,verifyingContract:token},primaryType,types:primaryType==='Permit'?{Permit:[{name:'owner',type:'address'},{name:'spender',type:'address'},{name:'value',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]}:{PermitSingle:[{name:'details',type:'PermitDetails'},{name:'spender',type:'address'},{name:'sigDeadline',type:'uint256'}],PermitDetails:[{name:'token',type:'address'},{name:'amount',type:'uint160'},{name:'expiration',type:'uint48'},{name:'nonce',type:'uint48'}]},message}}});
const commonAbi=parseAbi(['function setApprovalForAll(address,bool)','function safeTransferFrom(address,address,uint256)','function safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)','function swapExactTokensForTokens(uint256,uint256,address[],address,uint256)','function multicall(bytes[])']);
export const securityExamples:{id:string;name:string;request:SecurityRequest;extra?:Evidence[]}[]=[
  {id:'native',name:'Native transfer',request:tx('0x',to,'0xde0b6b3a7640000')},
  {id:'token-transfer',name:'Token transfer',request:tx(encodeFunctionData({abi:erc20Abi,functionName:'transfer',args:[to,100000000n]}))},
  {id:'approve',name:'Unlimited approval',request:tx(encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[to,maxUint256]}))},
  {id:'operator',name:'NFT operator approval',request:tx(encodeFunctionData({abi:commonAbi,functionName:'setApprovalForAll',args:[to,true]}))},
  {id:'nft-transfer',name:'NFT transfer',request:tx(encodeFunctionData({abi:commonAbi,functionName:'safeTransferFrom',args:[from,to,0n]}))},
  {id:'nft-batch',name:'Batch NFT transfer',request:tx(encodeFunctionData({abi:commonAbi,functionName:'safeBatchTransferFrom',args:[from,to,[1n,2n],[1n,3n],'0x']}))},
  {id:'honeypot',name:'Swap / honeypot example',request:tx(encodeFunctionData({abi:commonAbi,functionName:'swapExactTokensForTokens',args:[100n,1n,[token,to],from,BigInt(Math.floor(Date.now()/1000)+3600)]})),extra:[evidence('fixture_token_risk','risk','Synthetic honeypot signal','An offline fixture, not real-address detection.','demo-fixture',{is_honeypot:'1'})]},
  {id:'permit',name:'Permit signature',request:typed('Permit',{owner:from,spender:to,value:String(maxUint256),nonce:'0',deadline:'2000000000'})},
  {id:'permit2',name:'Permit2 signature',request:typed('PermitSingle',{details:{token,amount:String(2n**160n-1n),expiration:'2000000000',nonce:'0'},spender:to,sigDeadline:'2000000000'})},
  {id:'message',name:'Message signatures',request:{kind:'signature',chainId:0,origin:'https://demo.walletshield.example',signature:{from,method:'personal_sign',data:'Claim reward. Signing this message may authorize an action.'}}},
  {id:'raw-sign',name:'Raw signature',request:{kind:'signature',chainId:31337,signature:{from,method:'eth_sign',data:`0x${'ab'.repeat(32)}`}}},
  {id:'batch',name:'Complex contract / batch',request:tx(encodeFunctionData({abi:commonAbi,functionName:'multicall',args:[['0x12345678']]}))},
  {id:'deployment',name:'Contract deployment',request:tx('0x60006000',null)},
  {id:'permission',name:'Permissions / session keys',request:{kind:'permission',chainId:31337,method:'wallet_grantPermissions',params:{}}},
  {id:'user-operation',name:'Smart-account operation',request:{kind:'user_operation',chainId:31337,method:'eth_sendUserOperation',params:{}}}
  ,{id:'vault',name:'Vault deposit / share preview',request:tx(encodeFunctionData({abi:extendedAbi,functionName:'deposit',args:[100n,from]}))}
  ,{id:'lending',name:'Lending / collateral account',request:tx(encodeFunctionData({abi:extendedAbi,functionName:'borrow',args:[token,100n,2n,0,from]}))}
  ,{id:'staking',name:'Staking / exit limits',request:tx(encodeFunctionData({abi:extendedAbi,functionName:'stake',args:[100n]}))}
  ,{id:'liquidity',name:'Provide liquidity',request:tx(encodeFunctionData({abi:extendedAbi,functionName:'addLiquidity',args:[token,to,100n,100n,99n,99n,from,2000000000n]}))}
  ,{id:'bridge',name:'Bridge deposit',request:tx(encodeFunctionData({abi:extendedAbi,functionName:'bridgeETHTo',args:[to,200000,'0x']}),token,'0x64')}
  ,{id:'claim',name:'Reward / airdrop claim',request:tx(encodeFunctionData({abi:extendedAbi,functionName:'claim',args:[0n,from,100n,[]]}))}
  ,{id:'control',name:'Control change',request:tx(encodeFunctionData({abi:extendedAbi,functionName:'transferOwnership',args:[to]}))}
  ,{id:'unknown-rpc',name:'Unknown wallet request',request:{kind:'wallet_rpc',chainId:31337,method:'wallet_customOperation',params:{to,value:'0x64',data:'0x12345678'}}}
  ,{id:'network',name:'Network configuration request',request:{kind:'wallet_rpc',chainId:31337,method:'wallet_addEthereumChain',params:[{chainId:'0x1',chainName:'Unverified chain',rpcUrls:['https://unverified.example']} ]}}
  ,{id:'send-calls',name:'Smart-account batch',request:{kind:'wallet_rpc',chainId:31337,method:'wallet_sendCalls',params:[{from,chainId:'0x7a69',calls:[{to:token,value:'0x0',data:'0x12345678'}]}]}}
];
export function demoEvidence():Evidence[] {return [
  evidence('chain_context','pass','Synthetic context','No real node read; does not establish assets at the address.','demo-fixture',{blockNumber:'demo',nativeBalanceWei:'10000000000000000000'}),
  evidence('asset_simulation','unknown','Full simulation not run','The fixed fixture does not execute real buys or sells.','demo-fixture'),
  evidence('token_security','unknown','Real token risk is unknown','External intelligence was not queried.','demo-fixture'),
  evidence('address_reputation','unknown','Real address reputation is unknown','Example-address reputation was not verified.','demo-fixture')
];}
