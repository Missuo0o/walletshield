import type { Analysis } from './types.js';
import { operationLabel, outcomeLabel } from './presentation.js';

const short = (value?: string) => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—';

export function searchHistory(record: Analysis, query: string, displayedTime: string): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  const fields = [displayedTime, operationLabel(record), record.token?.symbol || 'Unverified token',
    record.amount === '0' ? 'Allowance set to zero' : record.unlimited ? 'Unlimited allowance' : record.formattedAmount || 'Amount not decoded',
    record.title, outcomeLabel(record), record.source === 'demo' ? 'Demo data' : 'Local RPC', short(record.spender)];
  // Short numbers search visible text. Pasted addresses and meaningful ID
  // prefixes also search full values without another UI control.
  if (/^0x[\da-f]{4,}$/.test(text) || /^[\da-f]{8,}$/.test(text)) fields.push(record.spender || '');
  if (/^[\da-f]{8}(?:-[\da-f]*){0,4}$/.test(text)) {
    fields.push(record.id, ...(record.relatedChecks ?? []).map(check => check.id));
  }
  return text.split(/\s+/).every(term => fields.some(value => value.toLowerCase().includes(term)));
}
