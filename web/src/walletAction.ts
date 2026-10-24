import {walletAccounts,walletChain,type WalletProvider} from './wallet';

type Options={isCurrent:()=>boolean;timeoutMs?:number;readTimeoutMs?:number;promptTimeoutMs?:number};
/** A page can stop awaiting an old action, but cannot cancel its wallet prompt.
 * The guard is checked before/after every await; timeouts permanently close the
 * action so a late answer cannot enqueue a signature, transaction or new prompt. */
export function createWalletAction(provider:WalletProvider,options:Options){
 const deadline=Date.now()+(options.timeoutMs??240000),controller=new AbortController();
 const changed='The wallet account, provider or selected network changed. Start a new request.';
 const current=()=>!controller.signal.aborted&&Date.now()<deadline&&options.isCurrent();
 function guard(){if(!current())throw controller.signal.reason instanceof Error?controller.signal.reason:Error(changed);}
 function cancel(){if(!controller.signal.aborted)controller.abort(Error(changed));}
 async function wait<T>(operation:()=>Promise<T>,milliseconds=85000,prompt=false):Promise<T>{
  guard();let timer:ReturnType<typeof setTimeout>|undefined;let aborted:(()=>void)|undefined;
  try{
   const result=await Promise.race([Promise.resolve().then(()=>{guard();return operation();}),new Promise<never>((_,reject)=>{
    aborted=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',aborted,{once:true});
    timer=setTimeout(()=>{const error=Error(prompt?'The wallet has not answered. Open MetaMask and approve or cancel any pending request before trying again. The page cannot cancel a wallet prompt.':'The wallet check did not complete before its deadline. Open MetaMask and check the account, network and pending requests before trying again.');controller.abort(error);},Math.max(1,Math.min(milliseconds,deadline-Date.now())));
   })]);
   guard();return result;
  }finally{if(timer)clearTimeout(timer);if(aborted)controller.signal.removeEventListener('abort',aborted);}
 }
 const request=(args:Parameters<WalletProvider['request']>[0],prompt=false)=>wait(()=>provider.request(args),prompt?(options.promptTimeoutMs??120000):(options.readTimeoutMs??5000),prompt);
 async function checkIdentity(account:string,chainId:number){
  const accounts=walletAccounts(await request({method:'eth_accounts'}));
  const chain=walletChain(await request({method:'eth_chainId'}));
  if(accounts[0]?.toLowerCase()!==account.toLowerCase()||chain!==chainId)throw Error('Switch the wallet to the selected network and check the account before continuing.');
 }
 return {guard,current,cancel,wait,request,checkIdentity};
}
