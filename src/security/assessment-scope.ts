import type {AssessmentScope,SecurityReport} from './types.js';
import {evidenceQuality} from './quality.js';

/** Separate the permanent off-chain caveat from unfinished request checks.
 * This classifies missing evidence, never calculates a numeric risk score.
 * Any other unknown, unexplained incomplete flag or model-discovered gap stays
 * critical. Only the server's exact, always-present purpose caveat is contextual.
 */
export function assessmentScope(report:SecurityReport,modelMissing:readonly string[]=[]):AssessmentScope {
 const unknown=report.checks.filter(c=>c.status==='unknown');
 const contextual=unknown.filter(c=>c.id==='fraud_context'&&c.source.startsWith('rules/'));
 const critical=unknown.filter(c=>!contextual.includes(c));
 const contextualTitles=new Set(contextual.map(c=>c.title));
 const missing=[...new Set([...report.missingData,...unknown.map(c=>c.title),...modelMissing])];
 if(!report.complete&&!missing.length)missing.push('Evidence collection is incomplete; specific missing observations were not supplied.');
 const quality=evidenceQuality(report);
 const timing=[...quality.freshness.staleCheckIds.map(id=>`Stale observation: ${id}`),...quality.freshness.futureCheckIds.map(id=>`Future-dated observation: ${id}`),...quality.freshness.missingTimestampCheckIds.map(id=>`Missing observation timestamp: ${id}`),...(quality.conflictingBlockHashes??[]).map(value=>`Conflicting block hashes: chain ${value.chainId}, block ${value.blockNumber}`)];
 return {
  policy:'observable-request-v1',label:'Observable request evidence',
  criticalUnknownCheckIds:critical.map(c=>c.id),
  contextualUnknownCheckIds:contextual.map(c=>c.id),
  criticalMissingData:[...new Set([...critical.map(c=>c.title),...missing.filter(value=>!contextualTitles.has(value)),...timing])],
  contextualMissingData:missing.filter(value=>contextualTitles.has(value)),
  boundary:'Assess only the supplied observable request evidence. Off-chain purpose remains unverified and visible; a low assessment or strong evidence support is not a guarantee of identity, future execution or safety.'
 };
}
