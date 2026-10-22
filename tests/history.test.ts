import test from 'node:test';
import assert from 'node:assert/strict';
import { groupHistory } from '../src/core/history.js';
import { evaluate } from '../src/core/engine.js';
import { scenarios } from '../src/core/scenarios.js';
import type { Analysis } from '../src/core/types.js';
import { createStore } from '../src/server/store.js';
import { buildApp } from '../src/server/app.js';

const make = (id: string, milliseconds: number): Analysis => ({
  ...evaluate({ ...scenarios[0].input, origin: 'http://127.0.0.1:5173' }, { ...scenarios[0].context, source: 'rpc', blockNumber: '6' }),
  id, createdAt: new Date(Date.UTC(2026, 9, 21, 4, 0, 0, milliseconds)).toISOString(), fingerprint: id
});
function pair() {
  const parent = make('wallet-request', 0), child = make('snap-check', 100);
  parent.execution = { status: 'rejected', evidence: 'wallet-response', updatedAt: make('returned', 500).createdAt, walletReturnedAt: make('returned', 500).createdAt };
  parent.outcome = 'rejected';
  return { parent, child };
}
test('a unique identical pre-sign check folds into its wallet request, preserving both raw records and outcome evidence', () => {
  const { parent, child } = pair(); const before = JSON.stringify([child, parent]);
  const rows = groupHistory([child, parent]);
  assert.equal(rows.length, 1); assert.equal(rows[0].id, parent.id); assert.equal(rows[0].outcome, 'rejected');
  assert.equal(rows[0].relatedChecks?.[0].id, child.id); assert.equal(rows[0].relatedChecks?.[0].outcome, 'unknown');
  assert.equal(rows[0].association?.method, 'exact-request-window'); assert.equal(JSON.stringify([child, parent]), before);
});
test('independent, ambiguous, differing, pending and out-of-window checks are never hidden', () => {
  const { parent, child } = pair();
  const variants: Analysis[] = [
    { ...child, source: 'demo' }, { ...child, createdAt: parent.createdAt },
    { ...child, createdAt: make('late', 600).createdAt },
    { ...child, blockNumber: '7' }, { ...child, level: 'unknown' },
    { ...child, checks: [] }, { ...child, complete: false },
    { ...child, input: { ...child.input, origin: 'https://another.example' } },
    { ...child, input: { ...child.input, chainId: 1 } },
    { ...child, input: { ...child.input, transaction: { ...child.input.transaction, from: `0x${'5'.repeat(40)}` } } },
    { ...child, input: { ...child.input, transaction: { ...child.input.transaction, data: '0x' } } }
  ];
  for (const variant of variants) assert.equal(groupHistory([variant, parent]).length, 2);
  assert.equal(groupHistory([child, { ...parent, execution: { ...parent.execution!, status: 'pending' } }]).length, 2);
  assert.equal(groupHistory([child, { ...child, id: 'second-check' }, parent]).length, 3);
  assert.equal(groupHistory([child, parent, { ...parent, id: 'second-wallet-request' }]).length, 3);
});
test('consecutive identical wallet operations stay distinct and preserve successful and canceled states', () => {
  const { parent, child } = pair();
  const next = { ...parent, id: 'next-operation', createdAt: make('start', 700).createdAt,
    outcome: 'confirmed' as const, execution: { ...parent.execution!, status: 'confirmed' as const, evidence: 'chain-receipt' as const,
      walletReturnedAt: make('returned', 900).createdAt, updatedAt: make('receipt', 999).createdAt } };
  const nextCheck = { ...child, id: 'next-check', createdAt: make('checked', 800).createdAt };
  const rows = groupHistory([nextCheck, next, child, parent]);
  assert.equal(rows.length, 2); assert.equal(rows[0].outcome, 'confirmed'); assert.equal(rows[1].outcome, 'rejected');
  assert.equal(rows[0].relatedChecks?.[0].id, 'next-check'); assert.equal(rows[1].relatedChecks?.[0].id, 'snap-check');
});
test('history API groups before limiting, offers raw inspection, and never deletes SQLite evidence', async () => {
  const store = createStore(':memory:'); const app = await buildApp(store);
  try {
    const { parent, child } = pair();
    const { execution, ...rawParent } = parent;
    store.save({ ...rawParent, outcome: 'unknown' }); store.save(child); store.track(parent.id, 'test-token-hash', execution!);
    const grouped = (await app.inject({ method: 'GET', url: '/api/workflow/records' })).json();
    assert.equal(grouped.length, 1); assert.equal(grouped[0].relatedChecks.length, 1); assert.equal(grouped[0].outcome, 'rejected');
    const raw = (await app.inject({ method: 'GET', url: '/api/workflow/records?view=checks' })).json();
    assert.equal(raw.length, 2); assert.equal(store.history().length, 2); assert.equal(store.get(child.id)?.outcome, 'unknown');
  } finally { await app.close(); store.close(); }
});
