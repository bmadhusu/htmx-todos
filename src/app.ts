import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

/** Written by CI next to the uploaded source, immediately before `railway up`. */
export const COMMIT_FILE = new URL('../.commit', import.meta.url);

/**
 * Validated at the boundary rather than escaped at render: the version is
 * interpolated into HTML, and a commit SHA has an exact known shape, so anything
 * that is not one is not a version worth reporting.
 */
export function readVersion(raw: string | undefined): string {
  return raw !== undefined && /^[0-9a-f]{7,40}$/i.test(raw) ? raw : 'dev';
}

/**
 * Resolve the running commit from, in order: the .commit file CI writes beside
 * the source, then Railway's own git metadata, then 'dev'.
 *
 * The file exists because Railway injects RAILWAY_GIT_COMMIT_SHA only for
 * deploys it triggers from GitHub. Deploying from CI with `railway up` uploads
 * source with no git metadata, so the commit has to travel with the upload or
 * /healthz cannot identify what is running.
 */
export function resolveVersion(
  env: NodeJS.ProcessEnv = process.env,
  commitFile: URL = COMMIT_FILE,
): string {
  let fromFile: string | undefined;
  try {
    fromFile = readFileSync(commitFile, 'utf8').trim();
  } catch {
    fromFile = undefined;
  }

  const fromEnv = readVersion(env.RAILWAY_GIT_COMMIT_SHA);
  const resolved = readVersion(fromFile);
  return resolved !== 'dev' ? resolved : fromEnv;
}

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
  <p>The delivery path works, end to end. Features start arriving in FD-002.</p>
  <p style="color: #6b6b6b;">Running version <code>${version}</code>.</p>
</body>
</html>`),
  );

  return app;
}
