import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.ts';
import { MemoryStore } from '../src/store/memory.ts';
import { SEED_TITLES } from '../src/session.ts';

async function harness() {
  const store = new MemoryStore();
  const app = await buildApp({ store, cookieSecret: 'test-secret-value-at-least-32-chars', logger: false });
  return { app, store };
}

test('a first visit sets a signed sid cookie', async (t) => {
  const { app } = await harness();
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/healthz' });
  const cookie = res.cookies.find((c) => c.name === 'sid');

  assert.ok(cookie, 'expected a sid cookie');
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, 'Lax');
  assert.equal(cookie.path, '/');
  assert.ok(cookie.value.includes('.'), 'expected a signed value');
});

test('a first visit seeds example todos', async (t) => {
  const { app, store } = await harness();
  t.after(() => app.close());

  await app.inject({ method: 'GET', url: '/healthz' });
  const sessions = store.toJSON();

  assert.equal(sessions.length, 1);
  assert.deepEqual(
    sessions[0]!.todos.map((todo) => todo.title),
    SEED_TITLES,
  );
});

test('an existing cookie reuses the same session and does not reseed', async (t) => {
  const { app, store } = await harness();
  t.after(() => app.close());
  const first = await app.inject({ method: 'GET', url: '/healthz' });
  const cookie = first.cookies.find((c) => c.name === 'sid')!;

  await app.inject({ method: 'GET', url: '/healthz', cookies: { sid: cookie.value } });

  assert.equal(store.toJSON().length, 1);
  assert.equal(store.toJSON()[0]!.todos.length, SEED_TITLES.length);
});

test('a tampered cookie is treated as a first visit, not an error', async (t) => {
  const { app, store } = await harness();
  t.after(() => app.close());

  const res = await app.inject({
    method: 'GET',
    url: '/healthz',
    cookies: { sid: 'forged-value.not-a-real-signature' },
  });

  assert.equal(res.statusCode, 200);
  assert.ok(res.cookies.find((c) => c.name === 'sid'), 'expected a replacement cookie');
  assert.equal(store.toJSON().length, 1);
});

test('a validly signed but unknown session id gets a fresh seeded session', async (t) => {
  const { app, store } = await harness();
  t.after(() => app.close());
  const probe = await app.inject({ method: 'GET', url: '/healthz' });
  const goodCookie = probe.cookies.find((c) => c.name === 'sid')!.value;
  store.fromJSON([]);

  const res = await app.inject({ method: 'GET', url: '/healthz', cookies: { sid: goodCookie } });

  assert.equal(res.statusCode, 200);
  assert.equal(store.toJSON()[0]!.todos.length, SEED_TITLES.length);
});

test('two visitors get separate lists', async (t) => {
  const { app, store } = await harness();
  t.after(() => app.close());

  await app.inject({ method: 'GET', url: '/healthz' });
  await app.inject({ method: 'GET', url: '/healthz' });

  assert.equal(store.toJSON().length, 2);
});
