export type Level = 'low' | 'review' | 'high' | 'unknown';
export type Execution = {
  status: 'pending' | 'rejected' | 'submitted' | 'confirmed' | 'reverted' | 'error';
  evidence: 'workbench' | 'wallet-response' | 'chain-receipt';
  updatedAt: string;
  walletReturnedAt?: string;
  transactionHash?: `0x${string}`;
  blockNumber?: string;
  blockHash?: string;
};
export type Transaction = { from: string; to: string; data: string; value?: string };
export type AnalysisInput = { chainId: number; transaction: Transaction; origin?: string };
export type Check = { id: string; status: 'pass' | 'warning' | 'risk' | 'unknown'; title: string; detail: string };
export type Context = {
  source: 'demo' | 'rpc';
  blockNumber?: string;
  token?: { address: string; symbol: string; decimals: number };
  balance?: string;
  allowance?: string;
  reputation: 'test-allowed' | 'test-blocked' | 'unknown';
  reputationSource: string;
  simulation: { status: 'passed' | 'failed' | 'unavailable'; detail: string };
  error?: string;
};
export type Analysis = {
  id: string; createdAt: string; ruleVersion: string;
  source: 'demo' | 'rpc'; input: AnalysisInput;
  level: Level; title: string; summary: string;
  complete: boolean; checks: Check[];
  operation: 'approve' | 'unsupported';
  token?: Context['token']; spender?: string;
  amount?: string; formattedAmount?: string; unlimited?: boolean;
  balance?: string; allowance?: string; blockNumber?: string;
  simulation: Context['simulation'];
  fingerprint: string;
  outcome: 'unknown' | Execution['status'];
  execution?: Execution;
  relatedChecks?: Analysis[];
  association?: { method: 'exact-request-window'; detail: string };
  demoEvents?: { action: string; createdAt: string }[];
};
export type Scenario = { id: string; name: string; description: string; tag: string; input: AnalysisInput; context: Context };
export const LEVELS: Record<Level, { label: string; action: string }> = {
  low: { label: 'No clear risk observed', action: 'Check the address and purpose, then decide in your wallet whether to continue.' },
  review: { label: 'Needs review', action: 'Verify the spender and amount. Prefer an allowance that matches your intended use.' },
  high: { label: 'High risk', action: 'Consider rejecting this request in your wallet and independently verify the spender.' },
  unknown: { label: 'Unable to assess', action: 'The check is incomplete. Do not treat this result as confirmation of safety.' }
};
