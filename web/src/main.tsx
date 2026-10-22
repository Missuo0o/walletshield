import {RUNTIME} from '../../src/runtime.generated';
import {setWebSession,webSession} from './session';
import {authenticateWallet} from './identity';
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Shield,ShieldCheck,FileText,Plug,Wallet,ChevronRight,FlaskConical,X,Loader2,Check,Globe} from 'lucide-react';
import {WalletLab,labApi} from './WalletLab';
import {SecurityDesk} from './SecurityDesk';
import {RealNetworks} from './RealNetworks';
import {SNAP_ID,requestWalletShieldSnap,snapInstallationError,discoverWallets,defaultWallet,walletAccounts,walletChain,type DiscoveredWallet,type WalletProvider,type SnapSetupStage} from './wallet';
import './styles.css';
declare global{interface Window{ethereum?:WalletProvider}}
type Page='lab'|'network'|'history'|'setup';
function App(){
 const hosted=String(RUNTIME.mode)==='hosted';
 const [identityBound,setIdentityBound]=useState(false);
 const [page,setPage]=useState<Page>(hosted?'network':'lab'),[account,setAccount]=useState(''),[snapReady,setSnapReady]=useState(false),[prepared,setPrepared]=useState(false),[walletBusy,setWalletBusy]=useState(false),[notice,setNotice]=useState(''),[online,setOnline]=useState(false),[wallets,setWallets]=useState<DiscoveredWallet[]>([]),[walletId,setWalletId]=useState(''),[walletChainId,setWalletChainId]=useState<number|null>(null);
 const selectedWallet=wallets.find(w=>w.id===walletId)??defaultWallet(wallets),provider=selectedWallet?.provider,providerRef=useRef(provider),busyRef=useRef(false);providerRef.current=provider;
 const identityEpoch=useRef(0);
 const setBusy=(value:boolean)=>{busyRef.current=value;setWalletBusy(value);};
 const short=(address:string)=>`${address.slice(0,6)}…${address.slice(-4)}`;
 const stillSelected=(p:WalletProvider)=>{if(providerRef.current!==p)throw Error('The selected wallet changed. Reconnect before continuing.');};
 async function readSnap(p=provider):Promise<boolean>{
  if(!p){setSnapReady(false);return false;}
  try{
   const snaps=await p.request({method:'wallet_getSnaps'}) as Record<string,{enabled:boolean;blocked:boolean}>;
   if(!snaps?.[SNAP_ID]?.enabled||snaps[SNAP_ID].blocked){if(providerRef.current===p)setSnapReady(false);return false;}
   const health=await p.request({method:'wallet_invokeSnap',params:{snapId:SNAP_ID,request:{method:'walletshield_status'}}}) as {paired?:boolean;address?:string};
   const accounts=walletAccounts(await p.request({method:'eth_accounts'}));
   const ready=health?.paired===true&&(!health.address||health.address.toLowerCase()===accounts[0]?.toLowerCase());
   if(providerRef.current===p)setSnapReady(ready);return ready;
  }catch{if(providerRef.current===p)setSnapReady(false);return false;}
 }
 function clearIdentity(){identityEpoch.current++;setWebSession(null);setIdentityBound(false);}
 async function bindIdentity(){if(!provider||!account||busyRef.current)return;const epoch=identityEpoch.current;setBusy(true);try{const verified=await authenticateWallet(provider,account,()=>identityEpoch.current===epoch&&providerRef.current===provider,labApi);if(identityEpoch.current!==epoch||providerRef.current!==provider)throw Error('The wallet account changed before verification finished. Start again.');setWebSession(verified);setIdentityBound(true);setNotice('Wallet identity verified. This login signature gives access to your own reports. Next, install and pair the Snap.');}catch(e){clearIdentity();setNotice((e as {code?:number}).code===4001?'Identity verification canceled.':e instanceof Error?e.message:'Identity verification did not complete.');}finally{setBusy(false);}}

 async function revokeIdentity(){if(busyRef.current)return;setBusy(true);try{await labApi('/api/wallet-auth/revoke',{});await labApi('/api/wallet-auth/logout',{});clearIdentity();setSnapReady(false);setNotice('Snap credentials for this wallet were revoked. Sign in and pair again to restore access.');}catch(e){setNotice(e instanceof Error?e.message:'Sign out did not complete.');}finally{setBusy(false);}}

 useEffect(()=>{void fetch('/api/health').then(r=>setOnline(r.ok)).catch(()=>setOnline(false));return discoverWallets(window,window.ethereum,setWallets);},[]);
 useEffect(()=>{
  let active=true;clearIdentity();setAccount('');setPrepared(false);setSnapReady(false);setWalletChainId(null);if(!provider)return;
  void provider.request({method:'eth_accounts'}).then(value=>{if(active)setAccount(walletAccounts(value)[0]??'');}).catch(()=>{});
  void provider.request({method:'eth_chainId'}).then(value=>{if(active)setWalletChainId(walletChain(value));}).catch(()=>{});void readSnap(provider);
  const changed=(value:unknown)=>{clearIdentity();setSnapReady(false);try{setAccount(walletAccounts(value)[0]??'');}catch{setAccount('');}setPrepared(false);};const chain=(value:unknown)=>{setWalletChainId(walletChain(value));setPrepared(false);};const disconnected=()=>{clearIdentity();setSnapReady(false);setAccount('');setWalletChainId(null);setPrepared(false);};
  provider.on?.('accountsChanged',changed);provider.on?.('chainChanged',chain);provider.on?.('disconnect',disconnected);
  return()=>{active=false;provider.removeListener?.('accountsChanged',changed);provider.removeListener?.('chainChanged',chain);provider.removeListener?.('disconnect',disconnected);};
 },[provider]);
 async function connect(){if(busyRef.current)return;if(!provider){setNotice('No compatible wallet found. Open this page in a desktop browser with MetaMask Flask installed.');return;}if(selectedWallet)setWalletId(selectedWallet.id);setBusy(true);try{const accounts=walletAccounts(await provider.request({method:'eth_requestAccounts'}));stillSelected(provider);setAccount(accounts[0]??'');setWalletChainId(walletChain(await provider.request({method:'eth_chainId'})));await readSnap(provider);setNotice(page==='network'?'Wallet connected. Check the selected network and Snap status. Connecting an account does not generate a risk score.':'Wallet connected. Install or reload the Snap, then prepare local test assets.');}catch(e){setNotice((e as {code?:number}).code===4001?'Wallet connection canceled.':e instanceof Error?e.message:'Wallet connection did not complete.');}finally{setBusy(false);}}
 async function install(){
  if(!provider||busyRef.current)return;
  if(hosted&&(!identityBound||webSession()?.address.toLowerCase()!==account.toLowerCase())){setNotice('Verify the current wallet identity before installing and pairing the Snap.');return;}
  if(selectedWallet)setWalletId(selectedWallet.id);
  const epoch=identityEpoch.current;
  const guard=()=>{stillSelected(provider);if(epoch!==identityEpoch.current)throw Error('The account changed during pairing. Start again.');};
  let stage:SnapSetupStage='install';setBusy(true);
  try{
   const installed=await requestWalletShieldSnap(provider);guard();
   stage='pair-token';const pairing=await labApi<{token:string}>('/api/security/pair',{});guard();
   stage='pair-backend';await provider.request({method:'wallet_invokeSnap',params:{snapId:SNAP_ID,request:{method:'walletshield_configure',params:{token:pairing.token}}}});guard();
   stage='verify';const ready=await readSnap(provider);guard();
   if(!ready)throw Error('The wallet did not confirm a backend connection for this account. Reload and pair the Snap again.');
   setNotice(`WalletShield ${installed.version} is installed and its backend connection is verified. Open Public networks to check the network and test the signing insight.`);
  }catch(e){setSnapReady(false);setNotice(snapInstallationError(e,stage));}finally{setBusy(false);}
 }
 async function switchLocal(){
  if(!provider)throw Error('No wallet found.');stillSelected(provider);
  if(walletChain(await provider.request({method:'eth_chainId'}))!==31337){
   try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x7a69'}]});}
   catch(e){if((e as {code?:number}).code!==4902)throw e;await provider.request({method:'wallet_addEthereumChain',params:[{chainId:'0x7a69',chainName:'WalletShield Local',nativeCurrency:{name:'Test Ether',symbol:'ETH',decimals:18},rpcUrls:['http://127.0.0.1:8545']}]});}
  }
  stillSelected(provider);const chainId=walletChain(await provider.request({method:'eth_chainId'}));setWalletChainId(chainId);if(chainId!==31337)throw Error('Switch to local chain 31337. Lab requests are restricted to that chain.');
 }
 async function prepare(){if(!provider||!account||busyRef.current)return;setBusy(true);setPrepared(false);try{await switchLocal();const accounts=walletAccounts(await provider.request({method:'eth_accounts'}));if(accounts[0]?.toLowerCase()!==account.toLowerCase())throw Error('The wallet account changed. Reconnect to continue.');const result=await labApi<{message:string}>('/api/lab/prepare',{address:account});stillSelected(provider);const current=walletAccounts(await provider.request({method:'eth_accounts'}));if(current[0]?.toLowerCase()!==account.toLowerCase()||walletChain(await provider.request({method:'eth_chainId'}))!==31337)throw Error('The account or network changed during setup. Check both before continuing.');setPrepared(true);setNotice(result.message);}catch(e){setNotice(e instanceof Error?e.message:'Test asset preparation failed.');}finally{setBusy(false);}}
 const nav=[...(!hosted?[{id:'lab' as const,label:'Local wallet lab',icon:ShieldCheck}]:[]),{id:'network',label:'Public networks',icon:Globe},{id:'history',label:'Check history',icon:FileText},{id:'setup',label:'Wallet setup',icon:Plug}] as const;
 return <div className="app-shell"><aside className="sidebar"><a className="brand" href="#" onClick={e=>{e.preventDefault();if(!walletBusy)setPage(hosted?'network':'lab');}}><span className="brand-icon"><Shield size={23}/></span><span>WalletShield<small>TRANSACTION SECURITY</small></span></a><div className="workspace-label">WORKSPACE <span>{page==='network'?'RPC':'LOCAL'}</span></div><nav aria-label="Main navigation">{nav.map(item=><button key={item.id} aria-label={item.label} disabled={walletBusy} className={`nav-item ${page===item.id?'active':''}`} onClick={()=>setPage(item.id)}><item.icon size={18}/><span>{item.label}</span>{page===item.id&&<ChevronRight size={15}/>}</button>)}</nav><div className="sidebar-bottom"><div className="scope-card"><FlaskConical size={18}/><strong>Review before signing · Development</strong><p>Test local assets and public network data separately. Risk insights cannot guarantee safety.</p><span>v0.4.1 · Muse Wonder</span></div><div className="system-line"><i className={online?'dot online':'dot'}/>{online?'Analysis service online':'Service disconnected'}</div></div></aside>
 <div className="main-shell"><header className="topbar"><div className="breadcrumb">Workspace<ChevronRight size={14}/><span>{nav.find(n=>n.id===page)?.label}</span></div><div className="top-actions"><select aria-label="Choose wallet" className="wallet-select" value={selectedWallet?.id??''} disabled={walletBusy} onChange={e=>{clearIdentity();setSnapReady(false);setWalletId(e.target.value);setNotice('Wallet provider changed. Check the account and verify the Snap connection again.');}}>{!wallets.length&&<option value="">No wallet found</option>}{wallets.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select><button className="button wallet-button" onClick={connect} disabled={walletBusy}><Wallet size={16}/>{walletBusy?'Waiting for wallet…':account?short(account):'Connect wallet'}</button></div></header><main>
 {notice&&<div className="notice" role="status"><span>{notice}</span><button aria-label="Dismiss notice" onClick={()=>setNotice('')}><X size={17}/></button></div>}
 {page==='lab'&&<WalletLab provider={provider} externalBusy={walletBusy} account={account} snapReady={snapReady} prepared={prepared} onPrepare={prepare} onSetup={()=>setPage('setup')} onBusy={setBusy} switchLocal={switchLocal}/>}
 {page==='network'&&<RealNetworks hosted={hosted} identityBound={identityBound} onBind={bindIdentity} onRevoke={revokeIdentity} provider={provider} account={account} walletChainId={walletChainId} snapReady={snapReady} busy={walletBusy} onConnect={connect} onInstall={install} onBusy={setBusy}/>}
 {page==='history'&&<SecurityDesk/>}
 {page==='setup'&&<><div className="page-heading"><div><div className="eyebrow"><span/> WALLET CONNECTION</div><h1>Connect your wallet. <span>Review before you sign.</span></h1><p>One wallet can use multiple networks. The local Snap requires MetaMask Flask. Open Public networks to check a configured network.</p></div></div><div className="setup-grid">
 <section className="panel setup-card"><span className="setup-number">01</span><h2>Connect the selected wallet</h2><p>Choose a wallet in the top bar and use a dedicated Flask test account. This site does not request a recovery phrase or private key.</p><button className="button secondary wide" onClick={connect} disabled={walletBusy}>{account?<Check size={16}/>:<Wallet size={16}/>} {account?`Connected ${short(account)}`:'Connect wallet'}</button></section>
 <section className="panel setup-card"><span className="setup-number">02</span>{hosted&&<><button className="button secondary wide" onClick={bindIdentity} disabled={walletBusy||!account}>{identityBound?'Identity verified':'Sign to verify this wallet'}</button><p>The login signature proves account control without granting asset permissions. The server returns only records belonging to this identity.</p></>}<h2>Install WalletShield Snap</h2><p>Enable transaction and message insights, then pair the backend. Installation alone does not verify that every request type works.</p><code>{SNAP_ID}</code><button className="button primary wide" onClick={install} disabled={walletBusy||!account}>{walletBusy?<Loader2 size={16} className="spin"/>:<Plug size={16}/>} {snapReady?'Reload and pair Snap':'Install and pair Snap'}</button></section>
 {!hosted&&<section className="panel setup-card"><span className="setup-number">03</span><h2>Prepare local test assets</h2><p>For chain 31337 only: prepare test ETH, tokens and NFTs. This action asks the wallet to switch to the local chain and does not issue assets on mainnet.</p><button className="button secondary wide" onClick={prepare} disabled={walletBusy||!account}>{prepared?<Check size={16}/>:<FlaskConical size={16}/>} {prepared?'Assets ready · Replenish':'Switch to local chain and prepare assets'}</button><button className="text-button" onClick={()=>setPage('lab')} disabled={walletBusy}>Open local wallet lab →</button></section>}</div><section className="panel integration-notes"><h2>Integration limits</h2><p>Automatic Snap insights cover EVM transactions and messages supplied by the wallet. Session permissions, smart accounts and network settings have no universal automatic entry point. See the local lab for specific gaps.</p><p>Generated lab signatures are not uploaded, saved or submitted for use. The wallet handles approval and cancellation. WalletShield provides advice without enforced blocking or continuous monitoring. Connecting or installing does not generate a risk score.</p></section></>}
 </main><footer className="app-footer"><span>WalletShield · More context before you sign.</span><span>DEVELOPMENT · v0.4.1</span></footer></div></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
