import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

export type AppDeps = {
  /**
   * The commit this process is running. Surfaced by /healthz so a deploy can be
   * identified, not merely detected. Falls back to 'dev' outside Railway.
   */
  version?: string;
};

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const version = deps.version ?? 'dev';

  app.get('/healthz', async () => ({ status: 'ok', version }));

  // Placeholder shell, replaced by the real Nunjucks page in FD-002. It exists
  // so the tracer bullet has something visible at the root URL.
  app.get('/', async (_request, reply) =>
    reply.type('text/html; charset=utf-8').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>htmx todos</title>
</head>
<body style="font: 16px/1.5 ui-sans-serif, system-ui, sans-serif; margin: 3rem auto; max-width: 34rem; padding: 0 1rem;">
  <h1>htmx todos</h1>
  <p>The delivery path works. Features start arriving in FD-002.</p>
  <p style="color: #6b6b6b;">Running version <code>${version}</code>.</p>
</body>
</html>`),
  );

  return app;
}
