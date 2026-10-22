import type { Analysis } from './types.js';

function sameRequest(a: Analysis, b: Analysis): boolean {
  const x = a.input.transaction, y = b.input.transaction;
  try {
    return a.source === 'rpc' && b.source === 'rpc' && a.input.chainId === b.input.chainId &&
      Boolean(a.input.origin) && a.input.origin === b.input.origin &&
      x.from.toLowerCase() === y.from.toLowerCase() && x.to.toLowerCase() === y.to.toLowerCase() &&
      x.data.toLowerCase() === y.data.toLowerCase() && BigInt(x.value ?? '0x0') === BigInt(y.value ?? '0x0');
  } catch { return false; }
}

// A reversible history projection, never a rewrite of execution evidence.
// Legacy Snap calls have no request identifier. Only fold a unique, identical
// check inside a closed wallet-request interval, with the same block and verdict.
// Ambiguous calls and differing findings remain visible as separate records.
export function groupHistory(records: Analysis[]): Analysis[] {
  const parents = records.filter(r => r.execution && r.execution.status !== 'pending');
  const candidates = new Map<string, Analysis[]>();
  const possibleParents = new Map<string, number>();
  for (const parent of parents) {
    const start = Date.parse(parent.createdAt);
    const end = Date.parse(parent.execution!.walletReturnedAt ?? parent.execution!.updatedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 15 * 60 * 1000) continue;
    const matches = records.filter(child => {
      if (child.execution || child.id === parent.id || !sameRequest(parent, child)) return false;
      const checked = Date.parse(child.createdAt);
      return checked > start && checked <= end && parent.blockNumber !== undefined &&
        parent.blockNumber === child.blockNumber && parent.ruleVersion === child.ruleVersion &&
        parent.level === child.level && parent.complete === child.complete &&
        JSON.stringify(parent.checks) === JSON.stringify(child.checks);
    });
    candidates.set(parent.id, matches);
    for (const child of matches) possibleParents.set(child.id, (possibleParents.get(child.id) ?? 0) + 1);
  }
  const attached = new Map<string, Analysis>();
  const folded = new Set<string>();
  for (const parent of parents) {
    const matches = candidates.get(parent.id) ?? [];
    if (matches.length !== 1 || possibleParents.get(matches[0].id) !== 1) continue;
    attached.set(parent.id, matches[0]); folded.add(matches[0].id);
  }
  return records.filter(r => !folded.has(r.id)).map(record => {
    const child = attached.get(record.id);
    return child ? { ...record, relatedChecks: [child], association: {
      method: 'exact-request-window',
      detail: 'The full transaction, origin, queried block and check result match. The check occurred during this wallet request and has one candidate. This association groups the display only; the final outcome comes from the primary wallet report or on-chain receipt.'
    } } : record;
  });
}
