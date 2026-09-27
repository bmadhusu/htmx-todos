import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, cookiesFor } from './helpers.ts';

test('GET / renders the full page with seeded todos and the count', async (t) => {
  const { app, cookie } = await harness();
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/', cookies: cookiesFor(cookie) });

  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'] as string, /text\/html/);
  assert.match(res.body, /<!doctype html>/i);
  assert.match(res.body, /Try editing this todo/);
  assert.match(res.body, /<span id="count">3 left<\/span>/);
  assert.match(res.body, /src="\/static\/htmx\.min\.js"/);
});

test('GET / escapes HTML in todo titles', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  store.create(sid, '<img src=x onerror=alert(1)>');

  const res = await app.inject({ method: 'GET', url: '/', cookies: cookiesFor(cookie) });

  assert.ok(!res.body.includes('<img src=x'), 'raw markup must not reach the page');
  assert.match(res.body, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('GET / shows an empty state when nothing matches', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  for (const todo of store.list(sid, 'all')) store.remove(sid, todo.id);

  const res = await app.inject({ method: 'GET', url: '/?filter=all', cookies: cookiesFor(cookie) });

  assert.match(res.body, /Nothing here yet/);
  assert.match(res.body, /<span id="count">0 left<\/span>/);
});

test('an unknown filter value falls back to all rather than erroring', async (t) => {
  const { app, cookie } = await harness();
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/?filter=bogus', cookies: cookiesFor(cookie) });

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Try editing this todo/);
});

test('a search query containing HTML is escaped where it is echoed back', async (t) => {
  const { app, cookie } = await harness();
  t.after(() => app.close());

  const res = await app.inject({
    method: 'GET',
    url: `/?q=${encodeURIComponent('<script>alert(1)</script>')}`,
    cookies: cookiesFor(cookie),
  });

  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.includes('<script>alert(1)</script>'), 'must not echo raw script markup');
  assert.match(res.body, /&lt;script&gt;/);
});

test('?edit=<id> renders that row in edit mode', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const todo = store.list(sid, 'all')[0]!;

  const res = await app.inject({
    method: 'GET',
    url: `/?edit=${todo.id}`,
    cookies: cookiesFor(cookie),
  });

  assert.match(res.body, /class="todo is-editing"/);
  assert.match(res.body, new RegExp(`value="${todo.title}"`));
});

test('?edit=<unknown id> renders the normal list, not a 404', async (t) => {
  const { app, cookie } = await harness();
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/?edit=nope', cookies: cookiesFor(cookie) });

  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.includes('is-editing'));
});

test('an unknown URL returns a friendly 404 page', async (t) => {
  const { app, cookie } = await harness();
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/nope', cookies: cookiesFor(cookie) });

  assert.equal(res.statusCode, 404);
  assert.match(res.body, /No such page/);
});

test('the CSS and htmx assets are served', async (t) => {
  const { app } = await harness();
  t.after(() => app.close());

  const css = await app.inject({ method: 'GET', url: '/static/app.css' });
  const htmx = await app.inject({ method: 'GET', url: '/static/htmx.min.js' });

  assert.equal(css.statusCode, 200);
  assert.equal(htmx.statusCode, 200);
});

test('each visitor sees only their own todos', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  store.create(sid, 'only mine');

  const other = await app.inject({ method: 'GET', url: '/' });

  assert.ok(!other.body.includes('only mine'));
  assert.match(other.body, /Try editing this todo/);
});
