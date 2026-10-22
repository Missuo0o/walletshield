import type { SnapConfig } from '@metamask/snaps-cli';
const config: SnapConfig = {
  input: './src/index.ts',
  output: { path: './dist', filename: 'bundle.js' },
  manifest: { path: './snap.manifest.json', update: true },
  evaluate: true,
  sourceMap: false,
  typescript: { enabled: false },
  server: { port: 8080 }
};
export default config;
