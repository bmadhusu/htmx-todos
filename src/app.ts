import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import { sessionPlugin } from './session.ts';
import type { TodoStore } from './store/types.ts';

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
  let contents: string | undefined;
  try {
    contents = readFileSync(commitFile, 'utf8').trim();
  } catch {
    contents = undefined;
  }

  const fromFile = readVersion(contents);
  return fromFile !== 'dev' ? fromFile : readVersion(env.RAILWAY_GIT_COMMIT_SHA);
}

export type AppDeps = {
  store: TodoStore;
  /** Signs the session cookie. Required in production; see lib/config.ts. */
  cookieSecret: string;
  /**
   * The commit this process is running. Surfaced by /healthz so a deploy can be
   * identified, not merely detected. Falls back to 'dev' outside Railway.
   */
  version?: string;
  /** Tests pass false to keep the output readable. */
  logger?: FastifyServerOptions['logger'];
};

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  // The logger is on by default: the error handler logs unexpected failures on
  // its 500 path, and with `logger: false` those calls succeed silently, which
  // would discard every production error.
  const app = Fastify({
    logger: deps.logger ?? { level: process.env.LOG_LEVEL ?? 'info' },
  });
  const version = deps.version ?? 'dev';

  await app.register(cookie, { secret: deps.cookieSecret });
  await app.register(formbody);
  await app.register(sessionPlugin, { store: deps.store });

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
