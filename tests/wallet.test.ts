import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import { SNAP_ID, requestWalletShieldSnap, snapInstallationError, type WalletProvider } from '../web/src/wallet.js';
import {SecurityReportView} from '../web/src/SecurityReportView.js';
import {assess} from '../src/security/rules.js';
import {evidence} from '../src/security/evidence.js';
import {evidenceQuality} from '../src/security/quality.js';
import {finitePermitOutput,finitePermitReport} from './fixtures/model.js';
import {validateAI} from '../src/security/ai.js';

test('Snap installation uses the object params required by MetaMask and accepts enabled metadata', async () => {
  const provider: WalletProvider = { request: async ({ method, params }) => {
    assert.equal(method, 'wallet_requestSnaps');
    // Reproduce the real wallet's -32602 validation at the protocol boundary.
    if (!params || typeof params !== 'object' || Array.isArray(params)) throw Object.assign(new Error('"params" must be an object.'), { code: -32602 });
    assert.deepEqual(params, { [SNAP_ID]: {} });
    return { [SNAP_ID]: { id: SNAP_ID, version: '0.1.0', enabled: true, blocked: false, initialPermissions: {} } };
  } };
  assert.equal((await requestWalletShieldSnap(provider)).version, '0.1.0');
});
test('per-Snap errors and incomplete installation results never become success', async () => {
  const error = { code: -32602, message: '"params" must be an object.' };
  await assert.rejects(() => requestWalletShieldSnap({ request: async () => ({ [SNAP_ID]: { error } }) }), e => {
    assert.match(snapInstallationError(e), /-32602/); assert.match(snapInstallationError(e), /params/); return true;
  });
  for (const result of [null, [], {}, { [SNAP_ID]: { id: SNAP_ID, version: '0.1.0', enabled: false, blocked: false } }, { [SNAP_ID]: { id: SNAP_ID, version: '0.1.0', enabled: true, blocked: true } }]) {
    await assert.rejects(() => requestWalletShieldSnap({ request: async () => result }));
  }
});
test('wallet installation cancellation and errors retain actionable feedback', () => {
  assert.match(snapInstallationError({ code: 4001 }), /canceled/i);
  assert.match(snapInstallationError(new Error('Failed to fetch local Snap')), /Failed to fetch local Snap/);
});
test('post-install connection failures never claim that the Snap failed to install',()=>{
 for(const stage of ['pair-token','pair-backend','verify'] as const){
  const message=snapInstallationError({code:-32603,message:'Failed to fetch'},stage);
  assert.match(message,/Snap installed/);assert.doesNotMatch(message,/Snap installation incomplete/);assert.match(message,/8787/);
 }
 assert.match(snapInstallationError({code:4001},'pair-backend'),/Pairing was canceled/);
});
test('report evidence quality displays recorded gaps and snapshot provenance without turning counts into safety estimates',()=>{
 const snapshot={...evidence('snapshot_fixture','pass','Fixed block read','Test observation','rpc',{chainId:1,blockNumber:'123'}),observedAt:new Date(Date.now()-360000).toISOString()};
 const report=assess({kind:'transaction',chainId:1,transaction:{from:'0x'+'1'.repeat(40),to:'0x'+'2'.repeat(40),data:'0x',value:'0x0'}},[snapshot]);
 report.quality=evidenceQuality(report);
 const html=renderToStaticMarkup(createElement(SecurityReportView,{report}));
 assert.match(html,/Evidence quality/);assert.ok(html.includes(`${report.quality.counts.unknown} unknown`));
 assert.match(html,/1 stale/);assert.match(html,/Chain 1/);assert.match(html,/Block 123/);assert.match(html,/not a live freshness check/);
 assert.match(html,/not detection accuracy or safety coverage/);assert.equal(report.score,null);
});
test('legacy report prose stays original and absent quality or legacy scoring is labeled honestly',()=>{
 const report=assess({kind:'transaction',chainId:1,transaction:{from:'0x'+'1'.repeat(40),to:'0x'+'2'.repeat(40),data:'0x'}},[evidence('legacy','unknown','原始依据','原始详情','legacy-source')]);
 delete report.quality;report.score=40;report.scoreSource='rules';
 const html=renderToStaticMarkup(createElement(SecurityReportView,{report}));
 assert.match(html,/original non-English content/);assert.ok(html.includes('原始详情'));
 assert.match(html,/No evidence-quality inventory was saved/);assert.match(html,/older rules engine/);assert.match(html,/not a Muse score/);
});
test('a valid model number with unknown overall evidence renders a partial-assessment advisory without changing the report',()=>{
 const report=finitePermitReport();report.level='unknown';report.score=34;report.scoreSource='ai';
 report.ai={status:'completed',message:'Model analysis completed.',result:validateAI(finitePermitOutput(34),report,'muse-wonder-1.0')};
 const original=structuredClone(report),html=renderToStaticMarkup(createElement(SecurityReportView,{report}));
 assert.match(html,/Overall advisory: Review required · Partial assessment/);assert.match(html,/Model assessment: Needs review/);
 assert.match(html,/Missing checks/);assert.ok(report.missingData.length>0);assert.deepEqual(report,original);
});
