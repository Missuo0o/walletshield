import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, erc20Abi, maxUint256, zeroAddress } from 'viem';
import { evaluate, parseApproval } from '../src/core/engine.js';
import { scenarios } from '../src/core/scenarios.js';
const get = (id: string) => structuredClone(scenarios.find(s => s.id === id)!);
test('unknown spender + unlimited scope exposes high permission risk without claiming confirmed scam', () => {
  const s = get('unlimited'); const r = evaluate(s.input, s.context);
  assert.equal(r.level, 'high'); assert.equal(r.unlimited, true); assert.equal(r.amount, maxUint256.toString());
  assert.ok(r.checks.some(c => c.detail.includes('not proof of fraud')));
});
test('finite approval is interpreted in token decimals without precision loss', () => {
  const s = get('limited'); const r = evaluate(s.input, s.context);
  assert.equal(r.level, 'low'); assert.equal(r.formattedAmount, '100'); assert.equal(r.complete, true);
});
test('unlimited scope alone is a warning, not proof of maliciousness', () => {
  const s = get('unlimited'); s.context.reputation = 'test-allowed';
  assert.equal(evaluate(s.input, s.context).level, 'review');
});
test('revocation does not falsely flag the target as gaining permissions', () => {
  const s = get('revoke'); s.context.reputation = 'test-blocked';
  const r = evaluate(s.input, s.context); assert.equal(r.level, 'low'); assert.equal(r.amount, '0');
  assert.ok(r.checks.some(c => c.detail.includes('other spenders retain')));
});
test('test blocklist still triggers for finite approvals and is explicitly labelled test data', () => {
  const s = get('blocked'); const r = evaluate(s.input, s.context);
  assert.equal(r.level, 'high'); assert.ok(r.checks.some(c => c.detail.includes('not external threat intelligence')));
});
test('RPC failure never becomes a low risk verdict', () => {
  const s = get('unavailable'); const r = evaluate(s.input, s.context);
  assert.equal(r.level, 'unknown'); assert.equal(r.complete, false);
});
test('unsupported requests have no fabricated token permission', () => {
  const s = get('unsupported'); const r = evaluate(s.input, s.context);
  assert.equal(r.level, 'unknown'); assert.equal(r.operation, 'unsupported'); assert.equal(r.spender, undefined);
});
test('failed eth_call cannot produce a complete or low result', () => {
  const s = get('limited'); s.context.simulation = { status: 'failed', detail: 'Reverted' };
  const r = evaluate(s.input, s.context); assert.equal(r.level, 'unknown'); assert.equal(r.complete, false);
});
test('missing account state is explicitly incomplete', () => {
  const s = get('limited'); delete s.context.balance;
  assert.equal(evaluate(s.input, s.context).level, 'unknown');
});
test('unknown token decimals never turn raw integers into a claimed token quantity', () => {
  const s = get('unavailable'); const r = evaluate(s.input, s.context);
  assert.equal(r.formattedAmount, undefined); assert.ok(r.summary.includes('not a decimal token quantity'));
});
test('reject noncanonical ABI address padding', () => {
  const s = get('limited');
  const noncanonical = s.input.transaction.data.slice(0, 10) + 'ff' + s.input.transaction.data.slice(12);
  assert.throws(() => parseApproval(noncanonical));
});
test('danger signals remain visible even when some checks are incomplete', () => {
  const s = get('unlimited'); s.context.error = 'timeout'; s.context.simulation.status = 'unavailable';
  const r = evaluate(s.input, s.context); assert.equal(r.level, 'high'); assert.equal(r.complete, false);
});
test('token name alone cannot bypass address identity checks', () => {
  const s = get('limited'); s.context.token!.address = zeroAddress;
  assert.equal(evaluate(s.input, s.context).level, 'unknown');
});
test('nonzero native value is flagged independently of token scope', () => {
  const s = get('limited'); s.input.transaction.value = '0x1';
  assert.equal(evaluate(s.input, s.context).level, 'high');
});
test('approve to zero address is not labelled global revocation', () => {
  const s = get('limited'); s.input.transaction.data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [zeroAddress, 1n] });
  const r = evaluate(s.input, s.context); assert.equal(r.level, 'review'); assert.ok(r.checks.some(c => c.id === 'ZERO_SPENDER'));
});
test('over-balance finite scope is a warning', () => {
  const s = get('limited'); s.context.balance = '1';
  assert.equal(evaluate(s.input, s.context).level, 'review');
});
test('reject trailing calldata rather than ignoring unanalysed bytes', () => {
  const s = get('limited'); assert.throws(() => parseApproval(`${s.input.transaction.data}00`));
});
test('transfer method is not mistaken for approval', () => {
  assert.throws(() => parseApproval(encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [zeroAddress, 1n] })));
});
test('raw amounts survive beyond Number.MAX_SAFE_INTEGER', () => {
  const s = get('limited'); const amount = 10000000000000000000000001n;
  s.input.transaction.data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [zeroAddress, amount] });
  assert.equal(evaluate(s.input, s.context).amount, amount.toString());
});
