import test from 'node:test';
import assert from 'node:assert/strict';
import { searchHistory } from '../src/core/search.js';
import { evaluate } from '../src/core/engine.js';
import { scenarios } from '../src/core/scenarios.js';
import type { Analysis } from '../src/core/types.js';
import {historyOperationLabel,overallAdvisoryLabel,securityHistoryMatches} from '../web/src/reportLabels.js';
import {finitePermitOutput,finitePermitReport} from './fixtures/model.js';
import {validateAI} from '../src/security/ai.js';

const record: Analysis = { ...evaluate(scenarios[1].input, scenarios[1].context), id: '12345678-34ab-4abc-8abc-123456789abc', createdAt: '2026-10-21T03:53:59Z', fingerprint: 'raw-34' };
const displayedTime = '2026/10/20 23:53:59';
test('simple search keeps short numbers limited to visible text rather than hidden identifiers', () => {
  assert.equal(searchHistory(record, '34', displayedTime), false);
  assert.equal(searchHistory({ ...record, spender: `0x${'1'.repeat(16)}34${'1'.repeat(22)}` }, '34', displayedTime), false);
  assert.equal(searchHistory(record, '095ea7b3', displayedTime), false);
  assert.equal(searchHistory(record, '34', '2026/10/20 23:07:34'), true);
});
test('a single search box accepts pasted full addresses and meaningful record ID prefixes', () => {
  assert.equal(searchHistory(record, '  12345678-34AB  ', displayedTime), true);
  const spender = `0x${'1'.repeat(16)}34${'1'.repeat(22)}`;
  assert.equal(searchHistory({ ...record, spender }, spender.toUpperCase(), displayedTime), true);
  const grouped = { ...record, relatedChecks: [{ ...record, id: 'abcdef12-3456-4789-abcd-123456789abc' }] };
  assert.equal(searchHistory(grouped, 'abcdef12-3456', displayedTime), true);
  assert.equal(searchHistory({ ...record, spender: undefined }, spender, displayedTime), false);
});
test('simple search handles multiple words, status, case, blank input and literal punctuation', () => {
  assert.equal(searchHistory(record, '100 test-usd', displayedTime), true);
  assert.equal(searchHistory(record, '100 TEST-USD missing', displayedTime), false);
  assert.equal(searchHistory(record, record.title, displayedTime), true);
  assert.equal(searchHistory(record, 'Demo data', displayedTime), true);
  assert.equal(searchHistory({ ...record, execution: { status: 'rejected', evidence: 'wallet-response', updatedAt: record.createdAt } }, 'Canceled', displayedTime), true);
  assert.equal(searchHistory(record, '.*', displayedTime), false);
  assert.equal(searchHistory(record, '   ', displayedTime), true);
});
test('security history searches English display categories and advisories without changing historical report data',()=>{
 const report=finitePermitReport();report.operation.label='历史有限授权';report.title='历史无法判断';report.level='unknown';
 report.score=34;report.scoreSource='ai';report.ai={status:'completed',message:'Completed',result:validateAI(finitePermitOutput(34),report,'muse-wonder-1.0')};
 const original=structuredClone(report),operation=historyOperationLabel(report);
 assert.match(operation,/Permit/);assert.doesNotMatch(operation,/\p{Script=Han}/u);
 assert.equal(overallAdvisoryLabel(report),'Incomplete evidence');
 assert.equal(securityHistoryMatches(report,operation.toUpperCase(),displayedTime),true);
 assert.equal(securityHistoryMatches(report,'incomplete evidence',displayedTime),true);
 assert.equal(securityHistoryMatches(report,'23:53',displayedTime),true);
 assert.equal(securityHistoryMatches(report,'历史有限授权',displayedTime),false);
 assert.equal(securityHistoryMatches(report,'历史无法判断',displayedTime),false);
 assert.equal(securityHistoryMatches(report,'Unable to assess',displayedTime),false);
 assert.deepEqual(report,original);
 assert.equal(overallAdvisoryLabel({...report,score:null}),'Unable to assess');
 assert.equal(overallAdvisoryLabel({...report,level:'high'}),'High risk');
 assert.equal(historyOperationLabel({...report,operation:{...report.operation,label:'Specific English operation'}}),'Specific English operation');
});
