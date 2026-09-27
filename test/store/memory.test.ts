import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../../src/store/memory.ts';
import { NotFound } from '../../src/store/errors.ts';

function fixture() {
  let clock = new Date('2026-09-26T12:00:00.000Z');
  const store = new MemoryStore({ now: () => clock });
  return {
    store,
    advance(ms: number) {
      clock = new Date(clock.getTime() + ms);
    },
  };
}

test('create appends a todo and returns it', () => {
  const { store } = fixture();

  const todo = store.create('s1', 'buy milk');

  assert.equal(todo.title, 'buy milk');
  assert.equal(todo.done, false);
  assert.match(todo.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(
    store.list('s1', 'all').map((t) => t.title),
    ['buy milk'],
  );
});

test('sessions are isolated from each other', () => {
  const { store } = fixture();

  store.create('s1', 'mine');

  assert.deepEqual(store.list('s2', 'all'), []);
});

test('get throws NotFound for an id in another session', () => {
  const { store } = fixture();
  const todo = store.create('s1', 'mine');

  assert.throws(() => store.get('s2', todo.id), NotFound);
});

test('setDone flips done and remaining counts only active todos', () => {
  const { store } = fixture();
  const a = store.create('s1', 'a');
  store.create('s1', 'b');

  const updated = store.setDone('s1', a.id, true);

  assert.equal(updated.done, true);
  assert.equal(store.remaining('s1'), 1);
});

test('rename replaces the title', () => {
  const { store } = fixture();
  const todo = store.create('s1', 'old');

  assert.equal(store.rename('s1', todo.id, 'new').title, 'new');
  assert.equal(store.get('s1', todo.id).title, 'new');
});

test('filter selects active or done', () => {
  const { store } = fixture();
  const a = store.create('s1', 'active one');
  store.create('s1', 'done one');
  const done = store.list('s1', 'all')[1]!;
  store.setDone('s1', done.id, true);

  assert.deepEqual(
    store.list('s1', 'active').map((t) => t.id),
    [a.id],
  );
  assert.deepEqual(
    store.list('s1', 'done').map((t) => t.id),
    [done.id],
  );
});

test('query matches case-insensitive substrings and combines with filter', () => {
  const { store } = fixture();
  store.create('s1', 'Buy Milk');
  const other = store.create('s1', 'walk dog');
  store.setDone('s1', other.id, true);

  assert.deepEqual(
    store.list('s1', 'all', 'milk').map((t) => t.title),
    ['Buy Milk'],
  );
  assert.deepEqual(store.list('s1', 'done', 'milk'), []);
  assert.equal(store.list('s1', 'all', '   ').length, 2);
});

test('a query with regex metacharacters is matched literally', () => {
  const { store } = fixture();
  store.create('s1', 'literal .* match');
  store.create('s1', 'should not match');

  assert.deepEqual(
    store.list('s1', 'all', '.*').map((t) => t.title),
    ['literal .* match'],
  );
});

test('touch marks a session seen without creating todos', () => {
  const { store } = fixture();

  store.touch('s1');

  assert.equal(store.has('s1'), true);
  assert.deepEqual(store.list('s1', 'all'), []);
});

test('has is false for a session that was never seen', () => {
  const { store } = fixture();

  assert.equal(store.has('never'), false);
});
