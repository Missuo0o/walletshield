import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['node_modules/@foundry-rs/anvil/bin.mjs', '--host', '127.0.0.1', '--port', '8545', '--chain-id', '31337', '--silent'], { stdio: 'inherit', env: { ...process.env, RUST_LOG: process.env.RUST_LOG ?? 'error' } });
console.log('WalletShield local test chain: http://127.0.0.1:8545 (chain 31337). Test funds only.');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
