import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../../src/store/memory.ts';
import { ExpiredUndo } from '../../src/store/errors.ts';
import { SESSION_TTL_MS, UNDO_TTL_MS } from '../../src/store/types.ts';

function fixture() {
  let clock = new Date('2026-09-26T12:00:00.000Z');
  const store = new MemoryStore({ now: () => clock });
  return {
    store,
    advance(ms: number) {
      clock = new Date(clock.getTime() + ms);
    },
    get clock() {
      return clock;
    },
  };
}

test('restore puts the todo back at its original index', () => {
  const { store } = fixture();
  store.create('s1', 'first');
  const middle = store.create('s1', 'middle');
  store.create('s1', 'last');

  store.remove('s1', middle.id);
  assert.deepEqual(
    store.list('s1', 'all').map((t) => t.title),
    ['first', 'last'],
  );

  store.restore('s1', middle.id);
  assert.deepEqual(
    store.list('s1', 'all').map((t) => t.title),
    ['first', 'middle', 'last'],
  );
});

test('restore throws ExpiredUndo once the TTL has passed', () => {
  const f = fixture();
  const todo = f.store.create('s1', 'gone');
  f.store.remove('s1', todo.id);

  f.advance(UNDO_TTL_MS + 1);

  assert.throws(() => f.store.restore('s1', todo.id), ExpiredUndo);
});

test('restore just inside the TTL still succeeds', () => {
  const f = fixture();
  const todo = f.store.create('s1', 'saved');
  f.store.remove('s1', todo.id);

  f.advance(UNDO_TTL_MS - 1);

  assert.equal(f.store.restore('s1', todo.id).id, todo.id);
});

test('restore with an id that is not the trashed one throws ExpiredUndo', () => {
  const { store } = fixture();
  const a = store.create('s1', 'a');
  const b = store.create('s1', 'b');
  store.remove('s1', a.id);

  assert.throws(() => store.restore('s1', b.id), ExpiredUndo);
});

test('a second delete discards the first undo', () => {
  const { store } = fixture();
  const a = store.create('s1', 'a');
  const b = store.create('s1', 'b');

  store.remove('s1', a.id);
  store.remove('s1', b.id);

  assert.throws(() => store.restore('s1', a.id), ExpiredUndo);
  assert.equal(store.restore('s1', b.id).id, b.id);
});

test('restore cannot be replayed twice', () => {
  const { store } = fixture();
  const todo = store.create('s1', 'once');
  store.remove('s1', todo.id);
  store.restore('s1', todo.id);

  assert.throws(() => store.restore('s1', todo.id), ExpiredUndo);
  assert.equal(store.list('s1', 'all').length, 1);
});

test('sweep drops sessions idle beyond the TTL and keeps fresh ones', () => {
  const f = fixture();
  f.store.create('old', 'stale');
  f.advance(SESSION_TTL_MS + 1000);
  f.store.create('new', 'fresh');

  f.store.sweep(f.clock);

  assert.equal(f.store.has('old'), false);
  assert.equal(f.store.has('new'), true);
});

test('sweep clears expired trash without dropping the session', () => {
  const f = fixture();
  const todo = f.store.create('s1', 'x');
  f.store.remove('s1', todo.id);
  f.advance(UNDO_TTL_MS + 1);

  f.store.sweep(f.clock);

  assert.equal(f.store.has('s1'), true);
  assert.throws(() => f.store.restore('s1', todo.id), ExpiredUndo);
});
