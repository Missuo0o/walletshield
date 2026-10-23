import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// One authoritative backend owns budgets, rate limits and request state.
export default defineConfig({
  root: 'web', plugins: [react()],
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    // Shared source imports expand Vite's workspace access beyond web/. Keep
    // backend credentials, reports and private audit files off /@fs routes.
    fs: { deny: ['**/.local/**','**/.audit-build/**','**/.presentation-build/**','**/.git/**','**/.env','**/.env.*','**/*.{crt,pem,key,p12,pfx,token}','**/*.{sqlite,sqlite3,db}','**/*.{sqlite,sqlite3,db}-*'] },
    proxy: { '/api': 'http://127.0.0.1:8787' }
  },
  build: { outDir: '../dist/web', emptyOutDir: true }
});
