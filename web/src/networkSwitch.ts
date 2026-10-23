import {walletChain,type WalletProvider} from './wallet';

async function within<T>(request:Promise<T>,timeoutMs:number,message:string):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([request,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),timeoutMs);})]);}
 finally{if(timer)clearTimeout(timer);}
}

/** Sends one wallet request directly. No backend scan, SDK or model call.
 * A timeout releases the page; it cannot cancel a prompt inside the wallet. */
export async function switchWalletNetwork(provider:WalletProvider,chainId:number,options:{isCurrent?:()=>boolean;requestTimeoutMs?:number;verificationTimeoutMs?:number;pollIntervalMs?:number}={}):Promise<number>{
 if(!Number.isSafeInteger(chainId)||chainId<=0)throw Error('Select a valid wallet network.');
 const current=()=>{if(options.isCurrent&&!options.isCurrent())throw Error('The selected wallet, account or target network changed. Start a new request.');};
 current();
 try{
  await within(provider.request({method:'wallet_switchEthereumChain',params:[{chainId:`0x${chainId.toString(16)}`}]}),options.requestTimeoutMs??60000,'The wallet has not answered. Open MetaMask and approve or cancel the pending network switch. The request may still be pending in the wallet.');
  current();
  // Some providers briefly report the previous chain after resolving the switch.
  const deadline=Date.now()+(options.verificationTimeoutMs??3000);
  const unconfirmed='The wallet has not confirmed the selected network. Check the active network in MetaMask before trying again.';
  while(Date.now()<deadline){
   current();
   const observed=walletChain(await within(provider.request({method:'eth_chainId'}),Math.max(1,deadline-Date.now()),unconfirmed));
   current();
   if(observed===chainId)return observed;
   const remaining=deadline-Date.now();
   if(remaining>0)await new Promise(resolve=>setTimeout(resolve,Math.min(options.pollIntervalMs??150,remaining)));
  }
  throw Error(unconfirmed);
 }catch(error){
  const code=error&&typeof error==='object'&&'code' in error?error.code:undefined;
  if(code===4001)throw Error('Network switch canceled.');
  if(code===4902)throw Error('This network is not configured in the wallet. Add it using official network information, then try again. Backend Infura credentials are never exposed to the browser.');
  if(code===-32002)throw Error('A wallet request is already pending. Open MetaMask and approve or cancel it before trying again.');
  throw error instanceof Error?error:Error('The network switch did not complete. Check MetaMask and try again.');
 }
}
