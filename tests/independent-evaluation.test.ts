import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {evaluationDigest,evaluateIndependentLabels,type IndependentLabels,type IndependentPredictions} from '../src/evaluation/independent-evaluation.js';

const frozen='2026-10-20T00:00:00.000Z',generated='2026-10-21T00:00:00.000Z',hash=(value:string)=>evaluationDigest({value});
function fixture(){
 const labels:IndependentLabels={schemaVersion:'walletshield-external-labels-v1',datasetId:'synthetic-test-only',frozenAt:frozen,task:'expert-adverse-risk',labelPolicyReference:'Synthetic test policy, not an external label source.',samplingDescription:'Hand-built synthetic metric fixtures.',provenance:'synthetic-workflow-example',cases:[]};
 for(const [id,label]of [['a','adverse'],['b','benign'],['c','adverse'],['d','benign'],['e','indeterminate'],['f','adverse'],['g','benign']]as const)labels.cases.push({id,groupId:id,evidenceSha256:hash(id),split:'holdout',label,labelBasis:'expert-review',rationale:'Synthetic test label; no live accuracy claim.',sourceReference:'tests/independent-evaluation.test.ts',reviewers:[{id:'synthetic-test-reviewer',kind:'human-expert',reviewedAt:frozen}],independentOfEvaluatedModel:true,usedForPromptTuning:false});
 const predictions:IndependentPredictions={schemaVersion:'walletshield-external-predictions-v1',labelsSha256:evaluationDigest(labels),model:'synthetic',modelVersion:'test-v1',promptSha256:hash('prompt'),collectorVersion:'test-v1',generatedAt:generated,results:[
  {caseId:'a',evidenceSha256:hash('a'),generatedAt:generated,status:'scored',score:90,assessment:'high'},
  {caseId:'b',evidenceSha256:hash('b'),generatedAt:generated,status:'scored',score:10,assessment:'low'},
  {caseId:'c',evidenceSha256:hash('c'),generatedAt:generated,status:'scored',score:50,assessment:'review'},
  {caseId:'d',evidenceSha256:hash('d'),generatedAt:generated,status:'failed',reason:'Synthetic provider timeout'},
  {caseId:'e',evidenceSha256:hash('e'),generatedAt:generated,status:'abstained',reason:'Synthetic unknown semantic context'},
  {caseId:'f',evidenceSha256:hash('f'),generatedAt:generated,status:'not-applicable',reason:'Synthetic mistaken not-applicable output'}
 ]};return {labels,predictions};
}
const refresh=(labels:IndependentLabels,predictions:IndependentPredictions)=>{predictions.labelsSha256=evaluationDigest(labels);};

test('external-label evaluation separates unavailable outputs, numeric review and selective accuracy',()=>{
 const {labels,predictions}=fixture(),report=evaluateIndependentLabels(labels,predictions),metrics=report.holdout;
 assert.equal(report.model_calls,0);assert.equal(report.rpc_calls,0);assert.equal(report.independence_status,'synthetic-workflow-only');
 assert.deepEqual(metrics.outputs,{scored:3,abstained:1,failed:1,not_applicable:1,missing:1});
 assert.equal(metrics.numeric_coverage.value,3/7);assert.equal(metrics.binary_decision_coverage.value,2/6);
 assert.equal(metrics.classification.selective_accuracy.value,1);assert.equal(metrics.classification.adverse_correctly_flagged_all_cases.value,1/3);
 assert.equal(metrics.classification.deferred_numeric_review,1);assert.equal(metrics.ranking.auroc,1);
 assert.equal(report.calibration.available,false);assert.match(report.calibration.reason,/not a predicted loss/);
});

test('ranking awards ties half credit and reports no AUROC for a one-class subset',()=>{
 const {labels,predictions}=fixture();predictions.results=predictions.results.slice(0,2);for(const result of predictions.results)if(result.status==='scored')result.score=50;
 assert.equal(evaluateIndependentLabels(labels,predictions).holdout.ranking.auroc,.5);
 predictions.results=predictions.results.slice(0,1);assert.equal(evaluateIndependentLabels(labels,predictions).holdout.ranking.auroc,null);
});

test('classification retains false positives and false negatives rather than treating score acceptance as accuracy',()=>{
 const {labels,predictions}=fixture();predictions.results=predictions.results.slice(0,2);
 const a=predictions.results[0],b=predictions.results[1];assert.equal(a.status,'scored');assert.equal(b.status,'scored');
 if(a.status==='scored'&&b.status==='scored'){a.assessment='low';a.score=10;b.assessment='high';b.score=90;}
 const report=evaluateIndependentLabels(labels,predictions);assert.equal(report.holdout.classification.false_positive,1);assert.equal(report.holdout.classification.false_negative,1);assert.equal(report.holdout.classification.selective_accuracy.value,0);assert.equal(report.holdout.ranking.auroc,0);
});

test('an empty prediction run reports missing coverage and no accuracy; external review remains a declaration',()=>{
 const {labels,predictions}=fixture();labels.provenance='externally-reviewed';predictions.results=[];refresh(labels,predictions);
 const report=evaluateIndependentLabels(labels,predictions);assert.equal(report.holdout.outputs.missing,7);assert.equal(report.holdout.numeric_coverage.value,0);assert.equal(report.holdout.classification.selective_accuracy.value,null);assert.equal(report.independence_status,'external-reviewer-and-holdout-declarations-not-independently-attested');
});

test('label freeze includes review provenance, policy and all label fields',()=>{
 const {labels,predictions}=fixture();labels.cases[0].rationale+=' changed';assert.throws(()=>evaluateIndependentLabels(labels,predictions),/hash mismatch/);
 const ordered={b:1,a:{z:2,y:3}},reordered={a:{y:3,z:2},b:1};assert.equal(evaluationDigest(ordered),evaluationDigest(reordered));
});

test('evaluation rejects post-freeze labels, leakage, tuned holdout and altered evidence',()=>{
 const invalid:((labels:IndependentLabels,predictions:IndependentPredictions)=>void)[]=[
  labels=>{labels.cases[0].reviewers[0].reviewedAt=generated;},
  labels=>{labels.cases[0].usedForPromptTuning=true;},
  labels=>{labels.cases[0].groupId=labels.cases[1].groupId;labels.cases[0].split='development';},
  labels=>{labels.cases[0].evidenceSha256=labels.cases[1].evidenceSha256;labels.cases[0].split='development';},
  labels=>{labels.cases[1].id=labels.cases[0].id;},
  (_labels,predictions)=>{predictions.results[0].evidenceSha256=hash('other');},
  (_labels,predictions)=>{predictions.results[0].generatedAt='2026-10-19T00:00:00.000Z';},
  (_labels,predictions)=>{predictions.results[0].generatedAt='2026-10-22T00:00:00.000Z';},
  (_labels,predictions)=>{predictions.generatedAt='2026-10-19T00:00:00.000Z';},
  (_labels,predictions)=>{predictions.results[0].caseId='absent';},
  (_labels,predictions)=>{predictions.results.push({...predictions.results[0]});}
 ];
 for(const mutate of invalid){const {labels,predictions}=fixture();mutate(labels,predictions);refresh(labels,predictions);assert.throws(()=>evaluateIndependentLabels(labels,predictions));}
});

test('strict external schema forbids invented calibrated probability fields and model-generated reviewers',()=>{
 const {labels,predictions}=fixture();assert.throws(()=>evaluateIndependentLabels({...labels,calibratedProbability:true},predictions));
 labels.cases[0].reviewers[0].kind='model' as never;assert.throws(()=>evaluateIndependentLabels(labels,predictions));
});

test('development and holdout remain separate; repeated related cases do not inflate independent group count',()=>{
 const {labels,predictions}=fixture();labels.cases[1].groupId=labels.cases[0].groupId;labels.cases[2].split='development';labels.cases[2].usedForPromptTuning=true;refresh(labels,predictions);
 const report=evaluateIndependentLabels(labels,predictions);assert.equal(report.holdout.cases,6);assert.equal(report.holdout.declared_groups,5);assert.equal(report.development.cases,1);
});

test('CLI reads only supplied JSON, leaves inputs untouched and prints a reproducible manifest hash',()=>{
 const dir=mkdtempSync(join(tmpdir(),'walletshield-external-eval-'));try{
  const {labels,predictions}=fixture(),labelsPath=join(dir,'labels.json'),predictionsPath=join(dir,'predictions.json');writeFileSync(labelsPath,JSON.stringify(labels));writeFileSync(predictionsPath,JSON.stringify(predictions));
  const before=readFileSync(labelsPath,'utf8'),run=(...args:string[])=>execFileSync(process.execPath,['--import','tsx','scripts/evaluate-independent.ts',...args],{cwd:process.cwd(),encoding:'utf8',env:{PATH:process.env.PATH,MODEL_API_KEY:'never-used',ENABLE_AI:'1'}});
  assert.equal(run(`--labels=${labelsPath}`,'--hash-only').trim(),evaluationDigest(labels));
  const result=JSON.parse(run(`--labels=${labelsPath}`,`--predictions=${predictionsPath}`));assert.equal(result.model_calls,0);assert.equal(result.holdout.outputs.failed,1);assert.equal(readFileSync(labelsPath,'utf8'),before);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
