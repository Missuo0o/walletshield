/** Presentation-only classification. It never invents a score, changes a
 * qualitative advisory or rewrites the stored report. Optional fields retain
 * compatibility with reports written before machine-readable failure kinds. */
type ScoreReport={score?:number|null;scoreSource?:string;ai?:{status:string;message?:string;failureKind?:string;result?:unknown}};
export type ScoreDisposition={kind:'scored'|'legacy_score'|'insufficient_evidence'|'invalid_output'|'transport_error'|'analysis_failed'|'not_applicable'|'pending'|'not_run';label:string;detail:string};
export function scoreDisposition(report:ScoreReport):ScoreDisposition {
 const ai=report.ai;
 if(typeof report.score==='number'&&Number.isInteger(report.score)&&report.score>=0&&report.score<=100){
  if(report.scoreSource==='rules')return {kind:'legacy_score',label:'Historical rule score',detail:'This historical number was produced by an older rule engine, not Muse.'};
  if(report.scoreSource==='ai'&&ai?.status==='completed')return {kind:'scored',label:'AI score available',detail:'Muse supplied a score that passed output validation. This is not a calibrated loss probability or a safety guarantee.'};
 }
 if(ai?.status==='not_applicable')return {kind:'not_applicable',label:'Not applicable · Read-only query',detail:'No asset-risk model call was needed for this recognized query. Privacy and returned-data safety are not assessed.'};
 if(ai?.status==='pending')return {kind:'pending',label:'Analyzing',detail:'Evidence analysis is in progress. No score has been accepted yet.'};
 if(ai?.status==='completed'&&ai.result)return {kind:'insufficient_evidence',label:'Evidence insufficient for a score',detail:'Muse completed its response but did not assign a supported number. This does not mean the request is safe.'};
 if(ai?.status==='failed'){
  // Old records did not store failureKind. Recognize only explicit diagnostics;
  // an unspecified failure must not be mislabeled as a connection problem.
  const legacy=ai.failureKind===undefined?(ai.message??''):'';
  if(['validation','response'].includes(ai.failureKind??'')||/output failed validation|response could not be parsed|model refused|did not complete its output/i.test(legacy))return {kind:'invalid_output',label:'Model output rejected',detail:'The model response did not meet the required format, evidence or consistency checks. No score was accepted.'};
  if(ai.failureKind==='transport'||/model request timed out|model connection failed|model service error/i.test(legacy))return {kind:'transport_error',label:'Model connection failed',detail:'The model service did not return a usable response. No score was accepted; collected evidence is retained.'};
  return {kind:'analysis_failed',label:'Analysis incomplete',detail:'The analysis did not produce an accepted result. Review the diagnostic and collected evidence.'};
 }
 return {kind:'not_run',label:'AI not run',detail:'No model score was generated. Check model configuration, service limits and the recorded diagnostic.'};
}
export function scoreStatusLabel(report:ScoreReport):string {
 const disposition=scoreDisposition(report);
 return disposition.kind==='scored'?`${report.score}/100 · AI`:disposition.kind==='legacy_score'?`${report.score}/100 · Legacy rules`:disposition.label;
}

/** A usable, accepted model assessment can coexist with incomplete evidence.
 * This changes presentation only: unknown checks, severity and score stay intact.
 * Never mask an observed high risk, abstention, failure or historical rule score. */
export function partialAssessmentLabel(report:ScoreReport&{level:string}):string|undefined {
 const result=report.ai?.result;
 if(report.level!=='unknown'||scoreDisposition(report).kind!=='scored'||!result||typeof result!=='object')return undefined;
 const assessment=(result as {assessment?:unknown}).assessment;
 return assessment==='review'||assessment==='low'?'Review required · Partial assessment':undefined;
}
