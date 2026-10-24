import {authenticateWallet} from './identity';
import {SNAP_ID,requestWalletShieldSnap,walletAccounts,walletChain,type WalletProvider,type SnapSetupStage} from './wallet';
import type {createWalletAction} from './walletAction';
type Action=ReturnType<typeof createWalletAction>;
type Api=<T>(path:string,body?:unknown)=>Promise<T>;
export type SnapSetupStatus={ready:boolean;expires:number|null};
/** Setup waits use the same bounded action as signing entry points. A timeout
 * stops page continuations; it cannot dismiss an outstanding wallet prompt. */
export async function connectWalletSetup(action:Action){
 const selected=walletAccounts(await action.request({method:'eth_requestAccounts'},true));
 const current=walletAccounts(await action.request({method:'eth_accounts'}));
 if(!current.length||current[0]?.toLowerCase()!==selected[0]?.toLowerCase())throw Error('The wallet account changed during connection. Check MetaMask and connect again.');
 const chainId=walletChain(await action.request({method:'eth_chainId'}));if(!chainId)throw Error('The wallet did not return a supported network.');
 const final=walletAccounts(await action.request({method:'eth_accounts'}));if(final[0]?.toLowerCase()!==current[0]?.toLowerCase())throw Error('The wallet account changed during connection. Check MetaMask and connect again.');
 return {accounts:final,chainId};
}
export async function readWalletSnapSetup(action:Action,hosted:boolean):Promise<SnapSetupStatus>{
 const snaps=await action.request({method:'wallet_getSnaps'}) as Record<string,{enabled:boolean;blocked:boolean}>;
 if(!snaps?.[SNAP_ID]?.enabled||snaps[SNAP_ID].blocked)return {ready:false,expires:null};
 const health=await action.request({method:'wallet_invokeSnap',params:{snapId:SNAP_ID,request:{method:'walletshield_status'}}}) as {paired?:boolean;address?:string;chainId?:number;expiresAt?:string|null};
 const accounts=walletAccounts(await action.request({method:'eth_accounts'}));
 const currentChain=health?.chainId!==undefined?walletChain(await action.request({method:'eth_chainId'})):undefined;
 const expires=typeof health?.expiresAt==='string'?Date.parse(health.expiresAt):null;
 const expiryValid=expires===null?!hosted:Number.isFinite(expires)&&expires>Date.now();
 const ready=accounts.length>0&&health?.paired===true&&expiryValid&&(!health.address||health.address.toLowerCase()===accounts[0]?.toLowerCase())&&(health.chainId===undefined||health.chainId===currentChain);
 action.guard();return {ready,expires:ready?expires:null};
}
export async function verifyWalletSetupIdentity(action:Action,account:string,api:Api){
 const provider:WalletProvider={request:args=>action.request(args,args.method==='personal_sign')};
 const boundedApi:Api=(path,body)=>action.wait(()=>api(path,body),15000);
 const verified=await authenticateWallet(provider,account,action.current,boundedApi);action.guard();return verified;
}
export async function installWalletSetup(action:Action,hosted:boolean,api:Api,stage:(value:SnapSetupStage)=>void){
 const provider:WalletProvider={request:args=>action.request(args,args.method==='wallet_requestSnaps')};
 const installed=await requestWalletShieldSnap(provider);action.guard();
 stage('pair-token');const pairing=await action.wait(()=>api<{token:string}>('/api/security/pair',{}),15000);
 if(typeof pairing?.token!=='string'||!/^[a-f0-9]{64}$/.test(pairing.token))throw Error('The backend did not return a valid pairing credential.');
 stage('pair-backend');await action.request({method:'wallet_invokeSnap',params:{snapId:SNAP_ID,request:{method:'walletshield_configure',params:{token:pairing.token}}}},true);
 stage('verify');const status=await readWalletSnapSetup(action,hosted);action.guard();
 if(!status.ready)throw Error('The wallet did not confirm a backend connection for this account. Reload and pair the Snap again.');
 return {installed,status};
}
