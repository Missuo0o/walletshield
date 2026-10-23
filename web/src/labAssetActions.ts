import type {LabInventory} from '../../src/testing/contracts';
import type {WalletProvider} from './wallet';

/** Wallet display is a separate, optional user decision after local funding.
 * A refusal or unsupported token must not turn successful funding into failure. */
export async function requestPreparedAssetDisplay(provider:WalletProvider,inventory:LabInventory,checkIdentity:()=>Promise<void>){
 let displayed=0,declined=0,unavailable=0;
 const requests=[
  ...inventory.assets.map(asset=>({type:'ERC20',options:{address:asset.address,symbol:asset.symbol,decimals:asset.decimals}})),
  ...inventory.nfts.filter(asset=>BigInt(asset.balance)>0n).map(asset=>({type:asset.standard,options:{address:asset.address,tokenId:asset.id}}))
 ];
 for(const request of requests){
  await checkIdentity();
  try{
   const added=await provider.request({method:'wallet_watchAsset',params:request});
   if(added===true)displayed++;else declined++;
  }catch(error){if((error as {code?:number})?.code===4001)declined++;else unavailable++;}
  await checkIdentity();
 }
 return {displayed,declined,unavailable,message:`Wallet display: ${displayed} request(s) accepted, ${declined} declined, ${unavailable} unavailable. NFT display support is experimental in desktop MetaMask. Native test ETH appears automatically; display choices do not change on-chain balances.`};
}
