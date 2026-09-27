import { buildApp, resolveVersion } from './app.ts';
import { MemoryStore } from './store/memory.ts';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`PORT must be a positive integer, got ${String(process.env.PORT)}`);
}

// Validated configuration and snapshot persistence arrive with FD-007; until
// then the store is in-memory only and the secret has a development default.
const store = new MemoryStore();
const cookieSecret = process.env.COOKIE_SECRET ?? 'dev-only-secret-not-for-production!!';

const app = await buildApp({ store, cookieSecret, version: resolveVersion() });

// Railway routes to the container's port, so binding localhost would leave every
// request unanswered while the deploy itself looks healthy.
await app.listen({ host: '0.0.0.0', port });
console.log(`listening on http://0.0.0.0:${port}`);

let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await app.close();
    } catch (error) {
      console.error('error during shutdown', error);
      process.exitCode = 1;
    } finally {
      process.exit(process.exitCode ?? 0);
    }
  });
}
