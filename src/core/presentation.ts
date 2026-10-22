import type { Analysis } from './types.js';

export function operationLabel(record: Pick<Analysis, 'operation' | 'amount' | 'unlimited'>): string {
  if (record.operation !== 'approve') return 'Unsupported operation';
  if (record.amount === undefined) return 'Allowance amount not decoded';
  if (record.amount === '0') return 'Revoke allowance';
  if (record.unlimited) return 'Very large allowance';
  return 'Limited allowance';
}

export function outcomeLabel(record: Pick<Analysis, 'execution'>): string {
  switch (record.execution?.status) {
    case 'pending': return 'No wallet outcome received';
    case 'rejected': return 'Canceled, as reported by the wallet';
    case 'submitted': return 'Submitted · Awaiting confirmation';
    case 'confirmed': return 'On-chain execution succeeded';
    case 'reverted': return 'On-chain execution reverted';
    case 'error': return 'Request error · Outcome unknown';
    default: return 'Outcome unknown';
  }
}
