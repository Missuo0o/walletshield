import type { Plugin } from 'vite';
import { resolve } from 'node:path';
import { buildApp } from './app.js';
import { createStore } from './store.js';

// Serve new workflow routes in the existing Vite process. This also lets an
// already-running local demo pick up this feature without restarting its chain.
export function walletWorkflow(): Plugin {
  return {
    name: 'walletshield-workflow', apply: 'serve',
    async configureServer(server) {
      const store = createStore(resolve(process.cwd(), '.local/walletshield.sqlite'));
      const app = await buildApp(store);
      await app.ready();
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/api/workflow/') || req.url?.startsWith('/api/security/') || req.url?.startsWith('/api/lab/')) app.routing(req, res);
        else next();
      });
      server.httpServer?.once('close', () => { void app.close().finally(() => store.close()); });
    }
  };
}
