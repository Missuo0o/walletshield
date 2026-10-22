import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Analysis, AnalysisInput, Execution } from '../core/types.js';
import { localClient, localStatus } from './chain.js';
import type { Store } from './store.js';
import { groupHistory } from '../core/history.js';

const origins = ['http://127.0.0.1:5173', 'http://localhost:5173'];
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export type ReceiptEvidence = {
  from: string; to: string | null; input: string; value: bigint;
  hash: string; status: 'success' | 'reverted'; blockNumber: bigint; blockHash: string;
};
export async function readReceipt(hash: `0x${string}`): Promise<ReceiptEvidence | null> {
  if (await localClient.getChainId() !== 31337) throw new Error('Wrong chain');
  try {
    const [tx, receipt] = await Promise.all([localClient.getTransaction({ hash }), localClient.getTransactionReceipt({ hash })]);
    // Recheck the canonical block so an orphaned receipt is not accepted.
    const block = await localClient.getBlock({ blockNumber: receipt.blockNumber });
    if (block.hash !== receipt.blockHash || tx.blockHash !== receipt.blockHash) return null;
    return { from: tx.from, to: tx.to, input: tx.input, value: tx.value, hash: receipt.transactionHash,
      status: receipt.status, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash };
  } catch { return null; }
}
export function receiptMatches(record: Analysis, hash: string, receipt: ReceiptEvidence) {
  const tx = record.input.transaction;
  return record.input.chainId === 31337 && receipt.hash.toLowerCase() === hash.toLowerCase() &&
    receipt.from.toLowerCase() === tx.from.toLowerCase() && receipt.to?.toLowerCase() === tx.to.toLowerCase() &&
    receipt.input.toLowerCase() === tx.data.toLowerCase() && receipt.value === BigInt(tx.value ?? '0x0') &&
    record.blockNumber !== undefined && receipt.blockNumber > BigInt(record.blockNumber);
}

export function registerWorkflow(app: FastifyInstance, store: Store, options: {
  analyze: (input: AnalysisInput) => Promise<Analysis>;
  parse: (body: unknown) => AnalysisInput | null;
  receipt?: (hash: `0x${string}`) => Promise<ReceiptEvidence | null>;
}) {
  const receiptProvider = options.receipt ?? readReceipt;
  const refreshing = new Set<string>();
  let receiptCursor = 0;
  app.get('/api/workflow/local', async () => localStatus());
  async function decorated(record: Analysis): Promise<Analysis> {
    let execution = store.execution(record.id);
    if (execution?.status === 'submitted' && execution.transactionHash && !refreshing.has(record.id)) {
      refreshing.add(record.id);
      try {
        const receipt = await receiptProvider(execution.transactionHash);
        if (receipt && receiptMatches(record, execution.transactionHash, receipt)) {
          execution = { ...execution, status: receipt.status === 'success' ? 'confirmed' : 'reverted',
            evidence: 'chain-receipt', updatedAt: new Date().toISOString(), blockNumber: String(receipt.blockNumber), blockHash: receipt.blockHash };
          store.updateExecution(record.id, execution);
        }
      } catch { /* A missing RPC response never confirms a transaction. */ }
      finally { refreshing.delete(record.id); }
    }
    return { ...record, outcome: execution?.status ?? 'unknown', ...(execution ? { execution } : {}), demoEvents: store.events(record.id) as Analysis['demoEvents'] };
  }
  app.get<{ Querystring: { view?: string } }>('/api/workflow/records', async request => {
    const records = store.history();
    // Return the persisted snapshot immediately; refresh submitted receipts in
    // the background so an unavailable node cannot freeze the history screen.
    const pending = records.filter(r => store.execution(r.id)?.status === 'submitted');
    const offset = pending.length ? receiptCursor++ % pending.length : 0;
    for (const record of [...pending.slice(offset), ...pending.slice(0, offset)]) {
      if (refreshing.size >= 3) break;
      void decorated(record);
    }
    const decoratedRecords = records.map((record): Analysis => {
      const execution = store.execution(record.id);
      return { ...record, outcome: execution?.status ?? 'unknown', ...(execution ? { execution } : {}), demoEvents: store.events(record.id) as Analysis['demoEvents'] };
    });
    return (request.query.view === 'checks' ? decoratedRecords : groupHistory(decoratedRecords)).slice(0, 100);
  });
  app.post('/api/workflow/begin', async (request, reply) => {
    if (!origins.includes(request.headers.origin ?? '')) return reply.code(403).send({ error: 'Start wallet requests from the local workbench.' });
    const input = options.parse(request.body);
    if (!input || input.chainId !== 31337) return reply.code(400).send({ error: 'Only valid requests on the local chain are supported.' });
    const record = await options.analyze({ ...input, origin: request.headers.origin });
    if (!record.complete || record.source !== 'rpc' || record.operation !== 'approve') return reply.code(409).send({ error: 'The local check is incomplete. Verify the test chain and retry.' });
    const token = randomBytes(32).toString('hex');
    const execution: Execution = { status: 'pending', evidence: 'workbench', updatedAt: new Date().toISOString() };
    store.track(record.id, digest(token), execution);
    return { id: record.id, token };
  });
  app.post<{ Params: { id: string } }>('/api/workflow/:id/result', async (request, reply) => {
    if (!origins.includes(request.headers.origin ?? '')) return reply.code(403).send({ error: 'Record wallet outcomes from the local workbench.' });
    const parsed = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), status: z.enum(['rejected', 'submitted', 'error']),
      transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional() }).strict().safeParse(request.body);
    if (!parsed.success || (parsed.data.status === 'submitted' && !parsed.data.transactionHash) ||
      (parsed.data.status !== 'submitted' && parsed.data.transactionHash)) return reply.code(400).send({ error: 'Invalid wallet outcome format.' });
    const record = store.get(request.params.id);
    if (!record || !store.authorized(record.id, digest(parsed.data.token))) return reply.code(403).send({ error: 'Invalid request credential.' });
    const current = store.execution(record.id);
    if (current?.status !== 'pending') return reply.code(409).send({ error: 'This request already has an outcome and cannot be overwritten.' });
    const { status, transactionHash } = parsed.data;
    const returnedAt = new Date().toISOString();
    store.updateExecution(record.id, { status, evidence: 'wallet-response', updatedAt: returnedAt, walletReturnedAt: returnedAt,
      ...(transactionHash ? { transactionHash: transactionHash as `0x${string}` } : {}) });
    return decorated(record);
  });
}
