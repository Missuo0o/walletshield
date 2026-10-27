import {LAB_CHAIN_ID,LAB_RPC_URL,LAB_CHAIN} from '../testing/network.js';
import { createWalletClient, http, parseEther, toHex, zeroAddress, erc20Abi, keccak256, isAddress } from 'viem';
import { localClient, localStatus, RPC_URL } from './chain.js';

const faucetAbi = [{ type: 'function', name: 'faucet', stateMutability: 'nonpayable', inputs: [{ name: 'recipient', type: 'address' }], outputs: [{ name: 'minted', type: 'uint256' }] }] as const;
export async function prepareLocalFunds(address: string) {
  if (!isAddress(address, { strict: false }) || address.toLowerCase() === zeroAddress) throw new Error('Invalid test recipient address.');
  const status = await localStatus();
  if (!status.ready || !status.deployment) throw new Error('Run the launcher again to prepare the local chain and current test contracts.');
  const version = await localClient.request({ method: 'web3_clientVersion' });
  if (!version.toLowerCase().includes('anvil')) throw new Error('Test funding is allowed only on the local Anvil node.');
  // Recheck immediately before mutations; network and RPC URL are never supplied by the browser.
  if (await localClient.getChainId() !== LAB_CHAIN_ID) throw new Error(`Operation refused: the node is not on local chain ${LAB_CHAIN_ID}.`);
  const { token, owner, tokenCodeHash } = status.deployment;
  const code = await localClient.getCode({ address: token });
  if (!code || keccak256(code) !== tokenCodeHash) throw new Error('Local contract mismatch. Run the launcher again.');
  const recipient = address as `0x${string}`;
  // Preflight the new faucet before touching ETH, so old deployments fail clearly.
  await localClient.simulateContract({ account: owner, address: token, abi: faucetAbi, functionName: 'faucet', args: [recipient] });
  const wallet = createWalletClient({ chain: LAB_CHAIN, transport: http(RPC_URL, { timeout: 5000, retryCount: 0 }) });
  // The local fixture administrator may itself have been cleared by the user.
  // Restore only its test gas; never depend on a real wallet or a public RPC.
  if(owner.toLowerCase()!==recipient.toLowerCase()&&await localClient.getBalance({address:owner})<parseEther('1'))await localClient.request({method:'anvil_setBalance' as never,params:[owner,toHex(parseEther('1'))] as never});
  const ethBefore = await localClient.getBalance({ address: recipient });
  if (ethBefore < parseEther('10')) {
    await localClient.request({ method: 'anvil_setBalance' as never, params: [recipient, toHex(parseEther('10'))] as never });
  }
  const tokenBefore = await localClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [recipient] });
  let mintTransaction: `0x${string}` | null = null;
  if (tokenBefore < 5000000000n) {
    mintTransaction = await wallet.writeContract({ account: owner, address: token, abi: faucetAbi, functionName: 'faucet', args: [recipient] });
    const receipt = await localClient.waitForTransactionReceipt({ hash: mintTransaction, timeout: 5000 });
    if (receipt.status !== 'success') throw new Error('Test token funding failed. Retry and check the on-chain balance.');
  }
  // When funding the node administrator, its own faucet transaction spends gas.
  // Replenish after that transaction too, rather than failing a successful top-up.
  if(await localClient.getBalance({address:recipient})<parseEther('10'))await localClient.request({method:'anvil_setBalance' as never,params:[recipient,toHex(parseEther('10'))] as never});
  const [eth, testUsd] = await Promise.all([
    localClient.getBalance({ address: recipient }),
    localClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [recipient] })
  ]);
  if (eth < parseEther('10') || testUsd < 5000000000n) throw new Error('Balance verification failed, possibly because of concurrent transactions. Retry.');
  return { chainId: LAB_CHAIN_ID, address: recipient, token, eth: eth.toString(), testUsd: testUsd.toString(), mintTransaction, source: 'local-anvil' as const };
}
