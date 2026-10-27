import {LAB_CHAIN_ID,HOSTED_LAB_ENABLED} from '../../src/testing/network';
import {RUNTIME} from '../../src/runtime.generated';
import {switchWalletNetwork} from './networkSwitch';
import {walletAccounts,walletChain,type WalletProvider} from './wallet';

export const LOCAL_CHAIN_ID=LAB_CHAIN_ID;
export const LOCAL_CHAIN_METADATA={chainId:`0x${LAB_CHAIN_ID.toString(16)}`,chainName:HOSTED_LAB_ENABLED?'WalletShield Test Lab':'WalletShield Local',nativeCurrency:{name:'Test Ether',symbol:'ETH',decimals:18},rpcUrls:[HOSTED_LAB_ENABLED?RUNTIME.appOrigin+'/api/test-rpc':'http://127.0.0.1:8545']};
type LocalWalletOptions={isCurrent?:()=>boolean;timeoutMs?:number;readTimeoutMs?:number;promptTimeoutMs?:number;verificationTimeoutMs?:number;pollIntervalMs?:number};
type WalletRequest=Parameters<WalletProvider['request']>[0];
export class LocalWalletTimeoutError extends Error {readonly code='WALLETSHIELD_WALLET_TIMEOUT';}

/** One local action keeps one captured provider/account and one shared deadline.
 * Timeouts release the page; they do not cancel a request inside the wallet.
 * A late response is never allowed to continue the action or create a new prompt. */
export function createLocalWalletGuard(provider:WalletProvider,address:string,options:LocalWalletOptions={}){
 if(!/^0x[\da-f]{40}$/i.test(address))throw Error('Select a valid local test account.');
 const deadline=Date.now()+(options.timeoutMs??120000);
 const pending='The local wallet request timed out. Open MetaMask and approve or cancel any pending request before starting again. The page cannot cancel a wallet prompt.';
 function assertCurrent(){
  if(options.isCurrent&&!options.isCurrent())throw Error('The wallet identity changed. Start the local asset action again.');
  if(Date.now()>=deadline)throw new LocalWalletTimeoutError(pending);
 }
 async function request(args:WalletRequest):Promise<unknown>{
  assertCurrent();
  const prompt=args.method==='wallet_switchEthereumChain'||args.method==='wallet_addEthereumChain'||args.method==='wallet_watchAsset';
  const timeout=Math.max(1,Math.min(deadline-Date.now(),prompt?(options.promptTimeoutMs??60000):(options.readTimeoutMs??5000)));
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const value=await Promise.race([Promise.resolve().then(()=>{assertCurrent();return provider.request(args);}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new LocalWalletTimeoutError(pending)),timeout);})]);
   assertCurrent();return value;
  }finally{if(timer)clearTimeout(timer);}
 }
 const boundedProvider:WalletProvider={request};
 async function checkAccount(){
  const accounts=walletAccounts(await request({method:'eth_accounts'}));
  if(accounts[0]?.toLowerCase()!==address.toLowerCase())throw Error('The account changed. Select this local test account and try again.');
 }
 async function checkIdentity(){
  await checkAccount();
  if(walletChain(await request({method:'eth_chainId'}))!==LOCAL_CHAIN_ID)throw Error(`The account or network changed. Select this account on test chain ${LAB_CHAIN_ID} and try again.`);
 }
 async function switchNetwork(){
  await checkAccount();
  if(walletChain(await request({method:'eth_chainId'}))!==LOCAL_CHAIN_ID){
   // Adding a network is only the explicit unknown-chain fallback. We do not
   // resubmit a switch or add after a timeout, rejection or pending-request error.
   let added=false;
   const switchingProvider:WalletProvider={request:async args=>{
    try{return await request(args);}
    catch(error){
     if(args.method!=='wallet_switchEthereumChain'||added||(error as {code?:number})?.code!==4902)throw error;
     assertCurrent();added=true;
     await request({method:'wallet_addEthereumChain',params:[LOCAL_CHAIN_METADATA]});
     return null;
    }
   }};
   await switchWalletNetwork(switchingProvider,LOCAL_CHAIN_ID,{isCurrent:()=>{assertCurrent();return true;},requestTimeoutMs:Math.max(1,Math.min(deadline-Date.now(),(options.promptTimeoutMs??60000)*2)),verificationTimeoutMs:Math.max(1,Math.min(deadline-Date.now(),options.verificationTimeoutMs??3000)),pollIntervalMs:options.pollIntervalMs});
  }
  await checkIdentity();return LOCAL_CHAIN_ID;
 }
 return {provider:boundedProvider,assertCurrent,checkIdentity,switchNetwork};
}
