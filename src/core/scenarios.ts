import { encodeFunctionData, erc20Abi, maxUint256 } from 'viem';
import type { Scenario, Context } from './types.js';
export const DEMO_TOKEN = '0x1111111111111111111111111111111111111111';
export const DEMO_OWNER = '0x2222222222222222222222222222222222222222';
export const DEMO_SPENDER = '0x3333333333333333333333333333333333333333';
export const BLOCKED_SPENDER = '0x4444444444444444444444444444444444444444';
const context: Context = {
  source: 'demo', blockNumber: 'Demo snapshot', token: { address: DEMO_TOKEN, symbol: 'TEST-USD', decimals: 6 },
  balance: '5000000000', allowance: '0', reputation: 'test-allowed', reputationSource: 'WalletShield fixed demo list',
  simulation: { status: 'passed', detail: 'Preset sample: successful call. No blockchain node was queried and no transaction was simulated.' }
};
function scenario(id: string, name: string, description: string, tag: string, amount: bigint, overrides: Partial<Context> = {}, spender = DEMO_SPENDER): Scenario {
  return { id, name, description, tag, input: { chainId: 31337, origin: 'https://demo.walletshield.example', transaction: {
    from: DEMO_OWNER, to: DEMO_TOKEN, value: '0x0', data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender as `0x${string}`, amount] })
  } }, context: { ...context, ...overrides } };
}
export const scenarios: Scenario[] = [
  scenario('unlimited', 'Very large allowance', 'An unknown address requests an unlimited allowance against a current balance of 5,000 TEST-USD.', 'Authority risk', maxUint256, { reputation: 'unknown', reputationSource: 'No external address reputation data' }),
  scenario('limited', 'Limited allowance', 'Approve 100 TEST-USD for an address in the local test list.', 'Comparison sample', 100000000n),
  scenario('revoke', 'Revoke token allowance', 'Set the selected spender allowance to zero and check that revocation is recognized.', 'Authority reduction', 0n),
  scenario('blocked', 'Test risk address', 'A finite allowance can still be risky: the spender matches a preset test list.', 'Test-list match', 100000000n, { reputation: 'test-blocked', reputationSource: 'Project test list v1' }, BLOCKED_SPENDER),
  scenario('unavailable', 'Check service unavailable', 'A failed node query must produce an explicit incomplete assessment.', 'Failure handling', 100000000n, { token: undefined, balance: undefined, allowance: undefined, error: 'Preset scenario: RPC query timed out.', simulation: { status: 'unavailable', detail: 'Not run: preset RPC timeout.' } }),
  { ...scenario('unsupported', 'Unsupported request', 'An unsupported method or message must not be displayed as a completed check.', 'Coverage limit', 0n), input: { chainId: 31337, transaction: { from: DEMO_OWNER, to: DEMO_TOKEN, data: '0x12345678', value: '0x0' } } }
];
