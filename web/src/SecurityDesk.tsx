import {authHeaders} from './session';
import React,{useEffect,useRef,useState} from 'react';
import {RotateCcw,Search} from 'lucide-react';
import type {SecurityReport} from '../../src/security/types';
import {SecurityReportView} from './SecurityReportView';
import {historyOperationLabel,overallAdvisoryLabel,securityHistoryMatches} from './reportLabels';
import {createHistoryController,emptyHistory,type HistoryState} from './historyState';
import {scoreStatusLabel} from '../../src/security/score-disposition';
export function SecurityDesk({identityKey='local',enabled=true}:{identityKey?:string;enabled?:boolean}={}){
 const [history,setHistory]=useState<HistoryState<SecurityReport>>(()=>emptyHistory(identityKey)),[query,setQuery]=useState('');
 const current=useRef<ReturnType<typeof createHistoryController<SecurityReport>>|null>(null);
 async function load(signal:AbortSignal){const response=await fetch('/api/security/records',{headers:authHeaders(),signal,cache:'no-store'});if(!response.ok)throw Error('History unavailable');return (await response.json() as SecurityReport[]).filter(r=>r.source==='rpc');}
 function refresh(){if(enabled)void current.current?.refresh(load);}
 useEffect(()=>{const controller=createHistoryController<SecurityReport>(identityKey,setHistory);current.current=controller;setHistory(emptyHistory(identityKey));setQuery('');if(enabled)void controller.refresh(load);return()=>{controller.dispose();if(current.current===controller)current.current=null;};},[identityKey,enabled]);
 // Hide old state during the render before the new identity's effect executes.
 const {records,selected,error}=enabled&&history.identity===identityKey?history:emptyHistory<SecurityReport>(identityKey);
 const rows=records.filter(r=>securityHistoryMatches(r,query));
 return <><div className="page-heading"><div><div className="eyebrow"><span/> REQUEST EVIDENCE</div><h1>Wallet risk. <span>See the evidence.</span></h1><p>Reports distinguish paired Snap submissions from checks started on the website. The server records the source; wallet approval must be verified separately.</p></div><button className="button secondary" onClick={refresh}><RotateCcw size={15}/>Refresh reports</button></div>{error&&<div className="notice">{error}</div>}{!enabled&&<div className="notice">Verify the current wallet identity to load its private reports.</div>}
 <p className="score-note">Historical prose remains in its original language in report details. Table categories and advisories use English display labels.</p>
 <section className="panel"><div className="history-toolbar"><div className="search-field"><Search size={16}/><input aria-label="Search request reports" placeholder="Search visible dates, operations or risk status" value={query} onChange={e=>setQuery(e.target.value)}/></div></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Operation</th><th>Request source</th><th>Overall advisory</th><th>AI risk score</th><th/></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{new Date(r.createdAt).toLocaleString('en-US',{hour12:false})}</td><td>{historyOperationLabel(r)}</td><td>{r.capture?.channel==='paired-snap'?'Paired Snap':r.capture?.channel==='workbench'?'Website check':'Legacy source unspecified'}</td><td>{overallAdvisoryLabel(r)}</td><td>{scoreStatusLabel(r)}</td><td><button className="text-button" onClick={()=>current.current?.select(r.id)}>View</button></td></tr>)}</tbody></table></div>{!rows.length&&<p className="security-muted">No matching request reports. Start a wallet check and review WalletShield in MetaMask.</p>}</section>
 {selected&&<section className="panel lab-report"><div className="panel-header"><h2>Report details</h2><span className="subtle">{selected.id.slice(0,8)}</span></div><SecurityReportView report={selected}/></section>}</>;
}
