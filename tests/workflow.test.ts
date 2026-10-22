import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server/app.js';
import { createStore } from '../src/server/store.js';
import { scenarios } from '../src/core/scenarios.js';
import { operationLabel, outcomeLabel } from '../src/core/presentation.js';
import type { ReceiptEvidence } from '../src/server/workflow.js';

const headers = { origin: 'http://127.0.0.1:5173' };
const input = { ...scenarios[0].input, chainId: 31337 };
const hash = `0x${'a'.repeat(64)}` as `0x${string}`;
const evidence: ReceiptEvidence = { ...input.transaction, from: input.transaction.from, to: input.transaction.to,
  input: input.transaction.data, value: BigInt(input.transaction.value ?? '0x0'), hash, status: 'success', blockNumber: 11n, blockHash: `0x${'b'.repeat(64)}` };
const context = async () => ({ ...scenarios[0].context, source: 'rpc' as const, blockNumber: '10' });

test('operation names distinguish revocation, finite and unlimited approve; outcome is independent', () => {
  assert.equal(operationLabel({ operation: 'approve', amount: '0', unlimited: false }), 'Revoke allowance');
  assert.equal(operationLabel({ operation: 'approve', amount: '100000000', unlimited: false }), 'Limited allowance');
  assert.equal(operationLabel({ operation: 'approve', amount: String(2n ** 256n - 1n), unlimited: true }), 'Very large allowance');
  assert.equal(operationLabel({ operation: 'unsupported' }), 'Unsupported operation');
  assert.equal(outcomeLabel({}), 'Outcome unknown');
});
test('wallet cancellation is tied to its exact request, never inferred for older or Snap analyses', async () => {
  const store = createStore(':memory:'); const app = await buildApp(store, { context });
  try {
    const independent = (await app.inject({ method: 'POST', url: '/api/analyze', headers, payload: input })).json();
    const session = (await app.inject({ method: 'POST', url: '/api/workflow/begin', headers, payload: input })).json();
    assert.ok(session.token); assert.notEqual(session.id, independent.id);
    const endpoint = `/api/workflow/${session.id}/result`;
    const denied = await app.inject({ method: 'POST', url: endpoint, headers, payload: { token: '0'.repeat(64), status: 'rejected' } });
    assert.equal(denied.statusCode, 403);
    const response = await app.inject({ method: 'POST', url: endpoint, headers, payload: { token: session.token, status: 'rejected' } });
    assert.equal(response.json().execution.status, 'rejected'); assert.equal(response.json().execution.evidence, 'wallet-response');
    assert.match(outcomeLabel(response.json()), /Canceled/);
    const rows = (await app.inject({ method: 'GET', url: '/api/workflow/records' })).json();
    assert.equal(rows.find((r: { id: string }) => r.id === independent.id).outcome, 'unknown');
    assert.equal(rows.find((r: { id: string }) => r.id === independent.id).execution, undefined);
    assert.ok(!JSON.stringify(rows).includes(session.token));
    assert.equal((await app.inject({ method: 'POST', url: endpoint, headers, payload: { token: session.token, status: 'submitted', transactionHash: hash } })).statusCode, 409);
  } finally { await app.close(); store.close(); }
});
test('only matching, later mined transaction receipt confirms execution; generic errors are not cancellations', async () => {
  for (const [receipt, status] of [
    [null, 'submitted'],
    [{ ...evidence, from: '0x0000000000000000000000000000000000000001' }, 'submitted'],
    [{ ...evidence, input: '0x' }, 'submitted'],
    [{ ...evidence, blockNumber: 10n }, 'submitted'],
    [{ ...evidence, value: 1n }, 'submitted'],
    [{ ...evidence, hash: `0x${'c'.repeat(64)}` }, 'submitted'],
    [evidence, 'confirmed'],
    [{ ...evidence, status: 'reverted' }, 'reverted']
  ] as const) {
    const store = createStore(':memory:'); const app = await buildApp(store, { context, receipt: async () => receipt });
    try {
      const session = (await app.inject({ method: 'POST', url: '/api/workflow/begin', headers, payload: input })).json();
      const response = await app.inject({ method: 'POST', url: `/api/workflow/${session.id}/result`, headers,
        payload: { token: session.token, status: 'submitted', transactionHash: hash } });
      assert.equal(response.statusCode, 200); assert.equal(response.json().outcome, status);
      assert.equal(response.json().execution.evidence, ['confirmed', 'reverted'].includes(status) ? 'chain-receipt' : 'wallet-response');
      const second = (await app.inject({ method: 'POST', url: '/api/workflow/begin', headers, payload: input })).json();
      const error = (await app.inject({ method: 'POST', url: `/api/workflow/${second.id}/result`, headers, payload: { token: second.token, status: 'error' } })).json();
      assert.equal(error.outcome, 'error'); assert.match(outcomeLabel(error), /unknown/);
    } finally { await app.close(); store.close(); }
  }
});
test('workflow rejects foreign origins, incomplete checks and fabricated final confirmations', async () => {
  const store = createStore(':memory:'); const app = await buildApp(store, { context });
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/api/workflow/begin', payload: input })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/workflow/begin', headers, payload: { ...input, chainId: 1 } })).statusCode, 400);
    const session = (await app.inject({ method: 'POST', url: '/api/workflow/begin', headers, payload: input })).json();
    for (const payload of [{ token: session.token, status: 'confirmed' }, { token: session.token, status: 'submitted' }, { token: session.token, status: 'rejected', transactionHash: hash }]) {
      assert.equal((await app.inject({ method: 'POST', url: `/api/workflow/${session.id}/result`, headers, payload })).statusCode, 400);
    }
  } finally { await app.close(); store.close(); }
  const unavailable = createStore(':memory:'); const offline = await buildApp(unavailable, { context: async () => { throw Error('offline'); } });
  try { assert.equal((await offline.inject({ method: 'POST', url: '/api/workflow/begin', headers, payload: input })).statusCode, 409); }
  finally { await offline.close(); unavailable.close(); }
});
