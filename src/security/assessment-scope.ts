import type {AssessmentScope,SecurityReport} from './types.js';
import {evidenceQuality} from './quality.js';

/** Classify unfinished checks of the observable wallet request.
 * This never calculates a numeric risk score. Unknown observations, unexplained
 * incomplete flags and model-discovered evidence gaps all remain critical.
 */
export function assessmentScope(report:SecurityReport,modelMissing:readonly string[]=[]):AssessmentScope {
 const unknown=report.checks.filter(c=>c.status==='unknown');
 const missing=[...new Set([...report.missingData,...unknown.map(c=>c.title),...modelMissing])];
 if(!report.complete&&!missing.length)missing.push('Evidence collection is incomplete; specific missing observations were not supplied.');
 const quality=evidenceQuality(report);
 const timing=[...quality.freshness.staleCheckIds.map(id=>`Stale observation: ${id}`),...quality.freshness.futureCheckIds.map(id=>`Future-dated observation: ${id}`),...quality.freshness.missingTimestampCheckIds.map(id=>`Missing observation timestamp: ${id}`),...(quality.conflictingBlockHashes??[]).map(value=>`Conflicting block hashes: chain ${value.chainId}, block ${value.blockNumber}`)];
 return {
  policy:'observable-request-v1',label:'Observable request evidence',
  criticalUnknownCheckIds:unknown.map(c=>c.id),
  criticalMissingData:[...new Set([...missing,...timing])],
  boundary:'Assess only the supplied observable request evidence. A low assessment or strong evidence support is not a guarantee of identity, future execution or safety.'
 };
}
