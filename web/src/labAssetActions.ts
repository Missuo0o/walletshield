import type {LabInventory} from '../../src/testing/contracts';
import type {WalletProvider} from './wallet';

/** Wallet display is a separate, optional user decision after local funding.
 * A refusal or unsupported token must not turn successful funding into failure. */
export async function requestPreparedAssetDisplay(provider:WalletProvider,inventory:LabInventory,checkIdentity:()=>Promise<void>,options:{requestTimeoutMs?:number}={}){
 let displayed=0,declined=0,unavailable=0,pending=false;
 const requests=[
  ...inventory.assets.map(asset=>({type:'ERC20',options:{address:asset.address,symbol:asset.symbol,decimals:asset.decimals}})),
  ...inventory.nfts.filter(asset=>BigInt(asset.balance)>0n).map(asset=>({type:asset.standard,options:{address:asset.address,tokenId:asset.id}}))
 ];
 for(const request of requests){
  await checkIdentity();
  try{
   let timer:ReturnType<typeof setTimeout>|undefined;
   let added:unknown;
   try{added=await Promise.race([provider.request({method:'wallet_watchAsset',params:request}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('Wallet display request timed out.'),{code:'WALLETSHIELD_WALLET_TIMEOUT'})),options.requestTimeoutMs??60000);})]);}
   finally{if(timer)clearTimeout(timer);}
   if(added===true)displayed++;else declined++;
  }catch(error){
   const code=(error as {code?:number|string})?.code;
   if(code==='WALLETSHIELD_WALLET_TIMEOUT'||code===-32002){pending=true;break;}
   if(code===4001)declined++;else unavailable++;
  }
  await checkIdentity();
 }
 return {displayed,declined,unavailable,pending,message:`Wallet display: ${displayed} request(s) accepted, ${declined} declined, ${unavailable} unavailable.${pending?' Display requests stopped because a wallet prompt may still be pending. Open MetaMask and approve or cancel it before starting again; this page cannot cancel that prompt.':''} NFT display support is experimental in desktop MetaMask. Native test ETH appears automatically; display choices do not change on-chain balances.`};
}
