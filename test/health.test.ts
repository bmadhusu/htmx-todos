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

test('the commit is read from the .commit file CI writes beside the source', async (t) => {
  const { resolveVersion } = await import('../src/app.ts');
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');

  const dir = await mkdtemp(join(tmpdir(), 'commit-'));
  const file = join(dir, '.commit');
  await writeFile(file, 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n');
  const url = pathToFileURL(file);

  // The file wins over Railway's variable, since a CLI deploy has no git metadata.
  assert.equal(resolveVersion({ RAILWAY_GIT_COMMIT_SHA: 'beef123' }, url), 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2');

  // Missing file falls back to the environment, then to 'dev'.
  const absent = pathToFileURL(join(dir, 'nope'));
  assert.equal(resolveVersion({ RAILWAY_GIT_COMMIT_SHA: 'beef123' }, absent), 'beef123');
  assert.equal(resolveVersion({}, absent), 'dev');

  // A junk file is rejected the same way a junk env var is.
  const junk = join(dir, 'junk');
  await writeFile(junk, '<script>alert(1)</script>');
  assert.equal(resolveVersion({}, pathToFileURL(junk)), 'dev');

  t.diagnostic(`checked ${dir}`);
});
