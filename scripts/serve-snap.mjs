import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const files = { '/snap.manifest.json': ['../snap/snap.manifest.json', 'application/json'], '/dist/bundle.js': ['../snap/dist/bundle.js', 'application/javascript'], '/images/icon.svg': ['../snap/images/icon.svg', 'image/svg+xml'] };
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const entry = files[new URL(req.url, 'http://localhost').pathname];
  if (!entry) { res.writeHead(404); res.end('Not found'); return; }
  try { const content = await readFile(new URL(entry[0], import.meta.url)); res.writeHead(200, { 'Content-Type': entry[1] }); res.end(content); }
  catch { res.writeHead(503); res.end('Build the Snap first: npm run build:snap'); }
});
server.listen(8080, '127.0.0.1', () => console.log('WalletShield Snap: http://127.0.0.1:8080'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
