import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import view from '@fastify/view';
import nunjucks from 'nunjucks';
import { sessionPlugin } from './session.ts';
import { registerErrorHandler } from './lib/error-handler.ts';
import { pagesRoutes } from './routes/pages.ts';
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
  // Autoescaping is configured explicitly rather than relied on as a default:
  // todo titles are user input rendered straight back into HTML.
  await app.register(view, {
    engine: { nunjucks },
    root: fileURLToPath(new URL('../views', import.meta.url)),
    options: { autoescape: true },
  });
  await app.register(fastifyStatic, {
    root: fileURLToPath(new URL('../public', import.meta.url)),
    prefix: '/static/',
  });
  await app.register(sessionPlugin, { store: deps.store });

  registerErrorHandler(app);
  pagesRoutes(app, deps.store);

  app.get('/healthz', async () => ({ status: 'ok', version }));

  return app;
}
