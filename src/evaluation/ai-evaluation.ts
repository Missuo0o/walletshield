import {AI_DIMENSIONS,type AIState,type SecurityReport} from '../security/types.js';
import {FACT_SCHEMA_VERSION,modelFactCandidates} from '../security/model-facts.js';
import {evidencePacket,scoreWithAI,validateAI} from '../security/ai.js';
import {META_MODEL,type SecurityConfig} from '../security/config.js';
import {EVAL_DATASET,EVAL_DATASET_HASH,EVAL_DATASET_VERSION,evalReport,type EvalCase} from './wallet-risk-dataset.js';

export type EvalRun={caseId:string;repeat:number;state:AIState;elapsedMs:number};
const boundaries='Synthetic maintained fixtures and validator checks are not an independent held-out benchmark, calibrated loss probability, complete attack coverage or proof of live Muse accuracy.';
const rate=(numerator:number,denominator:number)=>({numerator,denominator,rate:denominator?numerator/denominator:null});
export function evaluationMetrics(cases:readonly EvalCase[],runs:readonly EvalRun[]){
 const byId=new Map(cases.map(item=>[item.id,item])),accepted=runs.filter(run=>run.state.status==='completed'&&run.state.result),scored=accepted.filter(run=>run.state.result!.score!==null);
 const adverse=scored.filter(run=>byId.get(run.caseId)?.label==='adverse-fixture'),benign=scored.filter(run=>byId.get(run.caseId)?.label==='benign-fixture'),abstention=runs.filter(run=>byId.get(run.caseId)?.mustAbstain);
 const repeated=cases.map(item=>{const values=accepted.filter(run=>run.caseId===item.id),numbers=values.flatMap(run=>run.state.result!.score===null?[]:[run.state.result!.score!]);return {case_id:item.id,accepted_runs:values.length,numeric_runs:numbers.length,score_range:numbers.length?Math.max(...numbers)-Math.min(...numbers):null,assessment_variants:[...new Set(values.map(run=>run.state.result!.assessment))],abstention_variants:[...new Set(values.map(run=>run.state.result!.score===null))]};}).filter(row=>row.accepted_runs>1);
 const pairs=cases.flatMap(item=>item.pair?[{case_id:item.id,baseline:item.pair.baseline,comparisons:runs.filter(run=>run.caseId===item.id).flatMap(run=>{const base=accepted.find(candidate=>candidate.caseId===item.pair!.baseline&&candidate.repeat===run.repeat),result=run.state.status==='completed'?run.state.result:undefined;if(!base||!result||base.state.result!.score===null||result.score===null)return [];return [{repeat:run.repeat,direction_satisfied:result.score>=base.state.result!.score,score_difference:result.score-base.state.result!.score}];})}]:[]);
 const latencies=runs.map(run=>run.elapsedMs).sort((a,b)=>a-b);
 return {total_attempts:runs.length,accepted_outputs:accepted.length,scoring_coverage:rate(scored.length,runs.length),abstention_rate:rate(accepted.length-scored.length,accepted.length),adverse_false_low:rate(adverse.filter(run=>run.state.result!.assessment==='low').length,adverse.length),benign_high:rate(benign.filter(run=>run.state.result!.assessment==='high').length,benign.length),required_abstention:rate(abstention.filter(run=>run.state.status==='completed'&&run.state.result?.score===null).length,abstention.length),failures:runs.length-accepted.length,p95_ms:latencies.length?latencies[Math.ceil(latencies.length*.95)-1]:null,repeatability:repeated,counterfactual_pairs:pairs,interpretation:'Qualitative fixture labels and pair expectations are evaluation hypotheses, not runtime scoring rules. False-low and benign-high use scored outputs; required abstention uses all relevant attempts, including failures. Failed outputs are separate from abstention; no numeric risk thresholds are applied. Rates are descriptive run-level values with denominators; repeated cases are correlated and these are not independent confidence intervals or general-population accuracy.'};
}
export function abstentionFixture(report:SecurityReport){
 const first=modelFactCandidates(report).candidates[0].fact;
 return {fact_schema_version:FACT_SCHEMA_VERSION,facts:[first],score:null,assessment:'unknown',evidence_confidence:'limited',summary:'This is a synthetic validator fixture; no model assessment has been made.',dimensions:AI_DIMENSIONS.map(dimension=>({dimension,assessment:'unknown',reason:'This offline fixture does not claim a dimension assessment.',evidence_ids:[first.evidence_id],fact_ids:[]})),reasons:[{text:'The selected observation is retained with its original limited scope.',evidence_ids:[first.evidence_id],fact_ids:[first.id]}],missing_data:[],suggested_action:'Inspect the observed facts and unresolved checks.',honeypot:'unknown'};
}
export const ADVERSARIAL_MUTATIONS=['subject','chain','block','source','field','value','scope','duplicate','citation','unsupported-certainty'] as const;
export function adversarialFixture(report:SecurityReport,kind:typeof ADVERSARIAL_MUTATIONS[number]){
 const value=abstentionFixture(report),fact=value.facts[0];
 if(kind==='subject')fact.subject.value='0xffffffffffffffffffffffffffffffffffffffff';
 if(kind==='chain')fact.provenance.chain_id=fact.provenance.chain_id===1?2:1;
 if(kind==='block')fact.provenance.block_number=fact.provenance.block_number==='999'?'998':'999';
 if(kind==='source')fact.provenance.source='untrusted-forged-source';
 if(kind==='field')fact.field='data.not_an_observed_field';
 if(kind==='value')fact.value=typeof fact.value==='boolean'?!fact.value:fact.value===null?'invented':`${String(fact.value)}_invented`;
 if(kind==='scope')fact.scope=fact.scope==='isolated-fork'?'reported-observation':'isolated-fork';
 if(kind==='duplicate')value.facts.push(structuredClone(fact));
 if(kind==='citation')value.reasons[0].fact_ids=['fact_000000000000000000000000'];
 if(kind==='unsupported-certainty')value.suggested_action='The recipient is trusted and the token can always be sold.';
 return value;
}
export function evaluateOffline(){
 let baselineAccepted=0,rejected=0;const failures:{case_id:string;check:string}[]=[];
 for(const item of EVAL_DATASET){const report=evalReport(item);try{validateAI(abstentionFixture(report),report,META_MODEL,{requireStructuredFacts:true});baselineAccepted++;}catch{failures.push({case_id:item.id,check:'valid-abstention'});}
  for(const mutation of ADVERSARIAL_MUTATIONS){try{validateAI(adversarialFixture(report,mutation),report,META_MODEL,{requireStructuredFacts:true});failures.push({case_id:item.id,check:mutation});}catch{rejected++;}}
 }
 return {mode:'offline-validator-only',dataset_version:EVAL_DATASET_VERSION,dataset_sha256:EVAL_DATASET_HASH,cases:EVAL_DATASET.length,labels:Object.fromEntries(['benign-fixture','adverse-fixture','abstention-fixture'].map(label=>[label,EVAL_DATASET.filter(item=>item.label===label).length])),valid_abstention_outputs:rate(baselineAccepted,EVAL_DATASET.length),adversarial_rejections:rate(rejected,EVAL_DATASET.length*ADVERSARIAL_MUTATIONS.length),failures,model_calls:0,rpc_calls:0,model_scoring_metrics:{available:false,reason:'No model was called. False-low, scoring coverage, calibration and repeatability cannot be inferred from validator-only results.'},boundary:boundaries};
}
export const LIVE_EVAL_LIMITS={maxCalls:12,maxRepeats:3,maxPacketBytes:100000,maxOutputTokensPerCall:6000} as const;
export function liveEvalPlan(options:{confirmPaid:boolean;maxCalls:number;repeats:number;caseIds:readonly string[]}){
 if(options.confirmPaid!==true)throw Error('Live evaluation requires explicit paid-call confirmation');
 if(!Number.isInteger(options.maxCalls)||options.maxCalls<1||options.maxCalls>LIVE_EVAL_LIMITS.maxCalls||!Number.isInteger(options.repeats)||options.repeats<1||options.repeats>LIVE_EVAL_LIMITS.maxRepeats)throw Error('Live evaluation limits are invalid');
 if(!options.caseIds.length||new Set(options.caseIds).size!==options.caseIds.length)throw Error('Select distinct frozen case IDs explicitly');
 const cases=options.caseIds.map(id=>{const item=EVAL_DATASET.find(item=>item.id===id);if(!item)throw Error('Unknown evaluation case');return item;});
 if(cases.length*options.repeats>options.maxCalls)throw Error('Planned calls exceed the explicit call budget');
 for(const item of cases)if(Buffer.byteLength(JSON.stringify(evidencePacket(evalReport(item))))>LIVE_EVAL_LIMITS.maxPacketBytes)throw Error('Evaluation packet exceeds the input-byte limit');
 return {cases,repeats:options.repeats,maxCalls:options.maxCalls,plannedCalls:cases.length*options.repeats};
}
export async function evaluateLive(options:Parameters<typeof liveEvalPlan>[0],apiKey:string,fetcher:typeof fetch=fetch){
 const plan=liveEvalPlan(options);if(!apiKey.trim())throw Error('Set MODEL_API_KEY in this process environment for explicitly requested live evaluation');
 const config:SecurityConfig={apiKey:apiKey.trim(),model:META_MODEL,aiEnabled:true,lookups:false,goPlusToken:'',rpc:{}};
 const runs:EvalRun[]=[];let requests=0;
 const boundedFetcher:typeof fetch=async(url,init)=>{if(++requests>plan.maxCalls)throw Error('Evaluation call budget exhausted');return fetcher(url,init);};
 for(let repeat=0;repeat<plan.repeats;repeat++)for(const item of plan.cases){const start=performance.now(),state=await scoreWithAI(evalReport(item),config,boundedFetcher);runs.push({caseId:item.id,repeat,state,elapsedMs:performance.now()-start});}
 return {mode:'explicit-live-synthetic',dataset_version:EVAL_DATASET_VERSION,dataset_sha256:EVAL_DATASET_HASH,model:META_MODEL,model_calls:requests,rpc_calls:0,max_output_tokens_per_call:LIVE_EVAL_LIMITS.maxOutputTokensPerCall,input_byte_limit:LIVE_EVAL_LIMITS.maxPacketBytes,metrics:evaluationMetrics(plan.cases,runs),usage:runs.reduce((total,run)=>({input_tokens:total.input_tokens+(run.state.result?.usage?.input_tokens??0),output_tokens:total.output_tokens+(run.state.result?.usage?.output_tokens??0)}),{input_tokens:0,output_tokens:0}),usage_boundary:'Usage is reported only for accepted completed responses; provider billing may include failed requests. Call/token limits are not a guaranteed currency spending ceiling. No output repair is enabled in this evaluator.',runs:runs.map(run=>({case_id:run.caseId,repeat:run.repeat,status:run.state.status,result:run.state.result?{score:run.state.result.score,assessment:run.state.result.assessment,evidence_confidence:run.state.result.evidence_confidence}:null})),boundary:boundaries};
}
