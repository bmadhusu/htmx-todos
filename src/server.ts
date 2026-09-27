import { buildApp, readVersion } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`PORT must be a positive integer, got ${String(process.env.PORT)}`);
}

const app = await buildApp({ version: readVersion(process.env.RAILWAY_GIT_COMMIT_SHA) });

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
