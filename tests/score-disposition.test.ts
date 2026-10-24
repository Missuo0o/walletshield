import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {scoreDisposition,scoreStatusLabel} from '../src/security/score-disposition.js';
import {knownReadOnlyRpcMethod,readOnlyAssetRiskExemption} from '../src/security/read-only.js';
import {rpcSummary} from '../src/security/operations.js';
import {SecurityReportView} from '../web/src/SecurityReportView.js';
import {overallAdvisoryLabel,securityHistoryMatches} from '../web/src/reportLabels.js';
import {finitePermitOutput,finitePermitReport} from './fixtures/model.js';
import {buildApp} from '../src/server/app.js';
import {createStore} from '../src/server/store.js';
import type {SecurityConfig} from '../src/security/config.js';
import type {AIResult,AIState,SecurityRequest} from '../src/security/types.js';

const address='0x2222222222222222222222222222222222222222';
const config:SecurityConfig={apiKey:'offline-fixture-key',model:'muse-wonder-1.0',aiEnabled:true,lookups:false,goPlusToken:'',rpc:{}};
const headers={origin:'http://127.0.0.1:5173'};
const completed=(score:number|null):AIState=>({status:'completed',message:'Completed fixture',result:{...finitePermitOutput(score??42),score,assessment:score===null?'unknown':'review',model:'fixture',generatedAt:new Date().toISOString()} as AIResult});

test('score presentation separates accepted numbers, abstention, invalid output and transport failure without mutating reports',()=>{
 const report=finitePermitReport(),original=structuredClone(report);
 const cases:[AIState,number|null,string,string][]=[
  [completed(42),42,'scored','42/100 · AI'],
  [completed(null),null,'insufficient_evidence','Evidence insufficient for a score'],
  [{status:'failed',failureKind:'validation',message:'Invalid evidence citations'},null,'invalid_output','Model output rejected'],
  [{status:'failed',failureKind:'response',message:'Malformed provider JSON'},null,'invalid_output','Model output rejected'],
  [{status:'failed',failureKind:'transport',message:'No response'},null,'transport_error','Model connection failed'],
  [{status:'failed',message:'Unknown historical problem'},null,'analysis_failed','Analysis incomplete'],
  [{status:'pending',message:'Working'},null,'pending','Analyzing'],
  [{status:'disabled',message:'Budget exhausted'},null,'not_run','AI not run'],
  [{status:'not_applicable',message:'Recognized readonly query'},null,'not_applicable','Not applicable · Read-only query'],
 ];
 for(const [ai,score,kind,label] of cases){const sample={...report,ai,score,scoreSource:score===null?'none' as const:'ai' as const};assert.equal(scoreDisposition(sample).kind,kind);assert.equal(scoreStatusLabel(sample),label);}
 assert.equal(scoreDisposition({...report,score:42,scoreSource:'ai',ai:{status:'failed',failureKind:'validation',message:'Invalid'}}).kind,'invalid_output','A stale rejected score must not become a displayed accepted number');
 assert.equal(scoreStatusLabel({...report,score:42,scoreSource:'rules'}),'42/100 · Legacy rules');
 assert.deepEqual(report,original);
});

test('historical failure diagnostics receive conservative display labels without rewriting stored state',()=>{
 for(const message of ['Model output failed validation: citations.','The model response could not be parsed completely.','The model refused the analysis.'])assert.equal(scoreDisposition({ai:{status:'failed',message}}).kind,'invalid_output');
 assert.equal(scoreDisposition({ai:{status:'failed',message:'Model request timed out. No score was generated.'}}).kind,'transport_error');
 const report={...finitePermitReport(),score:null,scoreSource:'none' as const,ai:completed(null)};
 assert.equal(securityHistoryMatches(report,'Evidence insufficient'),true);
 const rendered=renderToStaticMarkup(React.createElement(SecurityReportView,{report}));
 assert.match(rendered,/AI analysis: Evidence insufficient for a score/);assert.doesNotMatch(rendered,/AI analysis: Complete</);
});

test('read-only exemptions require a recognized method, canonical parameters and the wallet_rpc envelope',()=>{
 for(const method of ['eth_accounts','eth_chainId','eth_blockNumber','wallet_getPermissions','wallet_getCapabilities'])assert.ok(readOnlyAssetRiskExemption({kind:'wallet_rpc',method,params:[]}),method);
 assert.ok(readOnlyAssetRiskExemption({kind:'wallet_rpc',method:'eth_getBalance',params:[address,'latest']}));
 assert.ok(readOnlyAssetRiskExemption({kind:'wallet_rpc',method:'eth_getCode',params:[address,'0x10']}));
 assert.ok(readOnlyAssetRiskExemption({kind:'wallet_rpc',method:'wallet_getCapabilities',params:[address]}));
 const rejects=[
  {kind:'permission',method:'eth_getBalance',params:[address,'latest']},
  {kind:'user_operation',method:'eth_chainId',params:[]},
  {kind:'wallet_rpc',method:'wallet_getDrainAssets',params:[]},
  {kind:'wallet_rpc',method:'eth_getBalanceAndTransfer',params:[address,'latest']},
  {kind:'wallet_rpc',method:'net_sendTransaction',params:[]},
  {kind:'wallet_rpc',method:'eth_getBalance',params:[address,'latest',{transfer:true}]},
  {kind:'wallet_rpc',method:'eth_getBalance',params:[address,{blockNumber:'0x10'}]},
  {kind:'wallet_rpc',method:'eth_getBalance',params:['bad','latest']},
  {kind:'wallet_rpc',method:'eth_getBalance',params:[address,`0x${'a'.repeat(65)}`]},
  {kind:'wallet_rpc',method:'eth_getBalance',params:[address,'0x00']},
  {kind:'wallet_rpc',method:'wallet_getPermissions',params:[{requestPermissions:{}}]},
  {kind:'wallet_rpc',method:'eth_chainId',params:{}},
  {kind:'wallet_rpc',method:'eth_call',params:[{to:address,data:'0x'},'latest']}
 ];
 for(const sample of rejects)assert.equal(readOnlyAssetRiskExemption(sample),null,JSON.stringify(sample));
 for(const method of ['wallet_getDrainAssets','eth_getBalanceAndTransfer','net_sendTransaction']){assert.equal(knownReadOnlyRpcMethod(method),false);assert.notEqual(rpcSummary(method,[]).category,'read_only');}
 assert.equal(rpcSummary('eth_call',[]).category,'read_only','A known read-only method can still require normal evidence analysis when not eligible for the narrow score exemption');
});

test('canonical read-only scans retain one report, spend no model attempts and do not claim privacy safety',async()=>{
 const store=createStore(':memory:');let called=0;
 const app=await buildApp(store,{security:{config:async()=>config,collect:async()=>[],score:async()=>{called++;return {status:'failed',failureKind:'transport',message:'Fixture model unavailable'};}}});
 try{
  const request:SecurityRequest={kind:'wallet_rpc',chainId:1,method:'eth_getBalance',params:[address,'latest']};
  const response=await app.inject({method:'POST',url:'/api/security/scan',headers,payload:request});
  assert.equal(response.statusCode,200);const report=response.json();
  assert.equal(report.ai.status,'not_applicable');assert.equal(report.score,null);assert.equal(report.scoreSource,'none');assert.equal(called,0);assert.equal(store.securityAiCallsToday(),0);assert.equal(store.securityList().length,1);
  assert.match(report.ai.message,/disclosure.*not assessed/);assert.equal(overallAdvisoryLabel(report),'Read-only · Privacy not assessed');
  const rendered=renderToStaticMarkup(React.createElement(SecurityReportView,{report}));assert.match(rendered,/N\/A/);assert.match(rendered,/Not applicable/);assert.doesNotMatch(rendered,/AI analysis: Evidence insufficient/);
  assert.equal(overallAdvisoryLabel({...report,level:'high'}),'High risk','An independent adverse finding must not be hidden by score inapplicability');
  const unknown=await app.inject({method:'POST',url:'/api/security/scan',headers,payload:{...request,method:'wallet_getDrainAssets',params:[]}});
  assert.equal(unknown.statusCode,200);assert.equal(unknown.json().ai.status,'failed');assert.equal(called,1);assert.equal(store.securityAiCallsToday(),1);
 }finally{await app.close();store.close();}
});

test('redacted or malformed read-only parameters cannot bypass normal model analysis',async()=>{
 const store=createStore(':memory:');let called=0;
 const app=await buildApp(store,{security:{config:async()=>config,collect:async()=>[],score:async()=>{called++;return {status:'failed',failureKind:'transport',message:'Fixture model unavailable'};}}});
 try{
  for(const params of [[address,'latest',{secret:'do-not-retain'}],[address,'bad-block'],{address,block:'latest'}]){
   const response=await app.inject({method:'POST',url:'/api/security/scan',headers,payload:{kind:'wallet_rpc',chainId:1,method:'eth_getBalance',params}});
   assert.equal(response.statusCode,200);assert.notEqual(response.json().ai.status,'not_applicable');assert.ok(!response.body.includes('do-not-retain'));
  }
  assert.equal(called,3);assert.equal(store.securityAiCallsToday(),3);
 }finally{await app.close();store.close();}
});
