import {LAB_CHAIN_ID,LAB_RPC_URL,LAB_CHAIN} from '../testing/network.js';
import { readFile } from 'node:fs/promises';
import { createPublicClient, http, erc20Abi, keccak256 } from 'viem';
import type { AnalysisInput, Context } from '../core/types.js';
import { parseApproval } from '../core/engine.js';
export const RPC_URL = LAB_RPC_URL;
export const localClient = createPublicClient({ chain: LAB_CHAIN, transport: http(RPC_URL, { timeout: 3500, retryCount: 0 }) });
export type Deployment = { chainId: number; token: `0x${string}`; owner: `0x${string}`; spender: `0x${string}`; tokenCodeHash: string; deployedAt: string };
export async function readDeployment(): Promise<Deployment | null> {
  try { return JSON.parse(await readFile(new URL('../../.local/deployment.json', import.meta.url), 'utf8')); }
  catch { return null; }
}
export async function localStatus() {
  const deployment = await readDeployment();
  try {
    const chainId = await localClient.getChainId();
    if (chainId !== LAB_CHAIN_ID) return { ready: false, message: 'The node chain ID does not match the local configuration.', deployment: null };
    if (!deployment) return { ready: false, message: 'The node is running. Run npm run deploy:local.', deployment: null };
    const code = await localClient.getCode({ address: deployment.token });
    if (!code || keccak256(code) !== deployment.tokenCodeHash) return { ready: false, message: 'The node was reset or its contract does not match. Deploy again.', deployment: null };
    return { ready: true, message: 'The local test chain and token contract are ready.', deployment };
  } catch { return { ready: false, message: 'The local chain is unavailable. Run npm run chain, then deploy the test token.', deployment: null }; }
}
export async function collectContext(input: AnalysisInput): Promise<Context> {
  const context: Context = { source: 'rpc', reputation: 'unknown', reputationSource: 'No external threat intelligence; local test list only',
    simulation: { status: 'unavailable', detail: 'The basic call check has not completed.' } };
  if (input.chainId !== LAB_CHAIN_ID) return { ...context, error: `This legacy approval path supports only local Anvil chain ${LAB_CHAIN_ID} and does not assess other networks.` };
  let decoded: ReturnType<typeof parseApproval>;
  try { decoded = parseApproval(input.transaction.data); } catch { return context; }
  try {
    const deployment = await readDeployment();
    if (!deployment || input.transaction.to.toLowerCase() !== deployment.token.toLowerCase()) return { ...context, error: 'This contract is absent from the local deployment list; its ERC-20 behavior is unverified.' };
    if (await localClient.getChainId() !== LAB_CHAIN_ID) throw new Error('Node chain ID mismatch.');
    const blockNumber = await localClient.getBlockNumber({ cacheTime: 0 });
    context.blockNumber = blockNumber.toString();
    const code = await localClient.getCode({ address: deployment.token, blockNumber });
    if (!code || keccak256(code) !== deployment.tokenCodeHash) throw new Error('Local contract code mismatch. Redeploy the test environment.');
    const contract = { address: deployment.token, abi: erc20Abi, blockNumber } as const;
    const [symbol, decimals, balance, allowance] = await Promise.all([
      localClient.readContract({ ...contract, functionName: 'symbol' }),
      localClient.readContract({ ...contract, functionName: 'decimals' }),
      localClient.readContract({ ...contract, functionName: 'balanceOf', args: [input.transaction.from as `0x${string}`] }),
      localClient.readContract({ ...contract, functionName: 'allowance', args: [input.transaction.from as `0x${string}`, decoded.spender] })
    ]);
    context.token = { address: deployment.token, symbol, decimals };
    context.balance = balance.toString(); context.allowance = allowance.toString();
    if (decoded.spender.toLowerCase() === deployment.spender.toLowerCase()) {
      context.reputation = 'test-allowed'; context.reputationSource = 'Test recipient in the local deployment list; not public-network reputation evidence';
    }
    try {
      const { result } = await localClient.simulateContract({ ...contract, functionName: 'approve', args: [decoded.spender, decoded.amount], account: input.transaction.from as `0x${string}`,
        value: BigInt(input.transaction.value || '0x0') as never });
      context.simulation = result === true
        ? { status: 'passed', detail: `eth_call returned true at block ${blockNumber}. It changed no chain state and does not establish complete asset changes or future behavior.` }
        : { status: 'failed', detail: 'The contract call returned false; successful approval execution is unverified.' };
    } catch { context.simulation = { status: 'failed', detail: 'The basic call failed or reverted. This does not establish transaction safety.' }; }
    return context;
  } catch (error) {
    return { ...context, error: error instanceof Error && error.message.includes('match') ? error.message : 'RPC query failed or timed out. Check the local chain and test contracts.', simulation: { status: 'unavailable', detail: 'On-chain context collection failed; the basic call check is incomplete.' } };
  }
}
