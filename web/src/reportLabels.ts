import {COVERAGE_PROFILES} from '../../src/security/coverage';
import type {SecurityReport} from '../../src/security/types';
import {scoreDisposition,partialAssessmentLabel} from '../../src/security/score-disposition';

/** Display labels never replace original report text or stored judgments. */
export function historyOperationLabel(report:SecurityReport):string {
 if(!/\p{Script=Han}/u.test(report.operation.label))return report.operation.label;
 return COVERAGE_PROFILES.find(profile=>profile.categories.includes(report.operation.category))?.name??'Unrecognized operation';
}

export function overallAdvisoryLabel(report:SecurityReport):string {
 if(report.ai.status==='not_applicable'&&!['high','review'].includes(report.level))return 'Read-only · Privacy not assessed';
 const partial=partialAssessmentLabel(report);if(partial)return partial;
 return {low:'No clear risk observed',review:'Needs review',high:'High risk',unknown:'Unable to assess'}[report.level];
}

export function securityHistoryMatches(report:SecurityReport,query:string,displayedTime=new Date(report.createdAt).toLocaleString('en-US',{hour12:false})):boolean {
 return [displayedTime,historyOperationLabel(report),overallAdvisoryLabel(report),scoreDisposition(report).label].join(' ').toLowerCase().includes(query.trim().toLowerCase());
}
