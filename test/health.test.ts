import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, readVersion } from '../src/app.ts';

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

test('the version is only reported when it looks like a commit SHA', () => {
  assert.equal(readVersion('2fb3a0e95d1b12090f3b917b54a0d017d0593ad0'), '2fb3a0e95d1b12090f3b917b54a0d017d0593ad0');
  assert.equal(readVersion('2fb3a0e'), '2fb3a0e');
  assert.equal(readVersion(undefined), 'dev');
  assert.equal(readVersion(''), 'dev');
  assert.equal(readVersion('<script>alert(1)</script>'), 'dev');
  assert.equal(readVersion('not-a-sha'), 'dev');
});
