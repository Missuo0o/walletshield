import {RUNTIME} from '../../src/runtime.generated';
import type { RequestSnapsParams, Snap } from '@metamask/snaps-sdk';

export type WalletProvider = {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?: (event: string, fn: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, fn: (...args: unknown[]) => void) => void;
};
export const SNAP_ID = RUNTIME.snapId;
export type DiscoveredWallet={id:string;name:string;rdns:string;provider:WalletProvider};
export function defaultWallet(wallets:DiscoveredWallet[]){return wallets.find(w=>w.rdns==='io.metamask.flask')??wallets.find(w=>w.rdns==='io.metamask')??wallets[0];}
/** Provider announcements are untrusted labels, not wallet authentication.
 * We render no supplied icons/HTML and keep every request on the chosen object. */
export function discoverWallets(target:EventTarget,legacy:WalletProvider|undefined,changed:(wallets:DiscoveredWallet[])=>void){
 const wallets:DiscoveredWallet[]=legacy?[{id:'legacy',name:'Browser wallet (legacy provider)',rdns:'',provider:legacy}]:[];
 const announce=(event:Event)=>{
  const value=(event as CustomEvent).detail,info=value?.info,provider=value?.provider;
  if(!info||typeof info.uuid!=='string'||!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(info.uuid)||typeof info.name!=='string'||!info.name.trim()||info.name.length>80||typeof info.rdns!=='string'||info.rdns.length>150||typeof provider?.request!=='function')return;
  if(wallets.some(w=>w.id===info.uuid))return;
  const fallback=wallets.findIndex(w=>w.id==='legacy'&&w.provider===provider);if(fallback>=0)wallets.splice(fallback,1);
  if(wallets.some(w=>w.provider===provider))return;
  wallets.push({id:info.uuid,name:info.name,rdns:info.rdns,provider});changed([...wallets]);
 };
 target.addEventListener('eip6963:announceProvider',announce);changed([...wallets]);target.dispatchEvent(new Event('eip6963:requestProvider'));
 return()=>target.removeEventListener('eip6963:announceProvider',announce);
}
export function walletAccounts(value:unknown):string[]{if(!Array.isArray(value)||value.some(v=>typeof v!=='string'||!/^0x[\da-f]{40}$/i.test(v)))throw Error('The wallet returned an invalid account list.');return value;}
export function walletChain(value:unknown):number|null{if(typeof value!=='string'||!/^0x[\da-f]+$/i.test(value))return null;const id=Number(BigInt(value));return Number.isSafeInteger(id)&&id>0?id:null;}

export async function requestWalletShieldSnap(provider: WalletProvider): Promise<Snap> {
  // This method requires a named object, unlike the positional arrays used by
  // eth_sendTransaction and wallet_switchEthereumChain.
  const params: RequestSnapsParams = { [SNAP_ID]: {} };
  const result = await provider.request({ method: 'wallet_requestSnaps', params });
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('The wallet did not return valid Snap installation metadata.');
  const entry = (result as Record<string, unknown>)[SNAP_ID];
  if (!entry || typeof entry !== 'object') throw new Error('WalletShield was absent from the wallet response. Installation is not confirmed.');
  if ('error' in entry) {
    const error = entry.error as { code?: unknown; message?: unknown } | null;
    throw Object.assign(new Error(typeof error?.message === 'string' ? error.message : 'The wallet reported a Snap installation failure.'),
      typeof error?.code === 'number' ? { code: error.code } : {});
  }
  const installed = entry as Partial<Snap>;
  if (installed.id !== SNAP_ID || !installed.enabled || installed.blocked !== false || typeof installed.version !== 'string') {
    throw new Error('WalletShield is not available. Check its Snap status in the wallet.');
  }
  return installed as Snap;
}

export type SnapSetupStage='install'|'pair-token'|'pair-backend'|'verify';
export function snapInstallationError(error: unknown,stage:SnapSetupStage='install'): string {
  const details = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : {};
  if (details.code === 4001) return stage==='install'?'Snap installation canceled. You can try again later.':'The Snap is installed. Pairing was canceled; reload and pair it again when ready.';
  const message = typeof details.message === 'string' ? details.message.slice(0, 400) : 'Check Flask, the local service on port 8080 and the wallet prompt.';
  const label=stage==='install'?'Snap installation incomplete':stage==='pair-token'?'Snap installed; pairing credentials unavailable':stage==='pair-backend'?'Snap installed; backend connection incomplete':'Snap installed; pairing verification failed';
  const help=/failed to fetch|networkerror|fetch failed/i.test(message)?String(RUNTIME.mode)==='local'?' Refresh the page, then reload and pair the Snap. Port 8080 serves installation files and port 8787 provides the backend connection. This connection is independent of mainnet or testnet selection.':' Check that the configured HTTPS backend is reachable, then pair the Snap again.':'';
  return `${label}${typeof details.code === 'number' ? ` (${details.code})` : ''}: ${message}${help}`;
}
