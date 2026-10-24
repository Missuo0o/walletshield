import React from 'react';
import {adviceLine} from '../../src/security/display';
import type {SecurityReport} from '../../src/security/types';
import {coverageForCategory} from '../../src/security/coverage';
import {overallAdvisoryLabel} from './reportLabels';
import {scoreDisposition} from '../../src/security/score-disposition';
const labels={low:'No clear risk observed',review:'Needs review',high:'High risk',unknown:'Unknown'};
const dimensionLabels={authority:'Authority',exposure:'Exposure and fees',execution:'Execution and asset changes',identity:'Identity and consistency',protocol:'Protocol mechanics',deception:'Deception indicators'};
export function SecurityReportView({report}:{report:SecurityReport}){
 const coverage=coverageForCategory(report.operation.category);
 const quality=report.quality;
 const originalLanguage=/\p{Script=Han}/u.test(JSON.stringify(report));
 const disposition=scoreDisposition(report),hasScore=disposition.kind==='scored'||disposition.kind==='legacy_score';
 return <div className="security-report">
  {originalLanguage&&<p className="notice">This report includes original non-English content. Source labels, evidence and model statements are preserved as recorded; they have not been translated or reanalyzed.</p>}
  <div className="security-score"><div><span>{report.scoreSource==='rules'?'Legacy rule score':'AI risk indicator'}</span><strong className={report.level}>{hasScore?report.score:disposition.kind==='not_applicable'?'N/A':'—'}<small>{hasScore?' / 100':disposition.label}</small></strong></div><span className={`risk-pill ${report.level}`}>Overall advisory: {overallAdvisoryLabel(report)}</span></div>
  <p className="score-note">{report.scoreSource==='rules'?'This legacy number came from an older rules engine. It is not a Muse score or a loss probability.':'When present, Muse generates the number from this request evidence without preset scores or minimums. It is not a loss probability.'} The overall advisory combines qualitative findings, unknowns and the model assessment; it is not a score band.</p>
  <p className="score-note">Request source: {report.capture?.channel==='paired-snap'?'Paired Snap submission':report.capture?.channel==='workbench'?'Website check':'Legacy source unspecified'}. The score describes the visible request; identity and future execution may remain unknown.</p><h3>{report.operation.label}</h3><p className="security-summary">{report.summary}</p>
  {report.assessmentScope&&<section className="security-ai" aria-label="Assessment scope"><h4>Assessment scope: {report.assessmentScope.label}</h4><p>{report.assessmentScope.boundary}</p><p>{report.assessmentScope.criticalMissingData.length} unresolved evidence gaps. Evidence completeness and risk are separate.</p></section>}
  <div className="security-ai"><strong>AI analysis: {disposition.label}</strong><p>{disposition.detail}</p><p>{report.ai.message}</p>{report.ai.status==='completed'&&report.ai.result&&<><p>Model assessment: {labels[report.ai.result.assessment]}</p><p>{report.ai.result.summary}</p><ul>{report.ai.result.reasons.map((r,i)=><li key={i}>{r.text}<small>Evidence: {r.evidence_ids.join(', ')}</small></li>)}</ul><p>{adviceLine(report.ai.result.suggested_action)}</p></>}</div>
  {report.ai.status==='completed'&&report.ai.result?.dimensions&&<div className="security-ai"><h4>Muse assessment by dimension</h4><p>Evidence support: {report.ai.result.evidence_confidence?({limited:'Limited',moderate:'Moderate',strong:'Strong'})[report.ai.result.evidence_confidence]:'Not recorded'} (not a confidence probability)</p>{report.ai.result.dimensions.map(d=><div key={d.dimension}><strong>{dimensionLabels[d.dimension]} · {d.assessment==='not_applicable'?'Not applicable':labels[d.assessment]}</strong><p>{d.reason}</p><small>Evidence: {d.evidence_ids.join(', ')}</small></div>)}</div>}
  {report.ai.status==='completed'&&report.ai.result?.facts&&<details className="security-details"><summary>Model facts checked against collected evidence ({report.ai.result.facts.length})</summary><p>The server verified these exact fields, subjects and sources. This does not certify the upstream source or prove every model sentence.</p><dl>{report.ai.result.facts.map(fact=><React.Fragment key={fact.id}><dt>{fact.subject.role}: {fact.subject.value}</dt><dd><code>{fact.field}</code> = {String(fact.value)}<br/>{fact.provenance.source} · {fact.scope} · {fact.evidence_id}<br/>Chain {fact.provenance.chain_id??'not established'} · Block {fact.provenance.block_number??'not established'}{fact.provenance.block_hash&&<><br/><code>{fact.provenance.block_hash}</code></>}</dd></React.Fragment>)}</dl></details>}
  <section className="security-ai evidence-quality" aria-label="Evidence quality">
   <h4>Evidence quality</h4>
   {quality?<>
    <p>Recorded checks: {quality.counts.pass} pass · {quality.counts.warning} warning · {quality.counts.risk} risk · {quality.counts.unknown} unknown. These counts describe evidence status, not detection accuracy or safety coverage.</p>
    <p>Observation-time flags: {quality.freshness.staleCheckIds.length} stale · {quality.freshness.futureCheckIds.length} future-dated · {quality.freshness.missingTimestampCheckIds.length} missing timestamps. Recorded {new Date(quality.computedAt).toLocaleString('en-US',{hour12:false})}; this is not a live freshness check.</p>
    {quality.blockFreshness?<p>Upstream-block flags: {quality.blockFreshness.staleCheckIds.length} stale · {quality.blockFreshness.futureCheckIds.length} future-dated · {quality.blockFreshness.missingTimestampCheckIds.length} missing timestamps · {quality.blockFreshness.missingHashCheckIds.length} missing hashes · {quality.blockFreshness.unverifiedChainCheckIds.length} unverified chains. Local-chain clocks are excluded from this public-chain check.</p>:<p>Upstream-block freshness was not evaluated for this stored report.</p>}
    <details className="security-details"><summary>Sources, snapshots and caveats</summary>
     <p>Request source: {quality.capture==='paired-snap'?'Paired Snap':quality.capture==='workbench'?'Website check':'Unattributed'}. Wallet binding: {quality.walletBinding==='authenticated-credential'?'Authenticated wallet credential':'Not established'}.</p>
     <p>Freshness thresholds: stale after {quality.freshness.staleAfterSeconds} seconds; future tolerance {quality.freshness.futureToleranceSeconds} seconds.</p>
     {quality.freshness.staleCheckIds.length>0&&<p>Stale check IDs: {quality.freshness.staleCheckIds.join(', ')}</p>}
     {quality.freshness.futureCheckIds.length>0&&<p>Future-dated check IDs: {quality.freshness.futureCheckIds.join(', ')}</p>}
     {quality.freshness.missingTimestampCheckIds.length>0&&<p>Missing timestamp IDs: {quality.freshness.missingTimestampCheckIds.join(', ')}</p>}
     {quality.mixedBlockChains.length>0&&<p>Multiple observed blocks on chain IDs {quality.mixedBlockChains.join(', ')}. These checks do not share one synchronized snapshot.</p>}
     <h4>Source inventory</h4><ul>{quality.sources.map(source=><li key={source.source}>{source.source}: {source.observed} observed · {source.unknown} unknown</li>)}</ul>
     <h4>Observed snapshots</h4>{quality.snapshots.length?<dl>{quality.snapshots.map((snapshot,i)=><React.Fragment key={`${snapshot.checkId}:${i}`}><dt>{snapshot.checkId}</dt><dd>{snapshot.source} · {snapshot.chainId===undefined?'Chain not established':`Chain ${snapshot.chainId}`} · Block {snapshot.blockNumber}{snapshot.blockHash&&<><br/><code>{snapshot.blockHash}</code></>}{snapshot.blockTimestampSeconds&&<><br/>Block timestamp (seconds): {snapshot.blockTimestampSeconds}</>}</dd></React.Fragment>)}</dl>:<p>No block snapshots were recorded.</p>}
     {quality.caveats.length>0&&<><h4>Caveats</h4><ul>{quality.caveats.map((caveat,i)=><li key={i}>{caveat}</li>)}</ul></>}
    </details>
   </>:<p>No evidence-quality inventory was saved with this report. Freshness, source completeness and wallet binding have not been established for this stored record.</p>}
  </section>
  <details className="security-details"><summary>Coverage and limitations</summary><p>{coverage.scope}</p><p>{coverage.uncertain}</p></details>
  <details className="security-details"><summary>Request parameters</summary><dl>{Object.entries(report.operation.fields).map(([key,value])=><React.Fragment key={key}><dt>{key}</dt><dd>{String(value)}</dd></React.Fragment>)}</dl></details>
  <h4>Collected evidence</h4><div className="checks-list">{report.checks.map(c=><div className={`check-row ${c.status}`} key={c.id}><span className="check-symbol">{c.status==='pass'?'✓':c.status==='risk'?'!':'?'}</span><div><strong>{c.title}</strong><p>{c.detail}</p><small>{c.source} · {new Date(c.observedAt).toLocaleString('en-US',{hour12:false})}</small></div></div>)}</div>
  <details className="security-details"><summary>Missing checks ({report.missingData.length})</summary><ul>{report.missingData.map((m,i)=><li key={i}>{m}</li>)}</ul></details>
  <details className="security-details"><summary>Stored report and original evidence</summary><pre className="evidence-json">{JSON.stringify(report,null,2)}</pre></details>
 </div>;
}
