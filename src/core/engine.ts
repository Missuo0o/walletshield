import { decodeFunctionData, encodeFunctionData, erc20Abi, formatUnits, maxUint256, zeroAddress } from 'viem';
import type { Analysis, AnalysisInput, Context, Check, Level } from './types.js';
import { LEVELS } from './types.js';

export const RULE_VERSION = 'erc20-approval/0.1.0';
export function parseApproval(data: string) {
  const decoded = decodeFunctionData({ abi: erc20Abi, data: data as `0x${string}` });
  if (decoded.functionName !== 'approve') throw new Error('This legacy path supports only ERC-20 approve.');
  // Reject trailing bytes and noncanonical argument layouts instead of interpreting ambiguously.
  if (data.length !== 138) throw new Error('The allowance data length does not match canonical approve encoding.');
  const canonical = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: decoded.args });
  if (canonical.toLowerCase() !== data.toLowerCase()) throw new Error('The allowance parameters are not canonical ABI encoding.');
  return { spender: decoded.args[0], amount: decoded.args[1] };
}

export function evaluate(input: AnalysisInput, context: Context): Omit<Analysis, 'id' | 'createdAt' | 'fingerprint'> {
  const checks: Check[] = [];
  const base = {
    ruleVersion: RULE_VERSION, source: context.source, input,
    token: context.token, balance: context.balance, allowance: context.allowance,
    blockNumber: context.blockNumber, simulation: context.simulation,
    outcome: 'unknown' as const
  };
  let approval: ReturnType<typeof parseApproval>;
  try { approval = parseApproval(input.transaction.data); }
  catch {
    checks.push({ id: 'SUPPORTED_OPERATION', status: 'unknown', title: 'Operation could not be decoded', detail: 'This legacy path supports standard ERC-20 approve only; it does not analyze other operations or message signatures.' });
    return { ...base, operation: 'unsupported', level: 'unknown', title: LEVELS.unknown.label,
      summary: LEVELS.unknown.action, complete: false, checks };
  }
  const { spender, amount } = approval;
  const unlimited = amount === maxUint256;
  checks.push({ id: 'SUPPORTED_OPERATION', status: 'pass', title: 'Approval request decoded', detail: `Spender ${spender}; raw allowance ${amount.toString()}.` });
  if (context.error) checks.push({ id: 'CHAIN_CONTEXT', status: 'unknown', title: 'Incomplete on-chain context', detail: context.error });
  if (context.balance === undefined || context.allowance === undefined) checks.push({ id: 'ACCOUNT_STATE', status: 'unknown', title: 'Incomplete account state', detail: 'The current balance or existing allowance is missing; this check is incomplete.' });
  if (!context.token || context.token.address.toLowerCase() !== input.transaction.to.toLowerCase()) {
    checks.push({ id: 'TOKEN_IDENTITY', status: 'unknown', title: 'Token identity unverified', detail: 'Matching function encoding does not establish a trusted token. This legacy path fully supports only the deployed local test token.' });
  } else {
    checks.push({ id: 'TOKEN_IDENTITY', status: 'pass', title: 'Token information checked', detail: `${context.token.symbol} · ${context.token.address}; identify a token by its contract address. A name is not proof of trust.` });
  }
  if (BigInt(input.transaction.value || '0x0') !== 0n) {
    checks.push({ id: 'NATIVE_VALUE', status: 'risk', title: 'Approval also carries native currency', detail: 'The request includes extra native value outside the ordinary approval supported by this legacy path.' });
  }
  if (amount === 0n) {
    checks.push({ id: 'APPROVAL_SCOPE', status: 'pass', title: 'Revoke this spender allowance', detail: 'This request sets this spender allowance to zero; other spenders retain their permissions.' });
  } else {
    checks.push({ id: 'APPROVAL_SCOPE', status: unlimited ? 'warning' : 'pass', title: unlimited ? 'Very large allowance requested' : 'Limited allowance',
      detail: unlimited ? 'The amount is the uint256 maximum, commonly called unlimited. Exposure can include current and future holdings of this token.' : 'Check that this amount matches the intended use. A finite allowance can still be abused.' });
    if (context.balance !== undefined && amount > BigInt(context.balance) && !unlimited) {
      checks.push({ id: 'OVER_BALANCE', status: 'warning', title: 'Allowance exceeds current balance', detail: 'The permission can also apply to future holdings of this token. Verify its purpose.' });
    }
  }
  if (spender.toLowerCase() === zeroAddress) checks.push({ id: 'ZERO_SPENDER', status: 'warning', title: 'Spender is the zero address', detail: 'Check the address. Setting an allowance for the zero address does not revoke another spender.' });
  if (amount === 0n) {
    checks.push({ id: 'SPENDER_IDENTITY', status: 'pass', title: 'No additional spending authority', detail: `Address observation: ${context.reputationSource}.` });
  } else if (context.reputation === 'test-blocked') {
    checks.push({ id: 'SPENDER_IDENTITY', status: 'risk', title: 'Test risk-list match', detail: `${context.reputationSource}; this is a preset test label, not external threat intelligence.` });
  } else if (context.reputation === 'unknown') {
    checks.push({ id: 'SPENDER_IDENTITY', status: unlimited ? 'risk' : 'warning', title: 'Spender identity unverified', detail: `${context.reputationSource}. ${unlimited ? 'The very large allowance increases authority exposure. This is not proof of fraud.' : 'Independently verify the address and intended use.'}` });
  } else {
    checks.push({ id: 'SPENDER_IDENTITY', status: 'pass', title: 'Local test address matched', detail: `${context.reputationSource}; this label does not establish public-network address safety.` });
  }
  checks.push({ id: 'CALL_CHECK', status: context.simulation.status === 'passed' ? 'pass' : 'unknown', title: context.simulation.status === 'passed' ? 'Basic call check succeeded' : 'Basic call check incomplete', detail: context.simulation.detail });
  const complete = !checks.some(c => c.status === 'unknown');
  const level: Level = checks.some(c => c.status === 'risk') ? 'high' : !complete ? 'unknown' : checks.some(c => c.status === 'warning') ? 'review' : 'low';
  const formattedAmount = context.token ? formatUnits(amount, context.token.decimals) : undefined;
  return { ...base, operation: 'approve', spender, amount: amount.toString(), formattedAmount, unlimited, checks, complete, level,
    title: LEVELS[level].label,
    summary: !context.token ? `An approve request was decoded, but token identity and decimals are unverified. The raw allowance integer is ${amount.toString()} and is not a decimal token quantity. ${LEVELS[level].action}` : amount === 0n ? 'This request sets this spender token allowance to zero. Check the network, token contract and spender.' :
      `This operation grants ${spender} ${unlimited ? 'a very large amount of' : formattedAmount} ${context.token?.symbol ?? 'tokens'} spending authority. While the allowance is valid and sufficient, the spender can transfer these tokens without separate confirmation for each transfer. ${LEVELS[level].action}`
  };
}
