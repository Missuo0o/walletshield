import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server/app.js';
import { createStore } from '../src/server/store.js';
import { scenarios } from '../src/core/scenarios.js';
const localHeaders = { origin: 'http://127.0.0.1:5173' };
test('API separates fixtures from RPC results, persists evidence, and does not invent outcomes', async () => {
  const store = createStore(':memory:');
  const app = await buildApp(store);
  try {
    const fixtures = await app.inject({ method: 'GET', url: '/api/scenarios' });
    assert.equal(fixtures.statusCode, 200); assert.equal(fixtures.json().length, 6);
    assert.equal(fixtures.json()[0].context, undefined);
    const demo = await app.inject({ method: 'POST', url: '/api/demo/unlimited', headers: localHeaders, payload: {} });
    assert.equal(demo.statusCode, 200); const record = demo.json(); assert.equal(record.source, 'demo');
    assert.equal(record.outcome, 'unknown'); assert.equal(record.level, 'high');
    const event = await app.inject({ method: 'POST', url: `/api/records/${record.id}/demo-decision`, headers: localHeaders, payload: { action: 'cancel' } });
    assert.equal(event.statusCode, 200); assert.equal(event.json().outcome, 'unknown');
    const detail = await app.inject({ method: 'GET', url: `/api/records/${record.id}` });
    assert.equal(detail.json().demoEvents[0].action, 'cancel'); assert.equal(detail.json().outcome, 'unknown');
    const list = await app.inject({ method: 'GET', url: '/api/records' }); assert.equal(list.json().length, 1);
    const unsupported = await app.inject({ method: 'POST', url: '/api/analyze', headers: localHeaders, payload: { ...scenarios[1].input, chainId: 1 } });
    assert.equal(unsupported.json().source, 'rpc'); assert.equal(unsupported.json().level, 'unknown');
    const forgedOutcome = await app.inject({ method: 'POST', url: `/api/records/${unsupported.json().id}/demo-decision`, headers: localHeaders, payload: { action: 'cancel' } });
    assert.equal(forgedOutcome.statusCode, 409);
    assert.equal((await app.inject({ method: 'GET', url: '/api/records/missing' })).statusCode, 404);
  } finally { await app.close(); store.close(); }
});
test('API rejects invalid addresses, invalid hex, spoofed context and overlarge payloads', async () => {
  const store = createStore(':memory:'); const app = await buildApp(store);
  try {
    for (const payload of [
      { ...scenarios[1].input, context: scenarios[1].context },
      { ...scenarios[1].input, chainId: -1 },
      { ...scenarios[1].input, transaction: { ...scenarios[1].input.transaction, from: 'bad' } },
      { ...scenarios[1].input, transaction: { ...scenarios[1].input.transaction, data: '0xa' } },
      { ...scenarios[1].input, transaction: { ...scenarios[1].input.transaction, value: '-1' } }
    ]) assert.equal((await app.inject({ method: 'POST', url: '/api/analyze', headers: localHeaders, payload })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/analyze', headers: localHeaders, payload: { data: 'x'.repeat(40000) } })).statusCode, 413);
    assert.equal(store.list().length, 0);
  } finally { await app.close(); store.close(); }
});
test('unexpected context provider failure is persisted as unknown, never a pass', async () => {
  const store = createStore(':memory:'); const app = await buildApp(store, { context: async () => { throw new Error('failure'); } });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/analyze', headers: localHeaders, payload: scenarios[1].input });
    assert.equal(response.statusCode, 200); assert.equal(response.json().level, 'unknown'); assert.equal(response.json().complete, false);
  } finally { await app.close(); store.close(); }
});
test('test funding only accepts local workbench origin and a nonzero address, never RPC or amount overrides', async () => {
  const store = createStore(':memory:'); let calls = 0;
  const recipient = '0x5555555555555555555555555555555555555555';
  const app = await buildApp(store, { fund: async address => {
    calls++;
    return { chainId: 31337, address: address as `0x${string}`, token: '0x1111111111111111111111111111111111111111', eth: '10000000000000000000', testUsd: '5000000000', mintTransaction: null, source: 'local-anvil' };
  } });
  try {
    for (const origin of [undefined, 'null', 'https://other.example']) {
      const response = await app.inject({ method: 'POST', url: '/api/local/fund', ...(origin ? { headers: { origin } } : {}), payload: { address: recipient } });
      assert.equal(response.statusCode, 403);
    }
    for (const payload of [{ address: 'invalid' }, { address: '0x0000000000000000000000000000000000000000' }, { address: recipient, rpcUrl: 'https://other.example' }, { address: recipient, amount: '100' }]) {
      assert.equal((await app.inject({ method: 'POST', url: '/api/local/fund', headers: { origin: 'http://127.0.0.1:5173' }, payload })).statusCode, 400);
    }
    assert.equal(calls, 0);
    const success = await app.inject({ method: 'POST', url: '/api/local/fund', headers: { origin: 'http://127.0.0.1:5173' }, payload: { address: recipient } });
    assert.equal(success.statusCode, 200); assert.equal(success.json().address, recipient); assert.equal(calls, 1);
  } finally { await app.close(); store.close(); }
});
test('funding errors do not report success and release the request lock', async () => {
  const store = createStore(':memory:'); let calls = 0;
  const app = await buildApp(store, { fund: async () => { calls++; throw new Error('old deployment'); } });
  try {
    for (let i = 0; i < 2; i++) assert.equal((await app.inject({ method: 'POST', url: '/api/local/fund', headers: { origin: 'http://localhost:5173' }, payload: { address: '0x5555555555555555555555555555555555555555' } })).statusCode, 503);
    assert.equal(calls, 2);
  } finally { await app.close(); store.close(); }
});
