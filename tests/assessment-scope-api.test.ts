import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildApp} from '../src/server/app.js';
import {createStore} from '../src/server/store.js';
import {evidence} from '../src/security/evidence.js';
import {validateAI} from '../src/security/ai.js';
import {SecurityReportView} from '../web/src/SecurityReportView.js';
import {modelDimensions} from './fixtures/model.js';
import type {SecurityReport,SecurityRequest} from '../src/security/types.js';

test('API persists a scoped Muse assessment without erasing full gaps or duplicating the request; UI shows the boundary',async()=>{
 const store=createStore(':memory:');
 const request:SecurityRequest={kind:'transaction',chainId:31337,transaction:{from:'0x'+'1'.repeat(40),to:'0x'+'2'.repeat(40),data:'0x',value:'0x1',gas:'0x5208',gasPrice:'0x1'}};
 const app=await buildApp(store,{security:{config:async()=>({apiKey:'offline-fixture',model:'muse-wonder-1.0',aiEnabled:true,lookups:false,goPlusToken:'',rpc:{}}),collect:async()=>[evidence('chain_context','pass','Synthetic balance observed','An offline fixture, not a live network observation.','rpc',{nativeBalanceWei:'1000000000000000000',targetHasCode:false})],score:async(report)=>({status:'completed',message:'Offline model-output fixture',result:validateAI({...modelDimensions('operation'),score:13,assessment:'low',evidence_confidence:'strong',summary:'The observable request is assessed within the supplied evidence.',reasons:[{text:'A native transfer is decoded.',evidence_ids:['operation']}],missing_data:[],suggested_action:'Verify the recipient and purpose independently.',honeypot:'unknown'},report,'muse-wonder-1.0')})}});
 try{
  const response=await app.inject({method:'POST',url:'/api/security/scan',headers:{origin:'http://127.0.0.1:5173'},payload:request});
  assert.equal(response.statusCode,200);
  const report=response.json() as SecurityReport;
  assert.equal(report.score,13);assert.equal(report.scoreSource,'ai');assert.equal(report.level,'low');
  assert.equal(report.complete,false);assert.deepEqual(report.missingData,['Off-chain purpose is unverified']);
  assert.equal(report.title,'No clear risk observed within request scope');
  assert.deepEqual(report.assessmentScope?.criticalMissingData,[]);
  assert.deepEqual(report.assessmentScope?.contextualUnknownCheckIds,['fraud_context']);
  assert.equal(store.securityList().length,1);assert.deepEqual(store.securityGet(report.id)?.assessmentScope,report.assessmentScope);
  const html=renderToStaticMarkup(createElement(SecurityReportView,{report}));
  assert.match(html,/Assessment scope: Observable request evidence/);
  assert.match(html,/not a guarantee of identity, future execution or safety/);
  assert.match(html,/Off-chain purpose is unverified/);
 }finally{await app.close();store.close();}
});
