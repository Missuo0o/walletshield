import {stringToHex} from 'viem';
import {walletAccounts,walletChain,type WalletProvider} from './wallet';
type Api=<T>(path:string,body?:unknown)=>Promise<T>;
/** No credential may be committed after account/provider context changed. */
export async function authenticateWallet(provider:WalletProvider,account:string,isCurrent:()=>boolean,api:Api){
 const guard=()=>{if(!isCurrent())throw Error('The wallet account or provider changed during verification. Start again.');};
 guard();const accounts=walletAccounts(await provider.request({method:'eth_accounts'}));guard();const chainId=walletChain(await provider.request({method:'eth_chainId'}));guard();
 if(accounts[0]?.toLowerCase()!==account.toLowerCase()||!chainId)throw Error('Check the wallet account and network again.');
 const challenge=await api<{id:string;message:string}>('/api/wallet-auth/challenge',{address:account,chainId});guard();
 if(typeof challenge.message!=='string'||challenge.message.length>3000||typeof challenge.id!=='string')throw Error('The identity verification message is invalid.');
 const signature=await provider.request({method:'personal_sign',params:[stringToHex(challenge.message),account]});guard();
 if(typeof signature!=='string'||!/^0x(?:[\da-f]{128}|[\da-f]{130})$/i.test(signature))throw Error('The wallet did not return a valid identity signature.');
 const verified=await api<{token:string;address:string;expiresAt:string}>('/api/wallet-auth/verify',{id:challenge.id,signature});guard();
 if(typeof verified.address!=='string'||verified.address.toLowerCase()!==account.toLowerCase()||!(/^[a-f0-9]{64}$/).test(verified.token)||!Number.isFinite(Date.parse(verified.expiresAt))||Date.parse(verified.expiresAt)<=Date.now())throw Error('The returned identity credential is invalid.');
 const current=walletAccounts(await provider.request({method:'eth_accounts'}));guard();if(current[0]?.toLowerCase()!==account.toLowerCase())throw Error('The account changed during signing.');
 return verified;
}
