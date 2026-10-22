import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createWalletClient,http} from 'viem';
import {foundry} from 'viem/chains';
import {labClient,verifiedLab,labArtifacts,prepareLab} from '../src/testing/contracts.js';
import {prepareLocalFunds} from '../src/server/funding.js';
import {buildWalletCase} from '../src/testing/cases.js';
import type {SecurityReport} from '../src/security/types.js';
const url='http://127.0.0.1:5173';
const selected=process.argv.slice(2).length?process.argv.slice(2):['approve-unlimited','swap-blocked','permit'];
if(selected.some(id=>!['approve-unlimited','swap-blocked','permit','permit2'].includes(id)))throw Error('Unknown audit case');
const status=await (await fetch(`${url}/api/lab/status`)).json();
if(!status.aiConfigured)throw Error('Muse is not configured; no API call made.');
if(status.aiDailyLimit-status.aiCallsToday<selected.length)throw Error('Not enough local daily budget for the selected checks.');
const account=(await createWalletClient({chain:foundry,transport:http('http://127.0.0.1:8545')}).getAddresses())[4];
const snapshot=await labClient.request({method:'evm_snapshot' as never,params:[] as never});
const results:any[]=[];
try{
 const d=await verifiedLab(),artifacts=await labArtifacts();await prepareLocalFunds(account);await prepareLab(account);
 for(const id of selected){
  const request=await buildWalletCase(id,account,d,artifacts);
  const start=Date.now();const response=await fetch(`${url}/api/security/scan`,{method:'POST',headers:{'Content-Type':'application/json',origin:url},body:JSON.stringify(request),signal:AbortSignal.timeout(85000)});assert.equal(response.status,200);
  const report=await response.json() as SecurityReport;
  const accepted=report.ai.status==='completed'&&report.ai.result?.dimensions?.length===6&&(report.ai.result.score===report.score);
  results.push({case:id,reportId:report.id,accepted,elapsedMs:Date.now()-start,status:report.ai.status,message:report.ai.message,score:report.score,scoreSource:report.scoreSource,model:report.ai.result?.model,dimensions:report.ai.result?.dimensions,confidence:report.ai.result?.evidence_confidence,honeypot:report.ai.result?.honeypot,reasons:report.ai.result?.reasons,missingData:report.ai.result?.missing_data});
  console.log(JSON.stringify({case:id,accepted,status:report.ai.status,score:report.score,elapsedMs:Date.now()-start,message:report.ai.message}));
 }
}finally{assert.equal(await labClient.request({method:'evm_revert' as never,params:[snapshot] as never}),true);await writeFile(selected.length===3?'docs/ai-evidence-audit-acceptance.json':'docs/ai-evidence-audit-followup.json',JSON.stringify({generatedAt:new Date().toISOString(),scope:'fixed-local-requests-real-Muse-API-not-MetaMask-Snap-UI-not-accuracy-benchmark',accepted:results.filter(r=>r.accepted).length,total:results.length,results},null,2)+'\n');console.log('Local chain snapshot restored; API quota usage is retained.');}
if(results.length!==selected.length||results.some(r=>!r.accepted))process.exitCode=1;
