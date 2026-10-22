import {authHeaders} from './session';
import React,{useEffect,useState} from 'react';
import {RotateCcw,Search} from 'lucide-react';
import type {SecurityReport} from '../../src/security/types';
import {SecurityReportView} from './SecurityReportView';
import {historyOperationLabel,overallAdvisoryLabel,securityHistoryMatches} from './reportLabels';
export function SecurityDesk(){
 const [records,setRecords]=useState<SecurityReport[]>([]),[selected,setSelected]=useState<SecurityReport|null>(null),[query,setQuery]=useState(''),[error,setError]=useState('');
 async function refresh(){try{const response=await fetch('/api/security/records',{headers:authHeaders()});if(!response.ok)throw Error();const all=await response.json() as SecurityReport[];setRecords(all.filter(r=>r.source==='rpc'));setSelected(s=>s?all.find(r=>r.id===s.id)??s:null);setError('');}catch{setError('Could not load reports. Check that the backend service is online.');}}
 useEffect(()=>{void refresh();},[]);
 const rows=records.filter(r=>securityHistoryMatches(r,query));
 return <><div className="page-heading"><div><div className="eyebrow"><span/> REQUEST EVIDENCE</div><h1>Wallet risk. <span>See the evidence.</span></h1><p>Reports distinguish paired Snap submissions from checks started on the website. The server records the source; wallet approval must be verified separately.</p></div><button className="button secondary" onClick={refresh}><RotateCcw size={15}/>Refresh reports</button></div>{error&&<div className="notice">{error}</div>}
 <p className="score-note">Historical prose remains in its original language in report details. Table categories and advisories use English display labels.</p>
 <section className="panel"><div className="history-toolbar"><div className="search-field"><Search size={16}/><input aria-label="Search request reports" placeholder="Search visible dates, operations or risk status" value={query} onChange={e=>setQuery(e.target.value)}/></div></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Operation</th><th>Request source</th><th>Overall advisory</th><th>AI risk score</th><th/></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{new Date(r.createdAt).toLocaleString('en-US',{hour12:false})}</td><td>{historyOperationLabel(r)}</td><td>{r.capture?.channel==='paired-snap'?'Paired Snap':r.capture?.channel==='workbench'?'Website check':'Legacy source unspecified'}</td><td>{overallAdvisoryLabel(r)}</td><td>{r.score===null?'No AI score':`${r.score}/100 · ${r.scoreSource==='rules'?'Legacy rules':'AI'}`}</td><td><button className="text-button" onClick={()=>setSelected(r)}>View</button></td></tr>)}</tbody></table></div>{!rows.length&&<p className="security-muted">No matching request reports. Start a wallet check and review WalletShield in MetaMask.</p>}</section>
 {selected&&<section className="panel lab-report"><div className="panel-header"><h2>Report details</h2><span className="subtle">{selected.id.slice(0,8)}</span></div><SecurityReportView report={selected}/></section>}</>;
}
