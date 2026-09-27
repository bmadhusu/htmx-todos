import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildApp, readVersion, resolveVersion } from '../src/app.ts';

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
  const dir = await mkdtemp(join(tmpdir(), 'commit-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const file = join(dir, '.commit');
  await writeFile(file, 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n');

  // The file wins over Railway's variable, since a CLI deploy carries no git metadata.
  assert.equal(
    resolveVersion({ RAILWAY_GIT_COMMIT_SHA: 'beef123' }, pathToFileURL(file)),
    'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  );

  // A missing file falls back to the environment, then to 'dev'.
  const absent = pathToFileURL(join(dir, 'nope'));
  assert.equal(resolveVersion({ RAILWAY_GIT_COMMIT_SHA: 'beef123' }, absent), 'beef123');
  assert.equal(resolveVersion({}, absent), 'dev');

  // A junk file is rejected exactly as a junk env var is.
  const junk = join(dir, 'junk');
  await writeFile(junk, '<script>alert(1)</script>');
  assert.equal(resolveVersion({}, pathToFileURL(junk)), 'dev');
});

test('.commit is not gitignored, because `railway up` would silently drop it', async () => {
  const ignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  const entries = ignore
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

  // `railway up` excludes gitignored files from the upload with no error. If
  // .commit were ignored, /healthz would report 'dev' in production and
  // verify-deploy would fail five minutes later with no obvious cause.
  assert.ok(
    !entries.some((entry) => entry === '.commit' || entry === '/.commit' || entry === '*.commit'),
    'adding .commit to .gitignore breaks version reporting in production',
  );
});
