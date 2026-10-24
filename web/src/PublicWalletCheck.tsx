import React,{useEffect,useRef,useState} from 'react';
import {stringToHex} from 'viem';
import {labApi} from './WalletLab';
import {SNAP_ID,type WalletProvider} from './wallet';
import {SecurityReportView} from './SecurityReportView';
import type {SecurityReport} from '../../src/security/types';
import {createWalletAction} from './walletAction';
/** An actual neutral wallet message exercises Snap delivery on the chosen
 * network. It is not a fixture report, allowance, payment or login signature. */
export function PublicWalletCheck({provider,account,chainId,configured,snapReady,busy,onBusy}:{provider?:WalletProvider;account:string;chainId:number;configured:boolean;snapReady:boolean;busy:boolean;onBusy:(v:boolean)=>void}){
 const [outcome,setOutcome]=useState(''),[error,setError]=useState(''),[report,setReport]=useState<SecurityReport|null>(null);
 const current=useRef({account,chainId,provider,generation:0});if(current.current.account!==account||current.current.chainId!==chainId||current.current.provider!==provider)current.current={account,chainId,provider,generation:current.current.generation+1};const mounted=useRef(true);
 const active=useRef<ReturnType<typeof createWalletAction>|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;active.current?.cancel();};},[]);
 useEffect(()=>{active.current?.cancel();setReport(null);setError('');setOutcome('');},[account,chainId,provider]);
 async function run(){
  if(!provider||!account||busy||active.current)return;
  const generation=current.current.generation,action=createWalletAction(provider,{isCurrent:()=>mounted.current&&current.current.generation===generation});active.current=action;
  onBusy(true);setReport(null);setError('');setOutcome('Waiting for the wallet. Read the message and WalletShield insight, then approve or cancel.');
  const message=['WalletShield request-insight check',`Site: ${window.location.origin}`,`Account: ${account}`,`Selected network: eip155:${chainId}`,`Nonce: ${crypto.randomUUID()}`,`Issued at: ${new Date().toISOString()}`,'Purpose: test the WalletShield pre-sign insight for this message only.','This message does not log in, authorize token spending, create a Permit/order, or submit a blockchain transaction.'].join('\n');
  const data=stringToHex(message);let requested=false;
  try{
   await action.checkIdentity(account,chainId);
   const health=await action.request({method:'wallet_invokeSnap',params:{snapId:SNAP_ID,request:{method:'walletshield_status'}}}) as {paired?:boolean;address?:string};
   if(health?.paired!==true||health.address&&health.address.toLowerCase()!==account.toLowerCase())throw Error('The Snap is not paired with the backend for this account. Reload and pair it again.');
   await action.checkIdentity(account,chainId);
   requested=true;const signature=await action.request({method:'personal_sign',params:[data,account]},true);
   if(typeof signature!=='string'||!/^0x(?:[\da-f]{128}|[\da-f]{130})$/i.test(signature))throw Error('The wallet did not return a valid signature format.');
   // This generated test signature never leaves the browser and is discarded.
   setOutcome('The wallet returned a test signature. It was not uploaded, saved or used for login or spending.');
  }catch(e){if(mounted.current&&current.current.generation===generation){if((e as {code?:number}).code===4001)setOutcome('Canceled in the wallet. A Snap report may still appear if analysis completed.');else{setOutcome('The wallet check did not complete.');setError(e instanceof Error?e.message:'Wallet request incomplete.');}}}
  finally{
   if(requested&&action.current()){try{const all=await action.wait(()=>labApi<SecurityReport[]>('/api/security/records'));const found=all.find(r=>r.capture?.channel==='paired-snap'&&r.request.kind==='signature'&&r.request.signature.from.toLowerCase()===account.toLowerCase()&&typeof r.request.signature.data==='string'&&(r.request.signature.data.toLowerCase()===data.toLowerCase()||r.request.signature.data===message));if(action.current()){if(found)setReport(found);else setError(previous=>previous||'No Snap report was found for this unique message. Connecting a wallet or receiving a signature alone does not verify Snap delivery.');}}catch{if(mounted.current&&current.current.generation===generation)setError('Could not load the report. Open Check history and refresh to verify it.');}}
   if(active.current===action){active.current=null;onBusy(false);}action.cancel();
  }
 }
 return <section className="panel network-connection"><h2>Test Snap delivery on the selected network</h2><p>Request a unique test message signature with no test funds or gas. The backend collects evidence and calls Muse only after the wallet delivers the request to the Snap. The generated signature stays in the browser; the original message and report are stored on the backend.</p><button className="button primary" disabled={busy||!configured||!account||!provider||!snapReady} onClick={run}>Test the wallet signing insight</button>{outcome&&<p role="status">{outcome}</p>}{error&&<div className="notice" role="alert">{error}</div>}{report&&<><h3>Snap report matched to this message</h3><SecurityReportView report={report}/></>}<p>This verifies message delivery only. Start transfers, approvals, Permits and swaps in the relevant dApp, then inspect WalletShield in the wallet. Each request gets its own evidence. MetaMask controls when message insights appear and may show them after you click Sign.</p></section>;
}
