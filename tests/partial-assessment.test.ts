import test from 'node:test';
import assert from 'node:assert/strict';
import {partialAssessmentLabel} from '../src/security/score-disposition.js';
import {overallAdvisoryLabel} from '../web/src/reportLabels.js';
import {assess} from '../src/security/rules.js';
import {evidence} from '../src/security/evidence.js';
import {finitePermitReport,finitePermitOutput} from './fixtures/model.js';
import {validateAI} from '../src/security/ai.js';
import {buildApp} from '../src/server/app.js';
import {createStore} from '../src/server/store.js';
import {onTransaction,onSignature} from '../snap/src/index.js';
import type {SecurityReport,SecurityRequest} from '../src/security/types.js';

const label='Review required · Partial assessment';
function partial():SecurityReport {
 const report=finitePermitReport();
 report.score=18;report.scoreSource='ai';report.level='unknown';report.complete=false;
 report.ai={status:'completed',message:'Completed fixture',result:validateAI(finitePermitOutput(18),report,'muse-wonder-1.0')};
 return report;
}

test('partial presentation preserves category-specific evidence and never changes the number or stored report',()=>{
 for(const category of ['token_transfer','approval','staking','permit_signature','swap','unknown']){
  const report=partial();report.operation.category=category;
  const before=structuredClone(report);
  assert.equal(partialAssessmentLabel(report),label,category);
  assert.equal(overallAdvisoryLabel(report),label,category);
  assert.deepEqual(report,before);
 }
});

test('high risk, abstention, failure and legacy numbers cannot become a successful partial assessment',()=>{
 const base=partial();
 const cases:SecurityReport[]=[
  {...base,level:'high'}, {...base,score:null}, {...base,scoreSource:'rules'}, {...base,scoreSource:'none'},
  {...base,score:101}, {...base,ai:{status:'failed',message:'Transport failed'}},
  {...base,ai:{status:'pending',message:'Pending'}},
  {...base,ai:{...base.ai,result:{...base.ai.result!,assessment:'unknown'}}},
  {...base,ai:{...base.ai,result:{...base.ai.result!,assessment:'high'}}},
 ];
 for(const report of cases)assert.equal(partialAssessmentLabel(report),undefined);
 assert.equal(overallAdvisoryLabel({...base,level:'high'}),'High risk');
 assert.equal(overallAdvisoryLabel({...base,score:null}),'Unable to assess');
});

test('API stores a partial title while retaining unknown checks and incomplete level',async()=>{
 const store=createStore(':memory:');
 const request:SecurityRequest={kind:'transaction',chainId:31337,transaction:{from:'0x'+'1'.repeat(40),to:'0x'+'2'.repeat(40),data:'0x',value:'0x1',gas:'0x5208',gasPrice:'0x1'}};
 const app=await buildApp(store,{security:{config:async()=>({apiKey:'offline',model:'muse-wonder-1.0',aiEnabled:true,lookups:false,goPlusToken:'',rpc:{}}),collect:async()=>[evidence('external_scope','unknown','Local intelligence unavailable','Fixture missing evidence.','coverage')],score:async()=>partial().ai}});
 try{
  const response=await app.inject({method:'POST',url:'/api/security/scan',headers:{origin:'http://127.0.0.1:5173'},payload:request});
  assert.equal(response.statusCode,200);const report=response.json() as SecurityReport;
  assert.equal(report.title,label);assert.equal(report.level,'unknown');assert.equal(report.complete,false);assert.equal(report.score,18);
  assert.ok(report.assessmentScope?.criticalMissingData.includes('Local intelligence unavailable'));
  assert.ok(report.checks.some(c=>c.id==='external_scope'&&c.status==='unknown'));
  assert.equal(store.securityGet(report.id)?.title,label);
 }finally{await app.close();store.close();}
});

test('both Snap hooks show partial assessment without suppressing wallet severity or missing checks',async()=>{
 const oldFetch=globalThis.fetch,oldSnap=(globalThis as any).snap;
 (globalThis as any).snap={request:async()=>({backendToken:'a'.repeat(64)})};
 globalThis.fetch=async(_url,init)=>{
  const request=JSON.parse(String(init?.body)) as SecurityRequest;
  const report={...assess(request,[evidence('gap','unknown','Exit conditions unverified','A retained gap.','coverage')]),score:28,scoreSource:'ai',ai:partial().ai,level:'unknown',title:'Unable to assess',source:'rpc'};
  return new Response(JSON.stringify(report));
 };
 try{
  const from='0x'+'1'.repeat(40);
  const tx=await onTransaction({transaction:{from,to:'0x'+'2'.repeat(40),data:'0x',value:'0x1'},chainId:'eip155:31337'} as any);
  const sig=await onSignature({signature:{from,signatureMethod:'personal_sign',data:'hello'}});
  for(const result of [tx,sig]){
   assert.equal(result?.severity,'critical');
   const text=JSON.stringify(result);assert.ok(text.includes(label));assert.ok(text.includes('Exit conditions unverified'));assert.ok(text.includes('28/100'));
  }
 }finally{globalThis.fetch=oldFetch;(globalThis as any).snap=oldSnap;}
});
