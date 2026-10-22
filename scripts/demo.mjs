import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
const ports = [8545, 8787, 8080, 5173];
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return; stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 600).unref();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
function portInUse(port) {
  return new Promise(resolve => { const socket = createConnection({ host: '127.0.0.1', port }); socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false)); socket.once('timeout', () => { socket.destroy(); resolve(false); }); });
}
for (const port of ports) if (await portInUse(port)) { console.error(`Port ${port} is already in use. Stop the previous local session before npm run demo.`); process.exit(1); }
function start(args) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env }); children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  return child;
}
const chain = start(['scripts/chain.mjs']);
chain.on('exit', () => { if (!stopping) stop(1); });
let ready = false;
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:8545', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), signal: AbortSignal.timeout(1000) });
    if ((await response.json()).result === '0x7a69') { ready = true; break; }
  } catch { /* Wait for the owned local node. */ }
  await new Promise(resolve => setTimeout(resolve, 200));
}
if (!ready) { console.error('Anvil did not start.'); stop(1); }
else {
  const deploy = start(['--import', 'tsx', 'scripts/deploy.ts']);
  const deployed = await new Promise(resolve => deploy.once('exit', code => resolve(code === 0)));
  if (!deployed) stop(1);
  else {
    const dev = start(['scripts/dev.mjs']);
    dev.once('exit', code => { if (!stopping) stop(code ?? 1); });
    console.log('\nOpen http://127.0.0.1:5173/ — Ctrl+C stops all owned services.\n');
  }
}
