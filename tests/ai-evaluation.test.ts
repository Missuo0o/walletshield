import test from 'node:test';
import assert from 'node:assert/strict';
import {EVAL_DATASET,EVAL_DATASET_HASH,evalReport} from '../src/evaluation/wallet-risk-dataset.js';
import {ADVERSARIAL_MUTATIONS,abstentionFixture,evaluateLive,evaluateOffline,evaluationMetrics,liveEvalPlan,type EvalRun} from '../src/evaluation/ai-evaluation.js';
import {validateAI} from '../src/security/ai.js';
import {requestSchema} from '../src/security/types.js';

test('the frozen synthetic dataset spans benign, adverse, counterfactual, injection and honest-abstention fixtures',()=>{
 assert.equal(EVAL_DATASET.length,12);assert.equal(EVAL_DATASET_HASH,'ec51ab2ae98946db2bbd503a95dea0d8112edcf1afbe5f7cfc037524d81a3f31','Changing a maintained case requires an intentional dataset revision/review');assert.ok(Object.isFrozen(EVAL_DATASET));assert.ok(EVAL_DATASET.some(item=>item.family==='prompt-injection'));assert.equal(EVAL_DATASET.filter(item=>item.mustAbstain).length,2);
 for(const item of EVAL_DATASET){assert.ok(requestSchema.safeParse(item.request).success,item.id);const report=evalReport(item);assert.equal(report.createdAt,'2026-10-22T00:00:00.000Z');assert.ok(report.checks.every(check=>check.observedAt===report.createdAt));}
 const baseline=EVAL_DATASET.find(item=>item.id==='finite-approval')!,injection=EVAL_DATASET.find(item=>item.id==='token-injection')!;assert.deepEqual(baseline.request,injection.request);assert.equal(baseline.observations.length,injection.observations.length);
});

test('default offline evaluation measures validator regressions and explicitly reports no model accuracy',()=>{
 const result=evaluateOffline();assert.equal(result.model_calls,0);assert.equal(result.rpc_calls,0);assert.equal(result.valid_abstention_outputs.numerator,12);assert.equal(result.adversarial_rejections.numerator,12*ADVERSARIAL_MUTATIONS.length);assert.deepEqual(result.failures,[]);assert.equal(result.model_scoring_metrics.available,false);assert.match(result.boundary,/not an independent held-out benchmark/);
});

test('live evaluation requires explicit bounded paid opt-in and distinct synthetic case selection before fetch',async()=>{
 let called=0;const fetcher:typeof fetch=async()=>{called++;throw Error('No live request expected');};
 for(const options of [
  {confirmPaid:false,maxCalls:1,repeats:1,caseIds:['native-clear']},
  {confirmPaid:true,maxCalls:13,repeats:1,caseIds:['native-clear']},
  {confirmPaid:true,maxCalls:1,repeats:2,caseIds:['native-clear']},
  {confirmPaid:true,maxCalls:1,repeats:1,caseIds:['unknown']},
  {confirmPaid:true,maxCalls:2,repeats:1,caseIds:['native-clear','native-clear']}
 ])await assert.rejects(()=>evaluateLive(options,'synthetic',fetcher));
 await assert.rejects(()=>evaluateLive({confirmPaid:true,maxCalls:1,repeats:1,caseIds:['native-clear']},'',fetcher));assert.equal(called,0);
 assert.equal(liveEvalPlan({confirmPaid:true,maxCalls:2,repeats:2,caseIds:['native-clear']}).plannedCalls,2);
});

test('opted-in evaluator can run against an injected offline model without RPC or output repairs',async()=>{
 let calls=0;const item=EVAL_DATASET.find(item=>item.id==='opaque-selector')!;
 const result=await evaluateLive({confirmPaid:true,maxCalls:2,repeats:2,caseIds:[item.id]},'synthetic-test-key',async(url,init)=>{
  calls++;assert.equal(url,'https://api.meta.ai/v1/responses');const request=JSON.parse(String(init?.body));assert.equal(request.max_output_tokens,6000);
  const value=abstentionFixture(evalReport(item));return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]}));
 });
 assert.equal(calls,2);assert.equal(result.rpc_calls,0);assert.equal(result.metrics.required_abstention.rate,1);assert.equal(result.metrics.repeatability[0].score_range,null);assert.match(result.usage_boundary,/not a guaranteed currency spending ceiling/);
});

test('evaluation separates failed outputs, abstention, false-low and repeatability without numerical risk bands',()=>{
 const adverse=EVAL_DATASET.find(item=>item.id==='unlimited-approval')!,unknown=EVAL_DATASET.find(item=>item.mustAbstain)!,report=evalReport(adverse);
 const base=validateAI(abstentionFixture(report),report,'synthetic',{requireStructuredFacts:true});
 const runs:EvalRun[]=[
  {caseId:adverse.id,repeat:0,elapsedMs:1,state:{status:'completed',message:'Fabricated metric fixture, not a model',result:{...base,score:1,assessment:'low'}}},
  {caseId:adverse.id,repeat:1,elapsedMs:2,state:{status:'completed',message:'Fabricated metric fixture, not a model',result:{...base,score:99,assessment:'review'}}},
  {caseId:unknown.id,repeat:0,elapsedMs:3,state:{status:'completed',message:'Fixture',result:base}},
  {caseId:unknown.id,repeat:1,elapsedMs:4,state:{status:'failed',message:'Fixture failure'}}
 ];
 const result=evaluationMetrics([adverse,unknown],runs);assert.equal(result.adverse_false_low.rate,.5);assert.equal(result.failures,1);assert.equal(result.abstention_rate.rate,1/3);assert.equal(result.required_abstention.denominator,2);assert.equal(result.required_abstention.rate,.5);assert.equal(result.repeatability[0].score_range,98);assert.equal(result.p95_ms,4);
});
