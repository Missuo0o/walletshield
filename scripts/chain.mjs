import { spawn } from 'node:child_process';
const hostedLab=process.env.WALLETSHIELD_SERVICE_MODE==='hosted'&&process.env.WALLETSHIELD_ENABLE_TEST_LAB==='1';
const port=hostedLab?'8546':'8545',chainId=hostedLab?'31338':'31337';
const child = spawn(process.execPath, ['node_modules/@foundry-rs/anvil/bin.mjs', '--host', '127.0.0.1', '--port', port, '--chain-id', chainId, '--silent',...(hostedLab?['--state','.local/test-lab-state.json','--state-interval','30']:[])], { stdio: 'inherit', env: { ...process.env, RUST_LOG: process.env.RUST_LOG ?? 'error' } });
console.log(`WalletShield test chain: http://127.0.0.1:${port} (chain ${chainId}). Test funds only.`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
