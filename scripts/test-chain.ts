import assert from 'node:assert/strict';
import { createWalletClient, http, erc20Abi, maxUint256, encodeFunctionData, parseEther, zeroAddress } from 'viem';
import { foundry } from 'viem/chains';
import { localClient, readDeployment, collectContext } from '../src/server/chain.js';
import { evaluate } from '../src/core/engine.js';
import { prepareLocalFunds } from '../src/server/funding.js';
const deployment = await readDeployment();
assert.ok(deployment, 'Run npm run chain and npm run deploy:local first.');
assert.equal(await localClient.getChainId(), 31337);
const wallet = createWalletClient({ chain: foundry, transport: http('http://127.0.0.1:8545') });
const snapshot = await localClient.request({ method: 'evm_snapshot' as never }) as string;
const write = async (account: `0x${string}`, functionName: 'approve' | 'transferFrom', args: readonly unknown[]) => {
  const hash = await wallet.writeContract({ account, address: deployment.token, abi: erc20Abi, functionName, args: args as never });
  const receipt = await localClient.waitForTransactionReceipt({ hash }); assert.equal(receipt.status, 'success');
};
try {
  const recipient = '0x5555555555555555555555555555555555555555';
  const prepared = await prepareLocalFunds(recipient);
  assert.equal(prepared.eth, parseEther('10').toString());
  assert.equal(prepared.testUsd, '5000000000');
  assert.ok(prepared.mintTransaction);
  const again = await prepareLocalFunds(recipient);
  assert.equal(again.mintTransaction, null, 'Repeated top-up must not keep minting tokens.');
  assert.equal(again.testUsd, '5000000000');
  await localClient.request({ method: 'anvil_setBalance' as never, params: [recipient, '0x1158e460913d00000'] as never });
  assert.equal((await prepareLocalFunds(recipient)).eth, parseEther('20').toString(), 'Funding must not reduce an existing higher balance.');
  await assert.rejects(() => prepareLocalFunds(zeroAddress));
  const newAccountInput = { chainId: 31337, transaction: { from: recipient, to: deployment.token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [deployment.spender, maxUint256] }), value: '0x0' } };
  assert.equal((await collectContext(newAccountInput)).balance, '5000000000', 'Analysis uses the funded wallet address rather than the default owner.');
  const input = { chainId: 31337, transaction: { from: deployment.owner, to: deployment.token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [deployment.spender, maxUint256] }), value: '0x0' } };
  const before = await localClient.readContract({ address: deployment.token, abi: erc20Abi, functionName: 'balanceOf', args: [deployment.owner] });
  const context = await collectContext(input);
  assert.equal(context.simulation.status, 'passed'); assert.equal(context.balance, before.toString());
  assert.equal(evaluate(input, context).level, 'review');
  await write(deployment.owner, 'approve', [deployment.spender, maxUint256]);
  assert.equal(await localClient.readContract({ address: deployment.token, abi: erc20Abi, functionName: 'balanceOf', args: [deployment.owner] }), before, 'Approval alone does not move tokens.');
  await write(deployment.spender, 'transferFrom', [deployment.owner, deployment.spender, 1000000000n]);
  assert.equal(await localClient.readContract({ address: deployment.token, abi: erc20Abi, functionName: 'balanceOf', args: [deployment.owner] }), before - 1000000000n, 'Spender can later transfer without another owner signature.');
  await write(deployment.owner, 'approve', [deployment.spender, 0n]);
  await assert.rejects(() => localClient.simulateContract({ account: deployment.spender, address: deployment.token, abi: erc20Abi, functionName: 'transferFrom', args: [deployment.owner, deployment.spender, 1n] }));
  const malformed = await collectContext({ ...input, chainId: 1 }); assert.equal(evaluate({ ...input, chainId: 1 }, malformed).complete, false);
  console.log('PASS: new-account test funding, repeat top-up, preservation of higher balances, zero-address rejection, correct account analysis, approval/transfer/revocation, and unsupported-chain handling.');
} finally {
  const reverted = await localClient.request({ method: 'evm_revert' as never, params: [snapshot] as never });
  assert.equal(reverted, true, 'Local test state must be restored.');
}
