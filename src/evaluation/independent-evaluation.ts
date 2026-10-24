import {createHash} from 'node:crypto';
import {z} from 'zod';

const digest=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().min(1).max(200),text=z.string().trim().min(1).max(4000);
const instant=z.iso.datetime({offset:true});
const labelCase=z.strictObject({
 id,groupId:id,evidenceSha256:digest,split:z.enum(['development','holdout']),label:z.enum(['benign','adverse','indeterminate']),
 labelBasis:z.enum(['expert-review','verified-incident']),rationale:text,sourceReference:text,
 reviewers:z.array(z.strictObject({id,kind:z.enum(['human-expert','external-audit']),reviewedAt:instant})).min(1).max(20),
 independentOfEvaluatedModel:z.literal(true),usedForPromptTuning:z.boolean()
});
export const independentLabelsSchema=z.strictObject({
 schemaVersion:z.literal('walletshield-external-labels-v1'),datasetId:id,frozenAt:instant,
 task:z.literal('expert-adverse-risk'),labelPolicyReference:text,samplingDescription:text,
 provenance:z.enum(['externally-reviewed','synthetic-workflow-example']),cases:z.array(labelCase).min(1).max(100000)
});
const resultBase={caseId:id,evidenceSha256:digest,generatedAt:instant};
export const independentPredictionsSchema=z.strictObject({
 schemaVersion:z.literal('walletshield-external-predictions-v1'),labelsSha256:digest,model:id,modelVersion:id,
 promptSha256:digest,collectorVersion:id,generatedAt:instant,
 results:z.array(z.discriminatedUnion('status',[
  z.strictObject({...resultBase,status:z.literal('scored'),score:z.number().int().min(0).max(100),assessment:z.enum(['low','review','high'])}),
  z.strictObject({...resultBase,status:z.literal('abstained'),reason:text}),
  z.strictObject({...resultBase,status:z.literal('failed'),reason:text}),
  z.strictObject({...resultBase,status:z.literal('not-applicable'),reason:text})
 ])).max(100000)
});
export type IndependentLabels=z.infer<typeof independentLabelsSchema>;
export type IndependentPredictions=z.infer<typeof independentPredictionsSchema>;
type Case=IndependentLabels['cases'][number];
type Prediction=IndependentPredictions['results'][number];
type Scored=Extract<Prediction,{status:'scored'}>;
const rate=(numerator:number,denominator:number)=>({numerator,denominator,value:denominator?numerator/denominator:null});

// Hash the entire parsed manifest, including labels, review provenance and split.
export function evaluationDigest(value:unknown):string{
 const canonical=(item:unknown):string=>{if(item===null||typeof item!=='object')return JSON.stringify(item);if(Array.isArray(item))return `[${item.map(canonical).join(',')}]`;return `{${Object.entries(item as Record<string,unknown>).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>`${JSON.stringify(key)}:${canonical(v)}`).join(',')}}`;};
 return createHash('sha256').update(canonical(value)).digest('hex');
}

function ranking(rows:{label:Case['label'];prediction:Scored}[]){
 const sorted=rows.filter(row=>row.label!=='indeterminate').sort((a,b)=>a.prediction.score-b.prediction.score);
 const positives=sorted.filter(row=>row.label==='adverse').length,negatives=sorted.length-positives;
 let positiveRanks=0;
 for(let start=0;start<sorted.length;){let end=start+1;while(end<sorted.length&&sorted[end].prediction.score===sorted[start].prediction.score)end++;const averageRank=(start+1+end)/2;positiveRanks+=sorted.slice(start,end).filter(row=>row.label==='adverse').length*averageRank;start=end;}
 return {adverse_scored:positives,benign_scored:negatives,auroc:positives&&negatives?(positiveRanks-positives*(positives+1)/2)/(positives*negatives):null,scope:'Numeric outputs with binary expert labels only. Tied scores receive half credit. Abstentions, failures, missing outputs and indeterminate labels are excluded; see coverage denominators.'};
}

function splitMetrics(cases:Case[],predictions:Map<string,Prediction>){
 const rows=cases.map(item=>({label:item.label,prediction:predictions.get(item.id)}));
 const count=(status:Prediction['status'])=>rows.filter(row=>row.prediction?.status===status).length;
 const binary=rows.filter(row=>row.label!=='indeterminate'),scored=binary.filter((row):row is {label:'benign'|'adverse';prediction:Scored}=>row.prediction?.status==='scored');
 const decided=scored.filter(row=>row.prediction.assessment!=='review');
 const tp=decided.filter(row=>row.label==='adverse'&&row.prediction.assessment==='high').length,tn=decided.filter(row=>row.label==='benign'&&row.prediction.assessment==='low').length;
 const fp=decided.filter(row=>row.label==='benign'&&row.prediction.assessment==='high').length,fn=decided.filter(row=>row.label==='adverse'&&row.prediction.assessment==='low').length;
 const adverse=binary.filter(row=>row.label==='adverse').length,benign=binary.length-adverse;
 return {
  cases:cases.length,declared_groups:new Set(cases.map(item=>item.groupId)).size,labels:{benign,adverse,indeterminate:cases.length-binary.length},
  label_basis:{expert_review:cases.filter(item=>item.labelBasis==='expert-review').length,verified_incident:cases.filter(item=>item.labelBasis==='verified-incident').length},
  outputs:{scored:count('scored'),abstained:count('abstained'),failed:count('failed'),not_applicable:count('not-applicable'),missing:rows.filter(row=>!row.prediction).length},
  numeric_coverage:rate(count('scored'),cases.length),binary_numeric_coverage:rate(scored.length,binary.length),binary_decision_coverage:rate(decided.length,binary.length),
  classification:{policy:'Use the model assessment: high = adverse, low = benign, review = deferred. No numeric risk threshold or production scoring rule is introduced.',true_positive:tp,true_negative:tn,false_positive:fp,false_negative:fn,deferred_numeric_review:scored.length-decided.length,
   selective_accuracy:rate(tp+tn,decided.length),selective_precision:rate(tp,tp+fp),selective_adverse_recall:rate(tp,tp+fn),selective_false_positive_rate:rate(fp,fp+tn),
   adverse_correctly_flagged_all_cases:rate(tp,adverse),adverse_false_low_all_cases:rate(fn,adverse),benign_false_high_all_cases:rate(fp,benign),
   interpretation:'Selective metrics omit deferred or unavailable predictions. All-case rates retain those cases in their denominators; unavailable predictions are not counted as correct or as false-low. Inspect both coverage and errors.'},
  ranking:ranking(scored),
  indeterminate_labels:{cases:rows.filter(row=>row.label==='indeterminate').length,abstained:rows.filter(row=>row.label==='indeterminate'&&row.prediction?.status==='abstained').length,numeric:rows.filter(row=>row.label==='indeterminate'&&row.prediction?.status==='scored').length}
 };
}

export function evaluateIndependentLabels(rawLabels:unknown,rawPredictions:unknown){
 const labels=independentLabelsSchema.parse(rawLabels),predictions=independentPredictionsSchema.parse(rawPredictions),sha=evaluationDigest(labels);
 if(predictions.labelsSha256!==sha)throw Error('Label manifest hash mismatch: labels, provenance or split changed after freezing');
 const frozen=Date.parse(labels.frozenAt),generated=Date.parse(predictions.generatedAt);
 if(generated<frozen)throw Error('Prediction manifest predates the frozen label manifest');
 const known=new Map<string,Case>(),groupSplits=new Map<string,string>(),evidenceSplits=new Map<string,string>();
 for(const item of labels.cases){
  if(known.has(item.id))throw Error('Duplicate labelled case ID');known.set(item.id,item);
  if(item.split==='holdout'&&item.usedForPromptTuning)throw Error('A holdout case was declared used for prompt tuning');
  if(item.reviewers.some(reviewer=>Date.parse(reviewer.reviewedAt)>frozen))throw Error('Reviewer timestamp is later than dataset freeze');
  for(const [value,map]of [[item.groupId,groupSplits],[item.evidenceSha256,evidenceSplits]]as const){if(map.has(value)&&map.get(value)!==item.split)throw Error('Group or identical evidence leaks across development and holdout splits');map.set(value,item.split);}
 }
 const results=new Map<string,Prediction>();
 for(const result of predictions.results){
  const item=known.get(result.caseId);if(!item)throw Error('Prediction has an unknown case ID');
  if(results.has(result.caseId))throw Error('Duplicate prediction case ID: choose one frozen run, do not select the best retry');
  if(result.evidenceSha256!==item.evidenceSha256)throw Error('Prediction evidence hash differs from the labelled packet');
  if(Date.parse(result.generatedAt)<frozen||Date.parse(result.generatedAt)>generated)throw Error('Prediction timestamp is outside the frozen evaluation interval');
  results.set(result.caseId,result);
 }
 return {
  mode:'read-only-external-label-evaluation',dataset_id:labels.datasetId,labels_sha256:sha,predictions_sha256:evaluationDigest(predictions),provenance:labels.provenance,label_policy_reference:labels.labelPolicyReference,sampling_description:labels.samplingDescription,
  independence_status:labels.provenance==='synthetic-workflow-example'?'synthetic-workflow-only':'external-reviewer-and-holdout-declarations-not-independently-attested',
  model:predictions.model,model_version:predictions.modelVersion,prompt_sha256:predictions.promptSha256,collector_version:predictions.collectorVersion,
  frozen_at:labels.frozenAt,generated_at:predictions.generatedAt,model_calls:0,rpc_calls:0,
  holdout:splitMetrics(labels.cases.filter(item=>item.split==='holdout'),results),development:splitMetrics(labels.cases.filter(item=>item.split==='development'),results),
  calibration:{available:false,reason:'A 0–100 risk indicator is not a predicted loss or fraud probability. Expert risk labels support ranking/classification evaluation, not probability calibration or a dollar-loss claim.'},
  boundary:'The evaluator checks supplied hashes, dates, group splits and schemas; it cannot attest reviewer independence, truthful timestamps, unseen training data, label correctness or whether a model actually received the hashed packet. No confidence interval or population accuracy is inferred from correlated cases. Report the label policy, sampling and unavailable cases alongside metrics. Synthetic examples never establish live model accuracy.'
 };
}
