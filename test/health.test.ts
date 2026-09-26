import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.ts';

test('GET /healthz reports ok and the running version', async (t) => {
  const app = await buildApp({ version: 'abc123' });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/healthz' });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: 'ok', version: 'abc123' });
});

test('the version falls back to dev when no commit is available', async (t) => {
  const app = await buildApp({});
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/healthz' });

  assert.equal(res.json().version, 'dev');
});

test('GET / serves a shell page that names the app', async (t) => {
  const app = await buildApp({});
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/' });

  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'] as string, /text\/html/);
  assert.match(res.body, /htmx todos/);
});
