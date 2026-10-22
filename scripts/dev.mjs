import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
if (!existsSync('snap/dist/bundle.js')) {
  console.error('Build the project first: npm run build'); process.exit(1);
}
const children = [];
let stopping = false;
function shutdown(code = 0) { if (stopping) return; stopping = true; for (const child of children) child.kill('SIGTERM'); setTimeout(() => process.exit(code), 400).unref(); }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => shutdown());
function start(name, args) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env }); children.push(child);
  child.on('error', error => { console.error(`${name}: ${error.message}`); shutdown(1); });
  child.on('exit', code => { if (!stopping) { console.error(`${name} exited (${code}).`); shutdown(code ?? 1); } });
}
start('API', ['--import', 'tsx', 'src/server/index.ts']);
let ready = false;
for (let attempt = 0; attempt < 50 && !stopping; attempt++) {
  try { const response = await fetch('http://127.0.0.1:8787/api/health', { signal: AbortSignal.timeout(500) }); if (response.ok && (await response.json()).version === '0.4.1') { ready = true; break; } }
  catch { /* Wait for the API before starting the webpage. */ }
  await new Promise(resolve => setTimeout(resolve, 150));
}
if (!ready) { console.error('WalletShield API did not become ready.'); shutdown(1); }
else if (!stopping) {
  start('WEB', ['node_modules/vite/bin/vite.js', '--config', 'vite.config.ts']);
  start('SNAP', ['scripts/serve-snap.mjs']);
}
