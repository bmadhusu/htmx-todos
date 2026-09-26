# htmx Todo App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable, portfolio-quality todo app where every interaction is an htmx fragment swap and every action also works with JavaScript disabled.

**Architecture:** One Fastify process renders Nunjucks fragments. All state lives in an in-memory `MemoryStore` behind a `TodoStore` interface, wrapped by a `SnapshotStore` that debounces writes to a JSON file on a Railway volume. Route handlers depend only on the interface, so tests run against a bare in-memory store with no disk and no timers. A single `respond()` helper decides between returning a fragment (htmx) and a 303 redirect (no-JS), which is what makes progressive enhancement free rather than duplicated.

**Tech Stack:** Node 24+ (native TypeScript type stripping, no build step), Fastify 5, `@fastify/view` + Nunjucks, `@fastify/cookie`, `@fastify/formbody`, `@fastify/static`, `@fastify/rate-limit`, `fastify-plugin`, htmx 2 (vendored, not CDN), `node:test`, Playwright, Railway.

**Spec:** `docs/superpowers/specs/2026-09-26-htmx-todo-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Node 24+ required.** TypeScript runs directly via native type stripping; there is no build step and no `dist/`. The spec says Node 22+; this plan tightens it to 24 because type stripping is unflagged there. If `node --version` reports below 24, stop and tell the human partner rather than adding a bundler.
- **Type stripping constraints:** no enums, no parameter properties, no namespaces, no `const enum`. Enforced by `erasableSyntaxOnly: true`. Relative imports must carry the `.ts` extension.
- **No database, no ORM, no SQL.** Storage is a `Map` plus a JSON file. Do not add a storage dependency.
- **Test runner is `node:test`.** Do not add Vitest or Jest. Playwright is the only test dependency, and only for the two browser tests.
- **Todo title:** trimmed, 1–200 characters after trimming. Empty-after-trim is a 422, never a silent no-op.
- **Undo TTL:** exactly 30 seconds. One trash entry per session; a second delete discards the first.
- **Session expiry:** sessions idle more than 30 days are swept.
- **Filter union:** `'all' | 'active' | 'done'`. Any other value falls back to `'all'` — never a 400.
- **Server binds `0.0.0.0` on `process.env.PORT`** (default 3000 locally). Binding localhost is the classic Railway 502.
- **`COOKIE_SECRET` is required when `NODE_ENV=production`** and the process must refuse to boot without it.
- **Nunjucks autoescaping is on and explicitly configured.** Titles are user input rendered back into HTML.
- **`hx-push-url` is never used for the list endpoint.** `GET /todos` sets an `HX-Push-Url` response header pointing at `/?filter=…&q=…`, so a reload renders a full page instead of a bare fragment.
- **Commit after every task.** Conventional commit prefixes (`feat:`, `test:`, `chore:`, `fix:`).

## Review Focus

Five input classes the spec implies but does not describe, most likely to bite a real user first. Each has a test pinned to the task that owns the code.

1. **Whitespace-only or over-length title** — `"   "` or a 201-character title must return 422 with an inline message and create nothing; a 200-character title must succeed. (Task 8)
2. **Corrupt or unreadable snapshot file at boot** — truncated JSON, an array of the wrong shape, or a permissions error must start an empty store and log, never crash the process. A portfolio URL that 502s after a bad deploy is the worst possible failure. (Task 4)
3. **Forged, tampered, or stale `sid` cookie** — a bad signature must be treated as no cookie at all: mint a fresh session, seed examples, return 200. Never a 500, never someone else's list. (Task 5)
4. **Acting on a todo that no longer exists** — a stale tab or double-click deleting the same id twice must produce a designed 404 fragment, not a stack trace or an unhandled throw. (Task 11)
5. **Search query containing HTML or regex metacharacters** — `<script>` or `.*` must be escaped on output, matched as a literal substring, and must not crash or inject. (Task 7)

## Deviations From the Spec

Four places where implementation detail forced a decision the spec did not make.
Each is deliberate; none changes the product.

1. **Node 24+ instead of 22+.** Native TypeScript type stripping is unflagged in 24,
   which removes the build step entirely. On 22 the project would need a bundler,
   which costs more than the version floor does.
2. **A new route: `GET /todos/:id`** returning a single row fragment. The spec's route
   table has no way to leave edit mode — Cancel needs to swap the edit form back into
   a plain row. Its no-JS counterpart is a plain link to `/?filter=…&q=…`.
3. **`?edit=<id>` on `GET /`.** Inline editing without JavaScript needs a URL that
   renders the full page with one row in edit mode, since a fragment endpoint alone
   would leave a no-JS user staring at a bare `<li>`.
4. **Validation is explicit, not JSON schema.** The spec says validate via Fastify
   JSON schema; a schema rejects with 400 before the handler runs and cannot express
   "trim, then require 1–200 characters." `parseTitle` does the trim-then-check and
   returns 422 with a fragment. The schema-driven path still exists in the error
   handler for any future schema-validated route.

Two additions to the store interface the spec's listing did not include: `has(sid)`
and `touch(sid)`, which the session plugin needs to tell a returning visitor from a
new one, and `toJSON`/`fromJSON` on a `SerializableStore` sub-interface so
`SnapshotStore` can persist without widening `TodoStore` for every consumer.

---

### Task 1: Walking skeleton — Fastify app, healthcheck, test harness

Establishes the project and proves the whole toolchain (TypeScript without a build step, Fastify, `node:test`, `app.inject()`) works before any domain code exists.

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.nvmrc`
- Create: `src/app.ts`, `src/server.ts`
- Test: `test/health.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `buildApp(deps: AppDeps): Promise<FastifyInstance>` where `type AppDeps = { store: TodoStore; cookieSecret: string }`. Task 1 ships it with an empty `AppDeps` (`{}`) and later tasks widen it — every subsequent task calls `buildApp`.

- [ ] **Step 1: Verify the Node version**

```bash
node --version
```

Expected: `v24.` or higher. If lower, stop and report — do not work around it.

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "htmx-todo",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "node --watch src/server.ts",
    "start": "node src/server.ts",
    "typecheck": "tsc --noEmit",
    "test": "node --test 'test/**/*.test.ts'",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "fastify": "^5.2.0",
    "fastify-plugin": "^5.0.1",
    "@fastify/cookie": "^11.0.2",
    "@fastify/formbody": "^8.0.2",
    "@fastify/rate-limit": "^10.2.2",
    "@fastify/static": "^8.0.4",
    "@fastify/view": "^10.0.2",
    "nunjucks": "^3.2.4"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/nunjucks": "^3.2.6",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "lib": ["es2023"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 4: Create `.gitignore` and `.nvmrc`**

`.gitignore`:
```
node_modules/
data/
test-results/
playwright-report/
.env
```

`.nvmrc`:
```
24
```

- [ ] **Step 5: Install dependencies**

```bash
npm install
```

- [ ] **Step 6: Write the failing test**

`test/health.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.ts';

test('GET /healthz reports ok', async (t) => {
  const app = await buildApp({});
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/healthz' });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: 'ok' });
});
```

- [ ] **Step 7: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — cannot find module `../src/app.ts`.

- [ ] **Step 8: Write `src/app.ts`**

```ts
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

export type AppDeps = Record<string, never>;

export async function buildApp(_deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.get('/healthz', async () => ({ status: 'ok' }));

  return app;
}
```

- [ ] **Step 9: Write `src/server.ts`**

```ts
import { buildApp } from './app.ts';

const app = await buildApp({});
const port = Number(process.env.PORT ?? 3000);

await app.listen({ host: '0.0.0.0', port });
console.log(`listening on http://0.0.0.0:${port}`);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
```

- [ ] **Step 10: Run the test to verify it passes**

```bash
npm test && npm run typecheck
```

Expected: 1 test passing, no type errors.

- [ ] **Step 11: Verify the server actually boots**

```bash
PORT=3001 node src/server.ts &
sleep 1
curl -s localhost:3001/healthz
kill %1
```

Expected: `{"status":"ok"}`.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: Fastify skeleton with healthcheck and node:test harness"
```

---

### Task 2: Store types and `MemoryStore` reads and writes

The core domain. No Fastify, no HTTP — pure data structures with an injected clock so every time-dependent test is deterministic.

**Files:**
- Create: `src/store/types.ts`, `src/store/errors.ts`, `src/store/memory.ts`
- Test: `test/store/memory.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Filter`, `Todo`, `Session`, `Trash`, `TodoStore`, `SerializableStore` types; `class MemoryStore implements SerializableStore`, constructed as `new MemoryStore({ now?: () => Date })`; `class NotFound extends Error` and `class ExpiredUndo extends Error`. Tasks 3–15 depend on these exact names.

- [ ] **Step 1: Write `src/store/types.ts`**

```ts
export type Filter = 'all' | 'active' | 'done';

export type Todo = {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
};

export type Trash = {
  todo: Todo;
  index: number;
  expiresAt: string;
};

export type Session = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  todos: Todo[];
  trash?: Trash;
};

export interface TodoStore {
  list(sid: string, filter: Filter, query?: string): Todo[];
  create(sid: string, title: string): Todo;
  get(sid: string, id: string): Todo;
  rename(sid: string, id: string, title: string): Todo;
  setDone(sid: string, id: string, done: boolean): Todo;
  remove(sid: string, id: string): Todo;
  restore(sid: string, id: string): Todo;
  remaining(sid: string): number;
  has(sid: string): boolean;
  touch(sid: string): void;
  sweep(now: Date): void;
}

export interface SerializableStore extends TodoStore {
  toJSON(): Session[];
  fromJSON(sessions: Session[]): void;
}

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const UNDO_TTL_MS = 30 * 1000;
export const TITLE_MAX = 200;

export function parseFilter(value: unknown): Filter {
  return value === 'active' || value === 'done' ? value : 'all';
}
```

- [ ] **Step 2: Write `src/store/errors.ts`**

```ts
export class NotFound extends Error {
  constructor(message = 'not found') {
    super(message);
    this.name = 'NotFound';
  }
}

export class ExpiredUndo extends Error {
  constructor(message = 'undo expired') {
    super(message);
    this.name = 'ExpiredUndo';
  }
}
```

- [ ] **Step 3: Write the failing tests**

`test/store/memory.test.ts`:
```ts
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
  assert.deepEqual(store.list('s1', 'all').map((t) => t.title), ['buy milk']);
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

  assert.deepEqual(store.list('s1', 'active').map((t) => t.id), [a.id]);
  assert.deepEqual(store.list('s1', 'done').map((t) => t.id), [done.id]);
});

test('query matches case-insensitive substrings and combines with filter', () => {
  const { store } = fixture();
  store.create('s1', 'Buy Milk');
  const other = store.create('s1', 'walk dog');
  store.setDone('s1', other.id, true);

  assert.deepEqual(store.list('s1', 'all', 'milk').map((t) => t.title), ['Buy Milk']);
  assert.deepEqual(store.list('s1', 'done', 'milk'), []);
  assert.equal(store.list('s1', 'all', '   ').length, 2);
});

test('touch marks a session seen without creating todos', () => {
  const { store } = fixture();

  store.touch('s1');

  assert.equal(store.has('s1'), true);
  assert.deepEqual(store.list('s1', 'all'), []);
});
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
npm test
```

Expected: FAIL — cannot find module `../../src/store/memory.ts`.

- [ ] **Step 5: Write `src/store/memory.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { NotFound, ExpiredUndo } from './errors.ts';
import {
  SESSION_TTL_MS,
  UNDO_TTL_MS,
  type Filter,
  type SerializableStore,
  type Session,
  type Todo,
} from './types.ts';

export type MemoryStoreOptions = { now?: () => Date };

export class MemoryStore implements SerializableStore {
  #sessions = new Map<string, Session>();
  #now: () => Date;

  constructor(options: MemoryStoreOptions = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  #session(sid: string): Session {
    const existing = this.#sessions.get(sid);
    if (existing) {
      existing.lastSeenAt = this.#now().toISOString();
      return existing;
    }
    const iso = this.#now().toISOString();
    const created: Session = { id: sid, createdAt: iso, lastSeenAt: iso, todos: [] };
    this.#sessions.set(sid, created);
    return created;
  }

  #index(session: Session, id: string): number {
    const index = session.todos.findIndex((t) => t.id === id);
    if (index === -1) throw new NotFound(`todo ${id}`);
    return index;
  }

  has(sid: string): boolean {
    return this.#sessions.has(sid);
  }

  touch(sid: string): void {
    this.#session(sid);
  }

  list(sid: string, filter: Filter, query?: string): Todo[] {
    const q = (query ?? '').trim().toLowerCase();
    return this.#session(sid).todos.filter((todo) => {
      const matchesFilter =
        filter === 'all' || (filter === 'active' ? !todo.done : todo.done);
      const matchesQuery = q === '' || todo.title.toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }

  create(sid: string, title: string): Todo {
    const todo: Todo = {
      id: randomUUID(),
      title,
      done: false,
      createdAt: this.#now().toISOString(),
    };
    this.#session(sid).todos.push(todo);
    return todo;
  }

  get(sid: string, id: string): Todo {
    const session = this.#session(sid);
    return session.todos[this.#index(session, id)]!;
  }

  rename(sid: string, id: string, title: string): Todo {
    const todo = this.get(sid, id);
    todo.title = title;
    return todo;
  }

  setDone(sid: string, id: string, done: boolean): Todo {
    const todo = this.get(sid, id);
    todo.done = done;
    return todo;
  }

  remove(sid: string, id: string): Todo {
    const session = this.#session(sid);
    const index = this.#index(session, id);
    const [todo] = session.todos.splice(index, 1);
    session.trash = {
      todo: todo!,
      index,
      expiresAt: new Date(this.#now().getTime() + UNDO_TTL_MS).toISOString(),
    };
    return todo!;
  }

  restore(sid: string, id: string): Todo {
    const session = this.#session(sid);
    const trash = session.trash;
    if (!trash || trash.todo.id !== id) throw new ExpiredUndo();
    if (this.#now().getTime() > Date.parse(trash.expiresAt)) {
      delete session.trash;
      throw new ExpiredUndo();
    }
    session.todos.splice(Math.min(trash.index, session.todos.length), 0, trash.todo);
    delete session.trash;
    return trash.todo;
  }

  remaining(sid: string): number {
    return this.#session(sid).todos.filter((todo) => !todo.done).length;
  }

  sweep(now: Date): void {
    for (const [sid, session] of this.#sessions) {
      if (now.getTime() - Date.parse(session.lastSeenAt) > SESSION_TTL_MS) {
        this.#sessions.delete(sid);
        continue;
      }
      if (session.trash && now.getTime() > Date.parse(session.trash.expiresAt)) {
        delete session.trash;
      }
    }
  }

  toJSON(): Session[] {
    return structuredClone([...this.#sessions.values()]);
  }

  fromJSON(sessions: Session[]): void {
    this.#sessions = new Map(sessions.map((session) => [session.id, session]));
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm test && npm run typecheck
```

Expected: all store tests passing, no type errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: TodoStore interface and MemoryStore with injected clock"
```

---

### Task 3: Undo trash, TTL expiry, and session sweeping

Task 2 wrote this behavior; this task pins the time-dependent parts with tests, which is where bugs actually live.

**Files:**
- Modify: `src/store/memory.ts` (only if a test exposes a defect)
- Test: `test/store/trash.test.ts`

**Interfaces:**
- Consumes: `MemoryStore`, `ExpiredUndo`, `UNDO_TTL_MS`, `SESSION_TTL_MS` from Task 2.
- Produces: no new interfaces.

- [ ] **Step 1: Write the failing tests**

`test/store/trash.test.ts`:
```ts
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
  assert.deepEqual(store.list('s1', 'all').map((t) => t.title), ['first', 'last']);

  store.restore('s1', middle.id);
  assert.deepEqual(store.list('s1', 'all').map((t) => t.title), ['first', 'middle', 'last']);
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
```

- [ ] **Step 2: Run the tests**

```bash
npm test
```

Expected: all pass against Task 2's implementation. If any fail, fix `src/store/memory.ts` — the tests define the contract, not the other way round.

Note: `sweep` dropping `old` relies on `create` not refreshing `lastSeenAt` for other sessions. If `sweep drops sessions idle beyond the TTL` fails because `has('old')` is still true, check that `#session` only touches the session it was asked for.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: pin undo TTL, trash replacement, and session sweeping"
```

---

### Task 4: `SnapshotStore` — debounced JSON persistence

Wraps any `SerializableStore` and makes restarts non-destructive. Review Focus item 2 lives here: a corrupt file must never stop the process from booting.

**Files:**
- Create: `src/store/snapshot.ts`
- Test: `test/store/snapshot.test.ts`

**Interfaces:**
- Consumes: `SerializableStore`, `TodoStore`, `Session` from Task 2.
- Produces: `class SnapshotStore implements TodoStore` with `new SnapshotStore(inner, { path, debounceMs?, log? })`, an async `flush(): Promise<void>`, and `static async load(inner: SerializableStore, path: string, log?): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`test/store/snapshot.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from '../../src/store/memory.ts';
import { SnapshotStore } from '../../src/store/snapshot.ts';
import type { Session } from '../../src/store/types.ts';

async function tempPath() {
  const dir = await mkdtemp(join(tmpdir(), 'htmx-todo-'));
  return join(dir, 'sessions.json');
}

test('flush writes the wrapped store to disk', async () => {
  const path = await tempPath();
  const store = new SnapshotStore(new MemoryStore(), { path, debounceMs: 0 });

  store.create('s1', 'persisted');
  await store.flush();

  const parsed = JSON.parse(await readFile(path, 'utf8')) as Session[];
  assert.equal(parsed[0]?.todos[0]?.title, 'persisted');
});

test('load restores sessions written by a previous process', async () => {
  const path = await tempPath();
  const first = new SnapshotStore(new MemoryStore(), { path, debounceMs: 0 });
  const todo = first.create('s1', 'survives restart');
  await first.flush();

  const inner = new MemoryStore();
  await SnapshotStore.load(inner, path);

  assert.equal(inner.get('s1', todo.id).title, 'survives restart');
});

test('load tolerates a missing file', async () => {
  const inner = new MemoryStore();

  await SnapshotStore.load(inner, join(tmpdir(), 'definitely-absent-12345.json'));

  assert.deepEqual(inner.toJSON(), []);
});

test('load tolerates truncated JSON and logs', async () => {
  const path = await tempPath();
  await writeFile(path, '[{"id":"s1","todos":[');
  const logged: unknown[] = [];
  const inner = new MemoryStore();

  await SnapshotStore.load(inner, path, (error) => logged.push(error));

  assert.deepEqual(inner.toJSON(), []);
  assert.equal(logged.length, 1);
});

test('load rejects well-formed JSON of the wrong shape', async () => {
  const path = await tempPath();
  await writeFile(path, '{"not":"an array"}');
  const inner = new MemoryStore();

  await SnapshotStore.load(inner, path, () => {});

  assert.deepEqual(inner.toJSON(), []);
});

test('load skips entries missing required fields', async () => {
  const path = await tempPath();
  await writeFile(path, JSON.stringify([{ id: 's1' }, { nope: true }]));
  const inner = new MemoryStore();

  await SnapshotStore.load(inner, path, () => {});

  assert.deepEqual(inner.toJSON(), []);
});

test('a write failure is logged and does not throw into the caller', async () => {
  const logged: unknown[] = [];
  const store = new SnapshotStore(new MemoryStore(), {
    path: '/definitely/not/a/writable/path/sessions.json',
    debounceMs: 0,
    log: (error) => logged.push(error),
  });

  store.create('s1', 'x');
  await store.flush();

  assert.equal(logged.length, 1);
  assert.deepEqual(store.list('s1', 'all').map((t) => t.title), ['x']);
});

test('reads delegate to the wrapped store without writing', async () => {
  const path = await tempPath();
  const inner = new MemoryStore();
  const store = new SnapshotStore(inner, { path, debounceMs: 0 });
  const todo = store.create('s1', 'a');
  store.setDone('s1', todo.id, true);

  assert.equal(store.remaining('s1'), 0);
  assert.equal(store.get('s1', todo.id).done, true);
  assert.equal(store.has('s1'), true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test
```

Expected: FAIL — cannot find module `../../src/store/snapshot.ts`.

- [ ] **Step 3: Write `src/store/snapshot.ts`**

```ts
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Filter, SerializableStore, Session, Todo, TodoStore } from './types.ts';

export type SnapshotOptions = {
  path: string;
  debounceMs?: number;
  log?: (error: unknown) => void;
};

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Session>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.lastSeenAt === 'string' &&
    Array.isArray(candidate.todos)
  );
}

export class SnapshotStore implements TodoStore {
  #inner: SerializableStore;
  #path: string;
  #debounceMs: number;
  #log: (error: unknown) => void;
  #timer: NodeJS.Timeout | undefined;
  #pending: Promise<void> = Promise.resolve();

  constructor(inner: SerializableStore, options: SnapshotOptions) {
    this.#inner = inner;
    this.#path = options.path;
    this.#debounceMs = options.debounceMs ?? 1000;
    this.#log = options.log ?? ((error) => console.error('snapshot failed', error));
  }

  static async load(
    inner: SerializableStore,
    path: string,
    log: (error: unknown) => void = (error) => console.error('snapshot load failed', error),
  ): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') log(error);
      return;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('snapshot root is not an array');
      inner.fromJSON(parsed.filter(isSession));
    } catch (error) {
      log(error);
    }
  }

  #schedule(): void {
    if (this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#pending = this.#write();
    }, this.#debounceMs);
    this.#timer.unref();
  }

  async #write(): Promise<void> {
    const temp = `${this.#path}.${process.pid}.tmp`;
    try {
      await mkdir(dirname(this.#path), { recursive: true });
      await writeFile(temp, JSON.stringify(this.#inner.toJSON()), 'utf8');
      await rename(temp, this.#path);
    } catch (error) {
      this.#log(error);
    }
  }

  async flush(): Promise<void> {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    await this.#pending;
    await this.#write();
  }

  list(sid: string, filter: Filter, query?: string): Todo[] {
    return this.#inner.list(sid, filter, query);
  }

  get(sid: string, id: string): Todo {
    return this.#inner.get(sid, id);
  }

  remaining(sid: string): number {
    return this.#inner.remaining(sid);
  }

  has(sid: string): boolean {
    return this.#inner.has(sid);
  }

  create(sid: string, title: string): Todo {
    const todo = this.#inner.create(sid, title);
    this.#schedule();
    return todo;
  }

  rename(sid: string, id: string, title: string): Todo {
    const todo = this.#inner.rename(sid, id, title);
    this.#schedule();
    return todo;
  }

  setDone(sid: string, id: string, done: boolean): Todo {
    const todo = this.#inner.setDone(sid, id, done);
    this.#schedule();
    return todo;
  }

  remove(sid: string, id: string): Todo {
    const todo = this.#inner.remove(sid, id);
    this.#schedule();
    return todo;
  }

  restore(sid: string, id: string): Todo {
    const todo = this.#inner.restore(sid, id);
    this.#schedule();
    return todo;
  }

  touch(sid: string): void {
    this.#inner.touch(sid);
    this.#schedule();
  }

  sweep(now: Date): void {
    this.#inner.sweep(now);
    this.#schedule();
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test && npm run typecheck
```

Expected: all snapshot tests passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: SnapshotStore with debounced atomic writes and tolerant loading"
```

---

### Task 5: Session plugin — signed cookie, seeded examples

Gives every visitor a private list with no login. Review Focus item 3 lives here: a tampered cookie must behave exactly like a first visit.

**Files:**
- Create: `src/session.ts`
- Modify: `src/app.ts` (register cookie, formbody, and the session plugin; widen `AppDeps`)
- Test: `test/session.test.ts`

**Interfaces:**
- Consumes: `TodoStore` from Task 2; `buildApp` from Task 1.
- Produces: `AppDeps = { store: TodoStore; cookieSecret: string }`; `sessionPlugin`; `request.sid: string` available in every handler; `SEED_TITLES: string[]`.

- [ ] **Step 1: Write the failing tests**

`test/session.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.ts';
import { MemoryStore } from '../src/store/memory.ts';
import { SEED_TITLES } from '../src/session.ts';

async function harness() {
  const store = new MemoryStore();
  const app = await buildApp({ store, cookieSecret: 'test-secret-value' });
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

  const res = await app.inject({ method: 'GET', url: '/healthz' });
  const sid = res.cookies.find((c) => c.name === 'sid')!.value;
  const sessions = store.toJSON();

  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0]!.todos.map((t2) => t2.title), SEED_TITLES);
  assert.ok(sid.length > 0);
});

test('an existing cookie reuses the same session and does not reseed', async (t) => {
  const { app, store } = await harness();
  t.after(() => app.close());
  const first = await app.inject({ method: 'GET', url: '/healthz' });
  const cookie = first.cookies.find((c) => c.name === 'sid')!;

  await app.inject({
    method: 'GET',
    url: '/healthz',
    cookies: { sid: cookie.value },
  });

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

test('a syntactically valid but unknown session id gets a fresh seeded session', async (t) => {
  const { app, store } = await harness();
  t.after(() => app.close());
  const probe = await app.inject({ method: 'GET', url: '/healthz' });
  const goodCookie = probe.cookies.find((c) => c.name === 'sid')!.value;
  store.fromJSON([]);

  const res = await app.inject({
    method: 'GET',
    url: '/healthz',
    cookies: { sid: goodCookie },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(store.toJSON()[0]!.todos.length, SEED_TITLES.length);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `buildApp` does not accept `store`, and `src/session.ts` does not exist.

- [ ] **Step 3: Write `src/session.ts`**

```ts
import { randomUUID } from 'node:crypto';
import fp from 'fastify-plugin';
import type { TodoStore } from './store/types.ts';

export const SEED_TITLES = [
  'Try editing this todo',
  'Tick one off',
  'Delete one, then hit Undo',
];

export const SESSION_COOKIE = 'sid';
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

declare module 'fastify' {
  interface FastifyRequest {
    sid: string;
  }
}

export const sessionPlugin = fp(async (app, options: { store: TodoStore }) => {
  const { store } = options;

  app.decorateRequest('sid', '');

  app.addHook('onRequest', async (request, reply) => {
    const raw = request.cookies[SESSION_COOKIE];
    const unsigned = raw ? request.unsignCookie(raw) : undefined;
    const existing = unsigned?.valid ? unsigned.value : undefined;

    if (existing && store.has(existing)) {
      request.sid = existing;
      store.touch(existing);
      return;
    }

    const sid = existing ?? randomUUID();
    request.sid = sid;
    for (const title of SEED_TITLES) store.create(sid, title);

    reply.setCookie(SESSION_COOKIE, sid, {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: THIRTY_DAYS_SECONDS,
    });
  });
});
```

Note: when the cookie signature is valid but the session is gone (swept, or a fresh process with no snapshot), the id is reused and reseeded. That keeps the cookie stable while still giving the visitor a working list.

- [ ] **Step 4: Rewrite `src/app.ts`**

```ts
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import { sessionPlugin } from './session.ts';
import type { TodoStore } from './store/types.ts';

export type AppDeps = {
  store: TodoStore;
  cookieSecret: string;
};

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cookie, { secret: deps.cookieSecret });
  await app.register(formbody);
  await app.register(sessionPlugin, { store: deps.store });

  app.get('/healthz', async () => ({ status: 'ok' }));

  return app;
}
```

- [ ] **Step 5: Update `test/health.test.ts` and `src/server.ts` for the new `AppDeps`**

In `test/health.test.ts`, replace `await buildApp({})` with:
```ts
const app = await buildApp({ store: new MemoryStore(), cookieSecret: 'test-secret-value' });
```
and add `import { MemoryStore } from '../src/store/memory.ts';`.

In `src/server.ts`, replace `await buildApp({})` with:
```ts
import { MemoryStore } from './store/memory.ts';

const store = new MemoryStore();
const app = await buildApp({ store, cookieSecret: process.env.COOKIE_SECRET ?? 'dev-secret' });
```
(Task 12 replaces this with validated configuration and the snapshot wiring.)

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm test && npm run typecheck
```

Expected: session and health tests passing.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: signed-cookie sessions with seeded example todos"
```

---

### Task 6: Views, the full page, and the error handler

Sets up Nunjucks with one macro per fragment, vendors htmx locally, renders `GET /`, and installs the error handler that every later task depends on for its 404 and 410 paths.

**Files:**
- Create: `views/layout.njk`, `views/index.njk`, `views/partials/macros.njk`, `views/partials/row.njk`, `views/partials/edit.njk`, `views/partials/list.njk`, `views/partials/count.njk`, `views/partials/toast.njk`, `views/partials/error.njk`
- Create: `public/app.css`, `public/htmx.min.js` (downloaded)
- Create: `src/lib/params.ts`, `src/lib/render.ts`, `src/lib/error-handler.ts`, `src/routes/pages.ts`
- Modify: `src/app.ts` (register view, static, error handler, pages route)
- Create: `test/helpers.ts`
- Test: `test/pages.test.ts`

**Interfaces:**
- Consumes: `buildApp`, `AppDeps` (Task 1/5); `MemoryStore`, `NotFound`, `ExpiredUndo`, `parseFilter`, `Filter`, `Todo` (Task 2).
- Produces:
  - `parseListParams(source: unknown): { filter: Filter; q: string; edit: string | null }`
  - `backUrl(req: { query: unknown; body?: unknown }, extra?: Record<string, string>): string`
  - `fragments(app: FastifyInstance)` returning `{ row, edit, list, count, toast, error }`, each `(…) => Promise<string>`
  - `registerErrorHandler(app: FastifyInstance)`
  - `pagesRoutes(app, store)`
  - Macros `row(todo, filter, q)`, `editRow(todo, filter, q)`, `countBadge(remaining, oob)`, `toast(todo, filter, q, message)`

- [ ] **Step 1: Vendor htmx**

```bash
mkdir -p public
curl -fsSL https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js -o public/htmx.min.js
test -s public/htmx.min.js && head -c 40 public/htmx.min.js
```

Expected: a non-empty file. Vendoring rather than using a CDN means the demo works offline and cannot break when a CDN URL changes.

- [ ] **Step 2: Write `src/lib/params.ts`**

```ts
import { parseFilter, TITLE_MAX, type Filter } from '../store/types.ts';

export type ListParams = { filter: Filter; q: string; edit: string | null };

export function parseListParams(source: unknown): ListParams {
  const record = (source ?? {}) as Record<string, unknown>;
  return {
    filter: parseFilter(record.filter),
    q: typeof record.q === 'string' ? record.q.slice(0, TITLE_MAX) : '',
    edit: typeof record.edit === 'string' && record.edit !== '' ? record.edit : null,
  };
}

export function backUrl(
  req: { query: unknown; body?: unknown },
  extra: Record<string, string> = {},
): string {
  const merged = {
    ...((req.query as Record<string, unknown>) ?? {}),
    ...((req.body as Record<string, unknown>) ?? {}),
  };
  const { filter, q } = parseListParams(merged);
  const params = new URLSearchParams({ filter });
  if (q) params.set('q', q);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  return `/?${params.toString()}`;
}
```

`backUrl` deliberately reads the request's own query and body, never the `Referer` header, which is stripped often enough that the no-JS path would silently lose the user's filter.

- [ ] **Step 3: Write `views/partials/macros.njk`**

```njk
{% macro row(todo, filter, q) %}
<li id="todo-{{ todo.id }}" class="todo{{ ' is-done' if todo.done }}">
  <form class="inline" action="/todos/{{ todo.id }}/done" method="post"
        hx-patch="/todos/{{ todo.id }}/done"
        hx-target="#todo-{{ todo.id }}" hx-swap="outerHTML">
    <input type="hidden" name="done" value="{{ 'false' if todo.done else 'true' }}">
    <input type="hidden" name="filter" value="{{ filter }}">
    <input type="hidden" name="q" value="{{ q }}">
    <button type="submit" class="toggle" aria-pressed="{{ 'true' if todo.done else 'false' }}"
            aria-label="Mark as {{ 'not done' if todo.done else 'done' }}">{{ '✓' if todo.done else '○' }}</button>
  </form>
  <span class="title">{{ todo.title }}</span>
  <a class="edit" href="/?filter={{ filter }}&q={{ q | urlencode }}&edit={{ todo.id }}"
     hx-get="/todos/{{ todo.id }}/edit?filter={{ filter }}&q={{ q | urlencode }}"
     hx-target="#todo-{{ todo.id }}" hx-swap="outerHTML">Edit</a>
  <form class="inline" action="/todos/{{ todo.id }}" method="post"
        hx-delete="/todos/{{ todo.id }}"
        hx-target="#todo-{{ todo.id }}" hx-swap="outerHTML">
    <input type="hidden" name="filter" value="{{ filter }}">
    <input type="hidden" name="q" value="{{ q }}">
    <button type="submit" class="delete" aria-label="Delete">×</button>
  </form>
</li>
{% endmacro %}

{% macro editRow(todo, filter, q) %}
<li id="todo-{{ todo.id }}" class="todo is-editing">
  <form class="inline" action="/todos/{{ todo.id }}/title" method="post"
        hx-patch="/todos/{{ todo.id }}/title"
        hx-target="#todo-{{ todo.id }}" hx-swap="outerHTML">
    <input name="title" value="{{ todo.title }}" maxlength="200" required autofocus aria-label="Edit title">
    <input type="hidden" name="filter" value="{{ filter }}">
    <input type="hidden" name="q" value="{{ q }}">
    <button type="submit">Save</button>
  </form>
  <a class="cancel" href="/?filter={{ filter }}&q={{ q | urlencode }}"
     hx-get="/todos/{{ todo.id }}?filter={{ filter }}&q={{ q | urlencode }}"
     hx-target="#todo-{{ todo.id }}" hx-swap="outerHTML">Cancel</a>
</li>
{% endmacro %}

{% macro countBadge(remaining, oob) %}
<span id="count"{% if oob %} hx-swap-oob="true"{% endif %}>{{ remaining }} left</span>
{% endmacro %}

{% macro toastBox(todo, filter, q, message) %}
<div id="toast" hx-swap-oob="true">
  {% if todo %}
  <form class="inline" action="/todos/{{ todo.id }}/restore" method="post"
        hx-post="/todos/{{ todo.id }}/restore"
        hx-target="#todo-list" hx-swap="outerHTML">
    <input type="hidden" name="filter" value="{{ filter }}">
    <input type="hidden" name="q" value="{{ q }}">
    <span>Deleted "{{ todo.title }}"</span>
    <button type="submit">Undo</button>
  </form>
  {% elif message %}
  <span class="toast-message">{{ message }}</span>
  {% endif %}
</div>
{% endmacro %}
```

Note the toggle is a **submit button, not a checkbox**, and carries an explicit hidden `done` value. A checkbox cannot submit without JavaScript, and an unchecked checkbox sends nothing — the explicit value is what makes both the no-JS path and the unambiguous request body possible.

- [ ] **Step 4: Write the remaining view files**

`views/partials/row.njk`:
```njk
{% from "partials/macros.njk" import row %}{{ row(todo, filter, q) }}
```

`views/partials/edit.njk`:
```njk
{% from "partials/macros.njk" import editRow %}{{ editRow(todo, filter, q) }}
```

`views/partials/count.njk`:
```njk
{% from "partials/macros.njk" import countBadge %}{{ countBadge(remaining, true) }}
```

`views/partials/toast.njk`:
```njk
{% from "partials/macros.njk" import toastBox %}{{ toastBox(todo, filter, q, message) }}
```

`views/partials/error.njk`:
```njk
<div id="form-error" hx-swap-oob="true" role="alert">{{ message }}</div>
```

`views/partials/list.njk`:
```njk
{% from "partials/macros.njk" import row, editRow %}
<ul id="todo-list">
  {% for todo in todos %}
    {% if editId and todo.id == editId %}{{ editRow(todo, filter, q) }}{% else %}{{ row(todo, filter, q) }}{% endif %}
  {% endfor %}
  {% if todos.length == 0 %}<li class="empty">Nothing here yet.</li>{% endif %}
</ul>
```

`views/layout.njk`:
```njk
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>htmx todos</title>
  <link rel="stylesheet" href="/static/app.css">
  <script src="/static/htmx.min.js"></script>
  <script>
    htmx.config.responseHandling = [
      { code: "204", swap: false },
      { code: "[23].." , swap: true },
      { code: "422", swap: true },
      { code: "410", swap: true },
      { code: "404", swap: true },
      { code: "[45].." , swap: false, error: true },
    ];
  </script>
</head>
<body>
  <main>{% block content %}{% endblock %}</main>
</body>
</html>
```

`views/index.njk`:
```njk
{% extends "layout.njk" %}
{% from "partials/macros.njk" import countBadge %}
{% block content %}
<h1>Todos</h1>

<form id="new-todo" action="/todos" method="post"
      hx-post="/todos" hx-target="#todo-list" hx-swap="beforeend"
      hx-on::after-request="if (event.detail.successful) this.reset()">
  <input name="title" placeholder="What needs doing?" maxlength="200" required autocomplete="off" aria-label="New todo">
  <input type="hidden" name="filter" value="{{ filter }}">
  <input type="hidden" name="q" value="{{ q }}">
  <button type="submit">Add</button>
</form>

<div id="form-error" role="alert">{% if error %}{{ error }}{% endif %}</div>

<form id="search" action="/" method="get" role="search">
  <input type="search" name="q" value="{{ q }}" placeholder="Search" aria-label="Search todos"
         hx-get="/todos" hx-trigger="keyup changed delay:300ms, search"
         hx-target="#todo-list" hx-swap="outerHTML"
         hx-include="#filter-input" hx-indicator="#spinner">
  <input type="hidden" id="filter-input" name="filter" value="{{ filter }}">
  <span id="spinner" class="htmx-indicator" aria-hidden="true">…</span>
  <noscript><button type="submit">Search</button></noscript>
</form>

<nav id="filters">
  {% for f in ["all", "active", "done"] %}
  <a href="/?filter={{ f }}&q={{ q | urlencode }}"
     hx-get="/todos?filter={{ f }}&q={{ q | urlencode }}"
     hx-target="#todo-list" hx-swap="outerHTML"
     class="{{ 'is-current' if filter == f }}">{{ f }}</a>
  {% endfor %}
  {{ countBadge(remaining, false) }}
</nav>

{% include "partials/list.njk" %}

<div id="toast"></div>
{% endblock %}
```

`public/app.css` — keep it small and readable; a portfolio reviewer will open it:
```css
:root { --fg: #1a1a1a; --muted: #6b6b6b; --line: #e4e4e4; --accent: #2b6cb0; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.5 ui-sans-serif, system-ui, sans-serif; color: var(--fg); background: #fafafa; }
main { max-width: 34rem; margin: 3rem auto; padding: 0 1rem; }
h1 { font-size: 1.5rem; margin-bottom: 1rem; }
form.inline { display: inline; }
#new-todo, #search { display: flex; gap: .5rem; margin-bottom: .75rem; }
#new-todo input[name="title"], #search input[type="search"] { flex: 1; padding: .5rem; border: 1px solid var(--line); border-radius: 6px; }
button { padding: .4rem .7rem; border: 1px solid var(--line); border-radius: 6px; background: #fff; cursor: pointer; }
#filters { display: flex; align-items: center; gap: .75rem; margin: 1rem 0 .5rem; font-size: .9rem; }
#filters a { color: var(--muted); text-decoration: none; }
#filters a.is-current { color: var(--accent); font-weight: 600; }
#count { margin-left: auto; color: var(--muted); }
#todo-list { list-style: none; padding: 0; margin: 0; border-top: 1px solid var(--line); }
.todo { display: flex; align-items: center; gap: .5rem; padding: .6rem .2rem; border-bottom: 1px solid var(--line); }
.todo .title { flex: 1; }
.todo.is-done .title { color: var(--muted); text-decoration: line-through; }
.todo .edit, .todo .cancel { font-size: .85rem; color: var(--accent); }
.empty { padding: 1rem .2rem; color: var(--muted); }
#form-error:not(:empty) { padding: .5rem; margin-bottom: .75rem; border-radius: 6px; background: #fff5f5; color: #9b2c2c; }
#toast:not(:empty) { margin-top: 1rem; padding: .5rem; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
.htmx-indicator { opacity: 0; transition: opacity .2s; }
.htmx-request .htmx-indicator, .htmx-request.htmx-indicator { opacity: 1; }
```

- [ ] **Step 5: Write `src/lib/render.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import type { Todo } from '../store/types.ts';

export type ViewCtx = { filter: string; q: string; editId?: string | null };

export function fragments(app: FastifyInstance) {
  const view = (template: string, data: object) => app.view(template, data) as Promise<string>;
  return {
    row: (todo: Todo, ctx: ViewCtx) => view('partials/row.njk', { todo, ...ctx }),
    edit: (todo: Todo, ctx: ViewCtx) => view('partials/edit.njk', { todo, ...ctx }),
    list: (todos: Todo[], ctx: ViewCtx) => view('partials/list.njk', { todos, ...ctx }),
    count: (remaining: number) => view('partials/count.njk', { remaining }),
    toast: (todo: Todo | null, ctx: ViewCtx, message = '') =>
      view('partials/toast.njk', { todo, message, ...ctx }),
    error: (message: string) => view('partials/error.njk', { message }),
  };
}

export type Fragments = ReturnType<typeof fragments>;
```

- [ ] **Step 6: Write `src/lib/error-handler.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { ExpiredUndo, NotFound } from '../store/errors.ts';
import { fragments } from './render.ts';

export function isHtmx(headers: Record<string, unknown>): boolean {
  return headers['hx-request'] === 'true';
}

export function registerErrorHandler(app: FastifyInstance): void {
  const frag = fragments(app);
  const ctx = { filter: 'all', q: '' };

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof NotFound) {
      reply.code(404);
      return isHtmx(request.headers)
        ? reply.type('text/html; charset=utf-8').send(
            await frag.toast(null, ctx, 'That todo is gone — refresh to catch up.'),
          )
        : reply.redirect('/?filter=all', 303);
    }

    if (error instanceof ExpiredUndo) {
      reply.code(410);
      return isHtmx(request.headers)
        ? reply.type('text/html; charset=utf-8').send(
            await frag.toast(null, ctx, 'Too late to undo that one.'),
          )
        : reply.redirect('/?filter=all', 303);
    }

    if (error.validation) {
      reply.code(422);
      return isHtmx(request.headers)
        ? reply.type('text/html; charset=utf-8').send(await frag.error('That input is not valid.'))
        : reply.redirect('/?filter=all&error=title', 303);
    }

    app.log.error(error);
    reply.code(500);
    return reply.type('text/html; charset=utf-8').send('<p>Something broke on our side.</p>');
  });

  app.setNotFoundHandler(async (_request, reply) => {
    reply.code(404);
    return reply.type('text/html; charset=utf-8').send('<p>No such page. <a href="/">Back to your todos.</a></p>');
  });
}
```

- [ ] **Step 7: Write `src/routes/pages.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { NotFound } from '../store/errors.ts';
import type { TodoStore } from '../store/types.ts';
import { parseListParams } from '../lib/params.ts';

const ERROR_MESSAGES: Record<string, string> = {
  title: 'Title must be 1–200 characters.',
};

export function pagesRoutes(app: FastifyInstance, store: TodoStore): void {
  app.get('/', async (request, reply) => {
    const { filter, q, edit } = parseListParams(request.query);
    const errorCode = (request.query as Record<string, unknown>).error;
    let editId: string | null = null;

    if (edit) {
      try {
        editId = store.get(request.sid, edit).id;
      } catch (error) {
        if (!(error instanceof NotFound)) throw error;
      }
    }

    return reply.view('index.njk', {
      todos: store.list(request.sid, filter, q),
      remaining: store.remaining(request.sid),
      filter,
      q,
      editId,
      error: typeof errorCode === 'string' ? ERROR_MESSAGES[errorCode] : undefined,
    });
  });
}
```

Note `?edit=<id>` is what makes inline editing work without JavaScript: the Edit link is a real href to the full page, while htmx intercepts it and fetches just the fragment. An unknown `edit` id renders the normal list rather than a 404, since a stale link should not be a dead end.

- [ ] **Step 8: Rewrite `src/app.ts`**

```ts
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import view from '@fastify/view';
import nunjucks from 'nunjucks';
import { sessionPlugin } from './session.ts';
import { registerErrorHandler } from './lib/error-handler.ts';
import { pagesRoutes } from './routes/pages.ts';
import type { TodoStore } from './store/types.ts';

export type AppDeps = {
  store: TodoStore;
  cookieSecret: string;
};

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cookie, { secret: deps.cookieSecret });
  await app.register(formbody);
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

  app.get('/healthz', async () => ({ status: 'ok' }));

  return app;
}
```

- [ ] **Step 9: Write `test/helpers.ts`**

This is a plain module, **not** a `.test.ts` file. `node --test` runs each test file
in its own process, so a helper living inside `pages.test.ts` would make every file
that imports it re-register and re-run the page tests.

```ts
import { buildApp } from '../src/app.ts';
import { MemoryStore } from '../src/store/memory.ts';

export async function harness() {
  const store = new MemoryStore();
  const app = await buildApp({ store, cookieSecret: 'test-secret-value' });
  const probe = await app.inject({ method: 'GET', url: '/healthz' });
  const cookie = probe.cookies.find((c) => c.name === 'sid')!.value;
  const sid = app.unsignCookie(cookie).value!;
  return { app, store, cookie, sid };
}

export function cookiesFor(cookie: string) {
  return { sid: cookie };
}
```

- [ ] **Step 10: Write the failing tests**

`test/pages.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
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

test('GET / shows an empty state when a filter matches nothing', async (t) => {
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
  const htmx: Awaited<ReturnType<FastifyInstance['inject']>> = await app.inject({
    method: 'GET',
    url: '/static/htmx.min.js',
  });

  assert.equal(css.statusCode, 200);
  assert.equal(htmx.statusCode, 200);
});
```

- [ ] **Step 11: Run the tests to verify they fail, then pass**

```bash
npm test
```

Expected first run: FAIL — `src/lib/params.ts` and friends missing. After Steps 2–8 are in place, re-run:

```bash
npm test && npm run typecheck
```

Expected: all page tests passing.

- [ ] **Step 12: Look at it in a browser**

```bash
npm run dev
```

Open `http://localhost:3000`. Expected: three seeded todos, a count of "3 left", filters, and a search box. Nothing is wired up yet — that is the next five tasks.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: Nunjucks views, vendored htmx, full-page render, error handler"
```

---

### Task 7: `GET /todos` — the list fragment behind search and filters

One endpoint serves both the search input and the filter links. Review Focus item 5 lives here.

**Files:**
- Create: `src/routes/todos.ts`
- Modify: `src/app.ts` (register `todosRoutes`)
- Test: `test/todos-list.test.ts`

**Interfaces:**
- Consumes: `fragments`, `parseListParams` (Task 6); `TodoStore` (Task 2); `harness` from `test/pages.test.ts`.
- Produces: `todosRoutes(app: FastifyInstance, store: TodoStore): void` — every later route task adds handlers to this same function.

- [ ] **Step 1: Write the failing tests**

`test/todos-list.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, cookiesFor } from './helpers.ts';

test('GET /todos returns only the list fragment, not a full page', async (t) => {
  const { app, cookie } = await harness();
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/todos', cookies: cookiesFor(cookie) });

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /^\s*<ul id="todo-list">/);
  assert.ok(!res.body.includes('<!doctype'), 'fragment must not include the layout');
});

test('GET /todos filters to active and done', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const first = store.list(sid, 'all')[0]!;
  store.setDone(sid, first.id, true);

  const active = await app.inject({ method: 'GET', url: '/todos?filter=active', cookies: cookiesFor(cookie) });
  const done = await app.inject({ method: 'GET', url: '/todos?filter=done', cookies: cookiesFor(cookie) });

  assert.ok(!active.body.includes(first.title));
  assert.match(done.body, new RegExp(first.title));
});

test('GET /todos searches by substring, case-insensitively', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  store.create(sid, 'Buy Oranges');

  const res = await app.inject({ method: 'GET', url: '/todos?q=ORANG', cookies: cookiesFor(cookie) });

  assert.match(res.body, /Buy Oranges/);
  assert.ok(!res.body.includes('Tick one off'));
});

test('a search query with regex metacharacters is matched literally', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  store.create(sid, 'literal .* match');

  const res = await app.inject({ method: 'GET', url: '/todos?q=.*', cookies: cookiesFor(cookie) });

  assert.match(res.body, /literal \.\* match/);
  assert.ok(!res.body.includes('Tick one off'), '.* must not behave as a wildcard');
});

test('a search query containing HTML is escaped everywhere it is echoed', async (t) => {
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

test('GET /todos sets HX-Push-Url pointing at the full page, never at /todos', async (t) => {
  const { app, cookie } = await harness();
  t.after(() => app.close());

  const res = await app.inject({
    method: 'GET',
    url: '/todos?filter=active&q=milk',
    cookies: cookiesFor(cookie),
  });

  assert.equal(res.headers['hx-push-url'], '/?filter=active&q=milk');
});

test('GET /todos with no matches returns the empty state', async (t) => {
  const { app, cookie } = await harness();
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/todos?q=zzzzz', cookies: cookiesFor(cookie) });

  assert.match(res.body, /Nothing here yet/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `GET /todos` returns the 404 page.

- [ ] **Step 3: Write `src/routes/todos.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { fragments } from '../lib/render.ts';
import { backUrl, parseListParams } from '../lib/params.ts';
import type { TodoStore } from '../store/types.ts';

export function todosRoutes(app: FastifyInstance, store: TodoStore): void {
  const frag = fragments(app);

  app.get('/todos', async (request, reply) => {
    const { filter, q } = parseListParams(request.query);
    const todos = store.list(request.sid, filter, q);

    reply.header('HX-Push-Url', backUrl({ query: { filter, q } }));
    return reply.type('text/html; charset=utf-8').send(await frag.list(todos, { filter, q }));
  });
}
```

`HX-Push-Url` is a response header rather than an `hx-push-url` attribute because the value is dynamic and must point at `/`, not at `/todos` — otherwise reloading or sharing the URL would render a bare `<ul>` with no page around it.

- [ ] **Step 4: Register it in `src/app.ts`**

Add the import and the call next to `pagesRoutes`:
```ts
import { todosRoutes } from './routes/todos.ts';
// …
  pagesRoutes(app, deps.store);
  todosRoutes(app, deps.store);
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test && npm run typecheck
```

Expected: all list tests passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: list fragment endpoint with search, filters, and HX-Push-Url"
```

---

### Task 8: `respond()` and `POST /todos` — create, validation, OOB count

The single most important task: `respond()` is the progressive-enhancement mechanism the whole app rests on. Review Focus item 1 lives here.

**Files:**
- Create: `src/lib/respond.ts`
- Modify: `src/routes/todos.ts` (add the create handler)
- Test: `test/todos-create.test.ts`

**Interfaces:**
- Consumes: `backUrl` (Task 6); `isHtmx` (Task 6); `TITLE_MAX` (Task 2).
- Produces:
  - `respond(request, reply, fragment: string): FastifyReply`
  - `parseTitle(value: unknown): string | null` — trimmed title, or `null` when invalid
  - `parseMutationCtx(request): { filter: Filter; q: string }`

- [ ] **Step 1: Write the failing tests**

`test/todos-create.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, cookiesFor } from './helpers.ts';

const HTMX = { 'hx-request': 'true' };

test('htmx create returns the new row plus an out-of-band count', async (t) => {
  const { app, cookie } = await harness();
  t.after(() => app.close());

  const res = await app.inject({
    method: 'POST',
    url: '/todos',
    headers: HTMX,
    cookies: cookiesFor(cookie),
    payload: { title: 'walk the dog', filter: 'all', q: '' },
  });

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<li id="todo-[0-9a-f-]{36}"/);
  assert.match(res.body, /walk the dog/);
  assert.match(res.body, /<span id="count" hx-swap-oob="true">4 left<\/span>/);
  assert.ok(!res.body.includes('<ul'), 'create swaps a row, not the whole list');
});

test('a create without the htmx header returns 303 and preserves filter and query', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());

  const res = await app.inject({
    method: 'POST',
    url: '/todos',
    cookies: cookiesFor(cookie),
    payload: { title: 'no-js todo', filter: 'active', q: 'dog' },
  });

  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.location, '/?filter=active&q=dog');
  assert.deepEqual(
    store.list(sid, 'all').map((todo) => todo.title).slice(-1),
    ['no-js todo'],
  );
});

test('the title is trimmed before storing', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());

  await app.inject({
    method: 'POST',
    url: '/todos',
    headers: HTMX,
    cookies: cookiesFor(cookie),
    payload: { title: '   padded   ' },
  });

  assert.equal(store.list(sid, 'all').at(-1)!.title, 'padded');
});

test('a whitespace-only title is a 422 and creates nothing', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const before = store.list(sid, 'all').length;

  const res = await app.inject({
    method: 'POST',
    url: '/todos',
    headers: HTMX,
    cookies: cookiesFor(cookie),
    payload: { title: '     ' },
  });

  assert.equal(res.statusCode, 422);
  assert.match(res.body, /id="form-error"/);
  assert.match(res.body, /1–200 characters/);
  assert.equal(store.list(sid, 'all').length, before);
});

test('a missing title field is a 422, not a crash', async (t) => {
  const { app, cookie } = await harness();
  t.after(() => app.close());

  const res = await app.inject({
    method: 'POST',
    url: '/todos',
    headers: HTMX,
    cookies: cookiesFor(cookie),
    payload: { filter: 'all' },
  });

  assert.equal(res.statusCode, 422);
});

test('a 201-character title is rejected and a 200-character title is accepted', async (t) => {
  const { app, cookie } = await harness();
  t.after(() => app.close());

  const tooLong = await app.inject({
    method: 'POST',
    url: '/todos',
    headers: HTMX,
    cookies: cookiesFor(cookie),
    payload: { title: 'x'.repeat(201) },
  });
  const justRight = await app.inject({
    method: 'POST',
    url: '/todos',
    headers: HTMX,
    cookies: cookiesFor(cookie),
    payload: { title: 'y'.repeat(200) },
  });

  assert.equal(tooLong.statusCode, 422);
  assert.equal(justRight.statusCode, 200);
});

test('a no-JS validation failure redirects with an error code the page can show', async (t) => {
  const { app, cookie } = await harness();
  t.after(() => app.close());

  const res = await app.inject({
    method: 'POST',
    url: '/todos',
    cookies: cookiesFor(cookie),
    payload: { title: '', filter: 'done' },
  });

  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.location, '/?filter=done&error=title');

  const page = await app.inject({
    method: 'GET',
    url: res.headers.location as string,
    cookies: cookiesFor(cookie),
  });
  assert.match(page.body, /1–200 characters/);
});

test('an emoji title round-trips intact', async (t) => {
  const { app, cookie } = await harness();
  t.after(() => app.close());

  const res = await app.inject({
    method: 'POST',
    url: '/todos',
    headers: HTMX,
    cookies: cookiesFor(cookie),
    payload: { title: 'ship it 🚀' },
  });

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /ship it 🚀/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `POST /todos` is not routed.

- [ ] **Step 3: Write `src/lib/respond.ts`**

```ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import { backUrl, parseListParams } from './params.ts';
import { isHtmx } from './error-handler.ts';
import { TITLE_MAX, type Filter } from '../store/types.ts';

export function respond(
  request: FastifyRequest,
  reply: FastifyReply,
  fragment: string,
): FastifyReply {
  if (!isHtmx(request.headers as Record<string, unknown>)) {
    return reply.redirect(backUrl(request), 303);
  }
  return reply.type('text/html; charset=utf-8').send(fragment);
}

export function respondInvalid(
  request: FastifyRequest,
  reply: FastifyReply,
  fragment: string,
  code: string,
): FastifyReply {
  reply.code(422);
  if (!isHtmx(request.headers as Record<string, unknown>)) {
    return reply.redirect(backUrl(request, { error: code }), 303);
  }
  return reply.type('text/html; charset=utf-8').send(fragment);
}

export function parseTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > TITLE_MAX) return null;
  return trimmed;
}

export function parseMutationCtx(request: FastifyRequest): { filter: Filter; q: string } {
  const merged = {
    ...((request.query as Record<string, unknown>) ?? {}),
    ...((request.body as Record<string, unknown>) ?? {}),
  };
  const { filter, q } = parseListParams(merged);
  return { filter, q };
}
```

Note `respondInvalid` sets 422 for htmx but 303 for a plain form, because a redirect carrying `error=title` is the only way a no-JS browser can be shown the message. The status codes differ on purpose; the contract test in Task 13 exempts validation failures for exactly this reason.

- [ ] **Step 4: Add the create handler to `src/routes/todos.ts`**

Inside `todosRoutes`, after the `GET /todos` handler:
```ts
  app.post('/todos', async (request, reply) => {
    const ctx = parseMutationCtx(request);
    const title = parseTitle((request.body as Record<string, unknown> | undefined)?.title);

    if (title === null) {
      return respondInvalid(
        request,
        reply,
        await frag.error('Title must be 1–200 characters.'),
        'title',
      );
    }

    const todo = store.create(request.sid, title);
    const html = (await frag.row(todo, ctx)) + (await frag.count(store.remaining(request.sid)));
    return respond(request, reply, html);
  });
```

Add to the imports at the top of the file:
```ts
import { parseMutationCtx, parseTitle, respond, respondInvalid } from '../lib/respond.ts';
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test && npm run typecheck
```

Expected: all create tests passing.

- [ ] **Step 6: Check both paths by hand**

```bash
npm run dev
```

Add a todo in the browser (htmx path: the row appears, the count updates, the input clears). Then disable JavaScript in DevTools and add another (no-JS path: the page reloads and the todo is there). Both must work.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: create todos with OOB count, 422 validation, and no-JS fallback"
```

---

### Task 9: Toggle complete

**Files:**
- Modify: `src/routes/todos.ts`
- Test: `test/todos-toggle.test.ts`

**Interfaces:**
- Consumes: `respond`, `parseMutationCtx` (Task 8); `store.setDone` (Task 2).
- Produces: no new interfaces. Demonstrates the `method: ['PATCH', 'POST']` array that makes one handler serve both htmx and a plain form.

- [ ] **Step 1: Write the failing tests**

`test/todos-toggle.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, cookiesFor } from './helpers.ts';

const HTMX = { 'hx-request': 'true' };

test('PATCH marks a todo done and returns the row plus the OOB count', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const todo = store.list(sid, 'all')[0]!;

  const res = await app.inject({
    method: 'PATCH',
    url: `/todos/${todo.id}/done`,
    headers: HTMX,
    cookies: cookiesFor(cookie),
    payload: { done: 'true', filter: 'all', q: '' },
  });

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /class="todo is-done"/);
  assert.match(res.body, /<span id="count" hx-swap-oob="true">2 left<\/span>/);
  assert.equal(store.get(sid, todo.id).done, true);
});

test('the same URL accepts POST for the no-JS path and redirects', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const todo = store.list(sid, 'all')[0]!;

  const res = await app.inject({
    method: 'POST',
    url: `/todos/${todo.id}/done`,
    cookies: cookiesFor(cookie),
    payload: { done: 'true', filter: 'active', q: '' },
  });

  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.location, '/?filter=active');
  assert.equal(store.get(sid, todo.id).done, true);
});

test('done=false un-completes a todo', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const todo = store.list(sid, 'all')[0]!;
  store.setDone(sid, todo.id, true);

  const res = await app.inject({
    method: 'PATCH',
    url: `/todos/${todo.id}/done`,
    headers: HTMX,
    cookies: cookiesFor(cookie),
    payload: { done: 'false' },
  });

  assert.equal(store.get(sid, todo.id).done, false);
  assert.ok(!res.body.includes('is-done'));
  assert.match(res.body, /<span id="count" hx-swap-oob="true">3 left<\/span>/);
});

test('the returned row carries the opposite hidden done value, so the next click toggles back', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const todo = store.list(sid, 'all')[0]!;

  const res = await app.inject({
    method: 'PATCH',
    url: `/todos/${todo.id}/done`,
    headers: HTMX,
    cookies: cookiesFor(cookie),
    payload: { done: 'true' },
  });

  assert.match(res.body, /name="done" value="false"/);
});

test('toggling a todo from another session is a 404, not a cross-session write', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const mine = store.list(sid, 'all')[0]!;
  const theirs = store.create('someone-else', 'not yours');

  const res = await app.inject({
    method: 'PATCH',
    url: `/todos/${theirs.id}/done`,
    headers: HTMX,
    cookies: cookiesFor(cookie),
    payload: { done: 'true' },
  });

  assert.equal(res.statusCode, 404);
  assert.equal(store.get('someone-else', theirs.id).done, false);
  assert.equal(store.get(sid, mine.id).done, false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test
```

Expected: FAIL — no route for `/todos/:id/done`.

- [ ] **Step 3: Add the handler to `src/routes/todos.ts`**

```ts
  app.route({
    method: ['PATCH', 'POST'],
    url: '/todos/:id/done',
    handler: async (request, reply) => {
      const ctx = parseMutationCtx(request);
      const { id } = request.params as { id: string };
      const done = (request.body as Record<string, unknown> | undefined)?.done === 'true';

      const todo = store.setDone(request.sid, id, done);
      const html = (await frag.row(todo, ctx)) + (await frag.count(store.remaining(request.sid)));
      return respond(request, reply, html);
    },
  });
```

`done` is read as an explicit `'true'` string rather than inferred, so an absent field means `false` deterministically. The row macro always emits the opposite value in its hidden input, which is what makes the button a toggle.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test && npm run typecheck
```

Expected: all toggle tests passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: toggle todos via one handler serving PATCH and POST"
```

---

### Task 10: Inline edit

Three endpoints: swap a row into an edit form, swap it back (Cancel), and save the rename.

**Files:**
- Modify: `src/routes/todos.ts`
- Test: `test/todos-edit.test.ts`

**Interfaces:**
- Consumes: `frag.edit`, `frag.row` (Task 6); `parseTitle`, `respondInvalid` (Task 8); `store.rename` (Task 2).
- Produces: no new interfaces.

- [ ] **Step 1: Write the failing tests**

`test/todos-edit.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, cookiesFor } from './helpers.ts';

const HTMX = { 'hx-request': 'true' };

test('GET /todos/:id/edit returns the row as an edit form', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const todo = store.list(sid, 'all')[0]!;

  const res = await app.inject({
    method: 'GET',
    url: `/todos/${todo.id}/edit`,
    headers: HTMX,
    cookies: cookiesFor(cookie),
  });

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /class="todo is-editing"/);
  assert.match(res.body, new RegExp(`name="title" value="${todo.title}"`));
  assert.match(res.body, /Cancel/);
});

test('GET /todos/:id returns the plain row, which is how Cancel works', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const todo = store.list(sid, 'all')[0]!;

  const res = await app.inject({
    method: 'GET',
    url: `/todos/${todo.id}`,
    headers: HTMX,
    cookies: cookiesFor(cookie),
  });

  assert.equal(res.statusCode, 200);
  assert.match(res.body, new RegExp(`<li id="todo-${todo.id}"`));
  assert.ok(!res.body.includes('is-editing'));
});

test('PATCH saves the new title and returns the plain row', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const todo = store.list(sid, 'all')[0]!;

  const res = await app.inject({
    method: 'PATCH',
    url: `/todos/${todo.id}/title`,
    headers: HTMX,
    cookies: cookiesFor(cookie),
    payload: { title: '  renamed properly  ', filter: 'all', q: '' },
  });

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /renamed properly/);
  assert.ok(!res.body.includes('is-editing'));
  assert.match(res.body, /<span id="count" hx-swap-oob="true">3 left<\/span>/);
  assert.equal(store.get(sid, todo.id).title, 'renamed properly');
});

test('POST to the same URL redirects for the no-JS path', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const todo = store.list(sid, 'all')[0]!;

  const res = await app.inject({
    method: 'POST',
    url: `/todos/${todo.id}/title`,
    cookies: cookiesFor(cookie),
    payload: { title: 'no-js rename', filter: 'all', q: '' },
  });

  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.location, '/?filter=all');
  assert.equal(store.get(sid, todo.id).title, 'no-js rename');
});

test('an empty rename is a 422 and leaves the title untouched', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const todo = store.list(sid, 'all')[0]!;
  const original = todo.title;

  const res = await app.inject({
    method: 'PATCH',
    url: `/todos/${todo.id}/title`,
    headers: HTMX,
    cookies: cookiesFor(cookie),
    payload: { title: '   ' },
  });

  assert.equal(res.statusCode, 422);
  assert.equal(store.get(sid, todo.id).title, original);
});

test('editing a todo that no longer exists is a 404', async (t) => {
  const { app, cookie } = await harness();
  t.after(() => app.close());

  const res = await app.inject({
    method: 'GET',
    url: '/todos/00000000-0000-0000-0000-000000000000/edit',
    headers: HTMX,
    cookies: cookiesFor(cookie),
  });

  assert.equal(res.statusCode, 404);
  assert.match(res.body, /That todo is gone/);
});

test('a title containing markup is escaped in the edit form value', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const todo = store.create(sid, '"><script>alert(1)</script>');

  const res = await app.inject({
    method: 'GET',
    url: `/todos/${todo.id}/edit`,
    headers: HTMX,
    cookies: cookiesFor(cookie),
  });

  assert.ok(!res.body.includes('<script>alert(1)</script>'));
  assert.match(res.body, /&#34;&gt;&lt;script&gt;/);
});
```

Note: Nunjucks escapes `"` as `&#34;`. If the assertion fails on the exact entity, print `res.body` and match what Nunjucks actually emits — the requirement is that no raw `<script>` survives, not a specific entity spelling.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test
```

Expected: FAIL — no routes for edit or title.

- [ ] **Step 3: Add the three handlers to `src/routes/todos.ts`**

```ts
  app.get('/todos/:id/edit', async (request, reply) => {
    const ctx = parseMutationCtx(request);
    const todo = store.get(request.sid, (request.params as { id: string }).id);
    return reply.type('text/html; charset=utf-8').send(await frag.edit(todo, ctx));
  });

  app.get('/todos/:id', async (request, reply) => {
    const ctx = parseMutationCtx(request);
    const todo = store.get(request.sid, (request.params as { id: string }).id);
    return reply.type('text/html; charset=utf-8').send(await frag.row(todo, ctx));
  });

  app.route({
    method: ['PATCH', 'POST'],
    url: '/todos/:id/title',
    handler: async (request, reply) => {
      const ctx = parseMutationCtx(request);
      const { id } = request.params as { id: string };
      const title = parseTitle((request.body as Record<string, unknown> | undefined)?.title);

      if (title === null) {
        return respondInvalid(
          request,
          reply,
          await frag.error('Title must be 1–200 characters.'),
          'title',
        );
      }

      const todo = store.rename(request.sid, id, title);
      const html = (await frag.row(todo, ctx)) + (await frag.count(store.remaining(request.sid)));
      return respond(request, reply, html);
    },
  });
```

Rename cannot change the count, but it returns the OOB count anyway so that every mutation has one identical response shape — which is what Task 13's contract test enforces.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test && npm run typecheck
```

Expected: all edit tests passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: inline edit with fragment swap and no-JS full-page fallback"
```

---

### Task 11: Delete and undo

The richest htmx interaction in the app: one response removes a row, raises a toast, and updates the count through three top-level elements. Review Focus item 4 lives here.

**Files:**
- Modify: `src/routes/todos.ts`
- Test: `test/todos-delete.test.ts`

**Interfaces:**
- Consumes: `frag.toast`, `frag.list` (Task 6); `store.remove`, `store.restore`, `ExpiredUndo`, `UNDO_TTL_MS` (Tasks 2–3).
- Produces: no new interfaces.

- [ ] **Step 1: Write the failing tests**

`test/todos-delete.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.ts';
import { MemoryStore } from '../src/store/memory.ts';
import { UNDO_TTL_MS } from '../src/store/types.ts';
import { harness, cookiesFor } from './helpers.ts';

const HTMX = { 'hx-request': 'true' };

async function clockHarness() {
  let clock = new Date('2026-09-26T12:00:00.000Z');
  const store = new MemoryStore({ now: () => clock });
  const app = await buildApp({ store, cookieSecret: 'test-secret-value' });
  const probe = await app.inject({ method: 'GET', url: '/healthz' });
  const cookie = probe.cookies.find((c) => c.name === 'sid')!.value;
  return {
    app,
    store,
    cookie,
    sid: app.unsignCookie(cookie).value!,
    advance(ms: number) {
      clock = new Date(clock.getTime() + ms);
    },
  };
}

test('DELETE removes the row, raises an undo toast, and updates the count', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const todo = store.list(sid, 'all')[0]!;

  const res = await app.inject({
    method: 'DELETE',
    url: `/todos/${todo.id}`,
    headers: HTMX,
    cookies: cookiesFor(cookie),
    payload: { filter: 'all', q: '' },
  });

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<div id="toast" hx-swap-oob="true">/);
  assert.match(res.body, /Undo/);
  assert.match(res.body, /<span id="count" hx-swap-oob="true">2 left<\/span>/);
  assert.ok(!res.body.includes('<li id="todo-'), 'no row in the primary swap, so the row is removed');
  assert.equal(store.list(sid, 'all').length, 2);
});

test('the toast shows the deleted title, escaped', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const todo = store.create(sid, '<b>bold</b>');

  const res = await app.inject({
    method: 'DELETE',
    url: `/todos/${todo.id}`,
    headers: HTMX,
    cookies: cookiesFor(cookie),
  });

  assert.ok(!res.body.includes('<b>bold</b>'));
  assert.match(res.body, /&lt;b&gt;bold&lt;\/b&gt;/);
});

test('POST to the same URL deletes for the no-JS path', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const todo = store.list(sid, 'all')[0]!;

  const res = await app.inject({
    method: 'POST',
    url: `/todos/${todo.id}`,
    cookies: cookiesFor(cookie),
    payload: { filter: 'done', q: 'x' },
  });

  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.location, '/?filter=done&q=x');
  assert.equal(store.list(sid, 'all').length, 2);
});

test('restore returns the full list, an empty toast, and the count', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const todo = store.list(sid, 'all')[1]!;
  await app.inject({
    method: 'DELETE',
    url: `/todos/${todo.id}`,
    headers: HTMX,
    cookies: cookiesFor(cookie),
  });

  const res = await app.inject({
    method: 'POST',
    url: `/todos/${todo.id}/restore`,
    headers: HTMX,
    cookies: cookiesFor(cookie),
    payload: { filter: 'all', q: '' },
  });

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<ul id="todo-list">/);
  assert.match(res.body, new RegExp(todo.title));
  assert.match(res.body, /<span id="count" hx-swap-oob="true">3 left<\/span>/);
  assert.deepEqual(store.list(sid, 'all').map((item) => item.title)[1], todo.title);
});

test('deleting the same id twice returns a designed 404, not a crash', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const todo = store.list(sid, 'all')[0]!;
  await app.inject({
    method: 'DELETE',
    url: `/todos/${todo.id}`,
    headers: HTMX,
    cookies: cookiesFor(cookie),
  });

  const res = await app.inject({
    method: 'DELETE',
    url: `/todos/${todo.id}`,
    headers: HTMX,
    cookies: cookiesFor(cookie),
  });

  assert.equal(res.statusCode, 404);
  assert.match(res.body, /That todo is gone/);
  assert.ok(!res.body.includes('Error:'), 'no stack trace may reach the browser');
});

test('undo past the 30-second TTL returns 410 with an explanatory toast', async (t) => {
  const h = await clockHarness();
  t.after(() => h.app.close());
  const todo = h.store.list(h.sid, 'all')[0]!;
  await h.app.inject({
    method: 'DELETE',
    url: `/todos/${todo.id}`,
    headers: HTMX,
    cookies: cookiesFor(h.cookie),
  });

  h.advance(UNDO_TTL_MS + 1);
  const res = await h.app.inject({
    method: 'POST',
    url: `/todos/${todo.id}/restore`,
    headers: HTMX,
    cookies: cookiesFor(h.cookie),
  });

  assert.equal(res.statusCode, 410);
  assert.match(res.body, /Too late to undo/);
  assert.equal(h.store.list(h.sid, 'all').length, 2);
});

test('undo just inside the TTL still restores', async (t) => {
  const h = await clockHarness();
  t.after(() => h.app.close());
  const todo = h.store.list(h.sid, 'all')[0]!;
  await h.app.inject({
    method: 'DELETE',
    url: `/todos/${todo.id}`,
    headers: HTMX,
    cookies: cookiesFor(h.cookie),
  });

  h.advance(UNDO_TTL_MS - 1);
  const res = await h.app.inject({
    method: 'POST',
    url: `/todos/${todo.id}/restore`,
    headers: HTMX,
    cookies: cookiesFor(h.cookie),
  });

  assert.equal(res.statusCode, 200);
  assert.equal(h.store.list(h.sid, 'all').length, 3);
});

test('a restore while a filter is active returns the filtered list', async (t) => {
  const { app, store, cookie, sid } = await harness();
  t.after(() => app.close());
  const todo = store.list(sid, 'all')[0]!;
  store.setDone(sid, todo.id, true);
  await app.inject({
    method: 'DELETE',
    url: `/todos/${todo.id}`,
    headers: HTMX,
    cookies: cookiesFor(cookie),
  });

  const res = await app.inject({
    method: 'POST',
    url: `/todos/${todo.id}/restore`,
    headers: HTMX,
    cookies: cookiesFor(cookie),
    payload: { filter: 'done', q: '' },
  });

  assert.match(res.body, new RegExp(todo.title));
  assert.ok(!res.body.includes('Tick one off'), 'the done filter must exclude active todos');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test
```

Expected: FAIL — no delete or restore routes.

- [ ] **Step 3: Add the handlers to `src/routes/todos.ts`**

```ts
  app.route({
    method: ['DELETE', 'POST'],
    url: '/todos/:id',
    handler: async (request, reply) => {
      const ctx = parseMutationCtx(request);
      const todo = store.remove(request.sid, (request.params as { id: string }).id);

      const html =
        (await frag.toast(todo, ctx)) + (await frag.count(store.remaining(request.sid)));
      return respond(request, reply, html);
    },
  });

  app.post('/todos/:id/restore', async (request, reply) => {
    const ctx = parseMutationCtx(request);
    store.restore(request.sid, (request.params as { id: string }).id);

    const html =
      (await frag.list(store.list(request.sid, ctx.filter, ctx.q), ctx)) +
      (await frag.toast(null, ctx)) +
      (await frag.count(store.remaining(request.sid)));
    return respond(request, reply, html);
  });
```

Every element in the delete response is out-of-band, so htmx's *primary* swap content is empty — which is exactly how the row gets removed from `#todo-<id>` with `hx-swap="outerHTML"`. No separate "remove the row" mechanism is needed.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test && npm run typecheck
```

Expected: all delete and undo tests passing.

- [ ] **Step 5: Try it in the browser**

```bash
npm run dev
```

Delete a todo: the row vanishes, a toast appears, the count drops. Click Undo: the todo returns in its original position and the toast clears. Wait 31 seconds before clicking Undo: the toast says it is too late.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: delete with out-of-band undo toast and 30s restore window"
```

---

### Task 12: Configuration, snapshot wiring, sweeping, rate limiting

Turns the tested app into a real process: validated configuration, persistence across restarts, an hourly sweep, a graceful shutdown that flushes, and rate limits on mutations.

**Files:**
- Create: `src/lib/config.ts`
- Modify: `src/app.ts` (rate limit), `src/server.ts` (config, snapshot, sweeper, SIGTERM flush)
- Test: `test/config.test.ts`, `test/rate-limit.test.ts`

**Interfaces:**
- Consumes: `SnapshotStore` (Task 4); `buildApp` (Task 6).
- Produces:
  - `loadConfig(env?: NodeJS.ProcessEnv): Config` where `Config = { port: number; cookieSecret: string; snapshotPath: string; isProduction: boolean }`
  - `AppDeps` widened with `rateLimitMax?: number` (default 60)

- [ ] **Step 1: Write the failing config tests**

`test/config.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/lib/config.ts';

test('development gets working defaults', () => {
  const config = loadConfig({});

  assert.equal(config.port, 3000);
  assert.equal(config.isProduction, false);
  assert.ok(config.cookieSecret.length >= 32);
  assert.equal(config.snapshotPath, 'data/sessions.json');
});

test('PORT and SNAPSHOT_PATH are read from the environment', () => {
  const config = loadConfig({ PORT: '8080', SNAPSHOT_PATH: '/data/sessions.json' });

  assert.equal(config.port, 8080);
  assert.equal(config.snapshotPath, '/data/sessions.json');
});

test('production without COOKIE_SECRET refuses to boot', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /COOKIE_SECRET/);
});

test('production with a too-short COOKIE_SECRET refuses to boot', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', COOKIE_SECRET: 'short' }),
    /COOKIE_SECRET/,
  );
});

test('production with a proper secret is accepted', () => {
  const config = loadConfig({ NODE_ENV: 'production', COOKIE_SECRET: 'z'.repeat(32) });

  assert.equal(config.isProduction, true);
  assert.equal(config.cookieSecret, 'z'.repeat(32));
});

test('a non-numeric PORT is rejected rather than becoming NaN', () => {
  assert.throws(() => loadConfig({ PORT: 'not-a-port' }), /PORT/);
});
```

- [ ] **Step 2: Write `src/lib/config.ts`**

```ts
export type Config = {
  port: number;
  cookieSecret: string;
  snapshotPath: string;
  isProduction: boolean;
};

const DEV_SECRET = 'dev-only-secret-not-for-production!!';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const isProduction = env.NODE_ENV === 'production';

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, got ${String(env.PORT)}`);
  }

  const cookieSecret = env.COOKIE_SECRET ?? (isProduction ? '' : DEV_SECRET);
  if (isProduction && cookieSecret.length < 32) {
    throw new Error('COOKIE_SECRET must be set to at least 32 characters in production');
  }

  return {
    port,
    cookieSecret,
    snapshotPath: env.SNAPSHOT_PATH ?? 'data/sessions.json',
    isProduction,
  };
}
```

- [ ] **Step 3: Write the failing rate-limit test**

`test/rate-limit.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.ts';
import { MemoryStore } from '../src/store/memory.ts';

test('mutations are rate limited and reads are not', async (t) => {
  const store = new MemoryStore();
  const app = await buildApp({ store, cookieSecret: 'test-secret-value', rateLimitMax: 3 });
  t.after(() => app.close());
  const probe = await app.inject({ method: 'GET', url: '/healthz' });
  const cookie = probe.cookies.find((c) => c.name === 'sid')!.value;

  const codes: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const res = await app.inject({
      method: 'POST',
      url: '/todos',
      headers: { 'hx-request': 'true' },
      cookies: { sid: cookie },
      payload: { title: `todo ${i}` },
    });
    codes.push(res.statusCode);
  }

  assert.deepEqual(codes.slice(0, 3), [200, 200, 200]);
  assert.deepEqual(codes.slice(3), [429, 429]);

  const read = await app.inject({ method: 'GET', url: '/todos', cookies: { sid: cookie } });
  assert.equal(read.statusCode, 200);
});
```

- [ ] **Step 4: Add rate limiting in `src/app.ts`**

Widen `AppDeps` and register the plugin:
```ts
import rateLimit from '@fastify/rate-limit';

export type AppDeps = {
  store: TodoStore;
  cookieSecret: string;
  rateLimitMax?: number;
};
```
After the `formbody` registration:
```ts
  await app.register(rateLimit, {
    global: false,
    max: deps.rateLimitMax ?? 60,
    timeWindow: '1 minute',
  });
```

Then in `src/routes/todos.ts`, add the per-route config to each **mutating** route (`POST /todos`, `/todos/:id/done`, `/todos/:id/title`, `/todos/:id`, `/todos/:id/restore`) — not to the GETs. For `app.route({...})` calls add a sibling key:
```ts
    config: { rateLimit: {} },
```
and for `app.post('/todos', …)` convert it to the options form:
```ts
  app.post('/todos', { config: { rateLimit: {} } }, async (request, reply) => { /* unchanged body */ });
```

An empty `rateLimit: {}` opts the route into the plugin's configured limits while `global: false` leaves reads untouched.

- [ ] **Step 5: Rewrite `src/server.ts`**

```ts
import { buildApp } from './app.ts';
import { loadConfig } from './lib/config.ts';
import { MemoryStore } from './store/memory.ts';
import { SnapshotStore } from './store/snapshot.ts';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

const config = loadConfig();

const inner = new MemoryStore();
await SnapshotStore.load(inner, config.snapshotPath);
const store = new SnapshotStore(inner, { path: config.snapshotPath });

const app = await buildApp({ store, cookieSecret: config.cookieSecret });

const sweeper = setInterval(() => store.sweep(new Date()), SWEEP_INTERVAL_MS);
sweeper.unref();
store.sweep(new Date());

await app.listen({ host: '0.0.0.0', port: config.port });
console.log(`listening on http://0.0.0.0:${config.port}`);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    clearInterval(sweeper);
    await app.close();
    await store.flush();
    process.exit(0);
  });
}
```

Order matters on shutdown: stop accepting requests, *then* flush, so the snapshot includes every mutation the server accepted.

- [ ] **Step 6: Run everything**

```bash
npm test && npm run typecheck
```

Expected: config and rate-limit tests passing, everything else still green.

- [ ] **Step 7: Verify persistence across a restart by hand**

```bash
rm -rf data
SNAPSHOT_PATH=data/sessions.json PORT=3002 node src/server.ts &
sleep 1
curl -s -c /tmp/jar.txt localhost:3002/ > /dev/null
curl -s -b /tmp/jar.txt -X POST localhost:3002/todos -d 'title=survives a restart' -o /dev/null
sleep 2
kill -TERM %1
sleep 1
grep -c 'survives a restart' data/sessions.json
SNAPSHOT_PATH=data/sessions.json PORT=3002 node src/server.ts &
sleep 1
curl -s -b /tmp/jar.txt localhost:3002/ | grep -c 'survives a restart'
kill -TERM %1
```

Expected: `1` from both greps — the todo is on disk and comes back after a restart.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: validated config, snapshot persistence, hourly sweep, rate limits"
```

---

### Task 13: Architecture contract tests

Two tests that hold the design in place as the app grows. Both iterate over every mutating endpoint, so a future endpoint that forgets the OOB count or the no-JS fallback fails the suite instead of shipping.

**Files:**
- Test: `test/contract.test.ts`

**Interfaces:**
- Consumes: the whole app surface.
- Produces: no new interfaces.

- [ ] **Step 1: Write the tests**

`test/contract.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, cookiesFor } from './helpers.ts';
import type { FastifyInstance } from 'fastify';

type Case = {
  name: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  url: (ids: { a: string; b: string }) => string;
  payload: Record<string, string>;
  setup?: (app: FastifyInstance, cookie: string, ids: { a: string; b: string }) => Promise<void>;
};

const CASES: Case[] = [
  {
    name: 'create',
    method: 'POST',
    url: () => '/todos',
    payload: { title: 'contract case', filter: 'all', q: '' },
  },
  {
    name: 'toggle',
    method: 'PATCH',
    url: (ids) => `/todos/${ids.a}/done`,
    payload: { done: 'true', filter: 'all', q: '' },
  },
  {
    name: 'rename',
    method: 'PATCH',
    url: (ids) => `/todos/${ids.a}/title`,
    payload: { title: 'contract rename', filter: 'all', q: '' },
  },
  {
    name: 'delete',
    method: 'DELETE',
    url: (ids) => `/todos/${ids.b}`,
    payload: { filter: 'all', q: '' },
  },
  {
    name: 'restore',
    method: 'POST',
    url: (ids) => `/todos/${ids.b}/restore`,
    payload: { filter: 'all', q: '' },
    setup: async (app, cookie, ids) => {
      await app.inject({
        method: 'DELETE',
        url: `/todos/${ids.b}`,
        headers: { 'hx-request': 'true' },
        cookies: cookiesFor(cookie),
      });
    },
  },
];

for (const testCase of CASES) {
  test(`${testCase.name} returns an out-of-band count`, async (t) => {
    const { app, store, cookie, sid } = await harness();
    t.after(() => app.close());
    const todos = store.list(sid, 'all');
    const ids = { a: todos[0]!.id, b: todos[1]!.id };
    await testCase.setup?.(app, cookie, ids);

    const res = await app.inject({
      method: testCase.method,
      url: testCase.url(ids),
      headers: { 'hx-request': 'true' },
      cookies: cookiesFor(cookie),
      payload: testCase.payload,
    });

    assert.equal(res.statusCode, 200, `${testCase.name} should succeed`);
    assert.match(
      res.body,
      /<span id="count" hx-swap-oob="true">/,
      `${testCase.name} must return the OOB count so the badge cannot drift`,
    );
  });

  test(`${testCase.name} falls back to a 303 without the htmx header`, async (t) => {
    const { app, store, cookie, sid } = await harness();
    t.after(() => app.close());
    const todos = store.list(sid, 'all');
    const ids = { a: todos[0]!.id, b: todos[1]!.id };
    await testCase.setup?.(app, cookie, ids);

    const res = await app.inject({
      method: 'POST',
      url: testCase.url(ids),
      cookies: cookiesFor(cookie),
      payload: testCase.payload,
    });

    assert.equal(res.statusCode, 303, `${testCase.name} must work as a plain form POST`);
    assert.match(res.headers.location as string, /^\/\?filter=/);
  });
}

test('every mutating route accepts POST, so no-JS forms can reach it', async (t) => {
  const { app } = await harness();
  t.after(() => app.close());

  const routes = app.printRoutes({ commonPrefix: false });
  for (const path of ['/todos', '/todos/:id', '/todos/:id/done', '/todos/:id/title', '/todos/:id/restore']) {
    assert.ok(routes.includes(path), `expected ${path} in the route table`);
  }
  assert.match(routes, /POST/);
});
```

Note the second test always sends `POST`, which is the point: a plain HTML form can only issue GET or POST, so every mutating URL must answer POST even where htmx uses PATCH or DELETE. Validation failures are excluded from these cases because `respondInvalid` deliberately returns 422 to htmx and 303 with `error=title` to a form — a documented, tested difference.

- [ ] **Step 2: Run the tests**

```bash
npm test
```

Expected: all contract tests passing. If `restore` fails with 410, check that `setup` runs before the timed request.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: contract tests for OOB count and no-JS 303 on every mutation"
```

---

### Task 14: Playwright — the real browser, with and without JavaScript

The second test is the portfolio's centerpiece: executable proof that the app works with JavaScript off.

**Files:**
- Create: `playwright.config.ts`, `e2e/todo.spec.ts`, `e2e/no-js.spec.ts`
- Modify: `package.json` (devDependency)
- Test: the two spec files

**Interfaces:**
- Consumes: the running server.
- Produces: `npm run test:e2e`.

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Write `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 15_000,
  use: { baseURL: 'http://127.0.0.1:3100' },
  webServer: {
    command: 'node src/server.ts',
    url: 'http://127.0.0.1:3100/healthz',
    reuseExistingServer: false,
    env: { PORT: '3100', SNAPSHOT_PATH: 'test-results/e2e-sessions.json' },
  },
});
```

- [ ] **Step 3: Write `e2e/todo.spec.ts`**

```ts
import { expect, test } from '@playwright/test';

test('the full flow works through htmx without a page reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#count')).toHaveText('3 left');

  // Adding a todo swaps in one row and updates the count out-of-band.
  await page.fill('#new-todo input[name="title"]', 'walk the dog');
  await page.click('#new-todo button[type="submit"]');
  await expect(page.locator('.todo', { hasText: 'walk the dog' })).toBeVisible();
  await expect(page.locator('#count')).toHaveText('4 left');
  await expect(page.locator('#new-todo input[name="title"]')).toHaveValue('');

  // The page never navigated: htmx swapped fragments in place.
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => navigations.push(frame.url()));

  // Toggling.
  const row = page.locator('.todo', { hasText: 'walk the dog' });
  await row.locator('.toggle').click();
  await expect(row).toHaveClass(/is-done/);
  await expect(page.locator('#count')).toHaveText('3 left');

  // Inline editing.
  await row.locator('.edit').click();
  await row.locator('input[name="title"]').fill('walk the dog twice');
  await row.locator('button[type="submit"]').click();
  await expect(page.locator('.todo', { hasText: 'walk the dog twice' })).toBeVisible();

  // Searching.
  await page.fill('#search input[type="search"]', 'dog');
  await expect(page.locator('#todo-list .todo')).toHaveCount(1);
  await expect(page).toHaveURL(/\?filter=all&q=dog/);

  await page.fill('#search input[type="search"]', '');
  await expect(page.locator('#todo-list .todo')).toHaveCount(4);

  // Deleting, then undoing.
  const target = page.locator('.todo', { hasText: 'Tick one off' });
  await target.locator('.delete').click();
  await expect(page.locator('#toast')).toContainText('Deleted');
  await expect(page.locator('.todo', { hasText: 'Tick one off' })).toHaveCount(0);

  await page.locator('#toast button[type="submit"]').click();
  await expect(page.locator('.todo', { hasText: 'Tick one off' })).toBeVisible();
  await expect(page.locator('#toast')).not.toContainText('Deleted');

  expect(navigations, 'htmx should swap fragments, never navigate').toEqual([]);
});

test('each visitor gets their own list', async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();

  const pageOne = await first.newPage();
  await pageOne.goto('/');
  await pageOne.fill('#new-todo input[name="title"]', 'only mine');
  await pageOne.click('#new-todo button[type="submit"]');
  await expect(pageOne.locator('.todo', { hasText: 'only mine' })).toBeVisible();

  const pageTwo = await second.newPage();
  await pageTwo.goto('/');
  await expect(pageTwo.locator('.todo', { hasText: 'only mine' })).toHaveCount(0);

  await first.close();
  await second.close();
});
```

- [ ] **Step 4: Write `e2e/no-js.spec.ts`**

```ts
import { expect, test } from '@playwright/test';

test.use({ javaScriptEnabled: false });

test('every action works with JavaScript disabled', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#count')).toHaveText('3 left');

  // Add — a plain form POST followed by a 303 back to the page.
  await page.fill('#new-todo input[name="title"]', 'no-js todo');
  await page.click('#new-todo button[type="submit"]');
  await expect(page.locator('.todo', { hasText: 'no-js todo' })).toBeVisible();
  await expect(page.locator('#count')).toHaveText('4 left');

  // Toggle — the submit button carries an explicit done value.
  const row = page.locator('.todo', { hasText: 'no-js todo' });
  await row.locator('.toggle').click();
  await expect(page.locator('.todo.is-done', { hasText: 'no-js todo' })).toBeVisible();
  await expect(page.locator('#count')).toHaveText('3 left');

  // Edit — the Edit link is a real href to /?edit=<id>.
  await page.locator('.todo', { hasText: 'no-js todo' }).locator('.edit').click();
  await expect(page.locator('.todo.is-editing')).toBeVisible();
  await page.fill('.todo.is-editing input[name="title"]', 'renamed without js');
  await page.click('.todo.is-editing button[type="submit"]');
  await expect(page.locator('.todo', { hasText: 'renamed without js' })).toBeVisible();

  // Filter — filter links are real hrefs.
  await page.click('#filters a:has-text("done")');
  await expect(page).toHaveURL(/filter=done/);
  await expect(page.locator('.todo', { hasText: 'renamed without js' })).toBeVisible();
  await expect(page.locator('.todo', { hasText: 'Tick one off' })).toHaveCount(0);

  // Search — the noscript submit button posts the search form.
  await page.goto('/');
  await page.fill('#search input[type="search"]', 'Tick');
  await page.click('#search button[type="submit"]');
  await expect(page.locator('#todo-list .todo')).toHaveCount(1);

  // Delete, then undo — both plain form POSTs.
  await page.goto('/');
  await page.locator('.todo', { hasText: 'Tick one off' }).locator('.delete').click();
  await expect(page.locator('.todo', { hasText: 'Tick one off' })).toHaveCount(0);
});

test('a validation failure shows a message without JavaScript', async ({ page }) => {
  await page.goto('/');

  // A whitespace-only title satisfies `required`, so the browser submits it and
  // the server is the one that rejects it — which is the path under test.
  await page.fill('#new-todo input[name="title"]', '   ');
  await page.click('#new-todo button[type="submit"]');

  await expect(page).toHaveURL(/error=title/);
  await expect(page.locator('#form-error')).toContainText('1–200 characters');
});
```

Note: `required` plus `maxlength` means the browser blocks *empty* and over-long
submissions client-side before they reach the server, which is correct. Whitespace
satisfies `required`, so it reaches the server and exercises the 303-with-`error=title`
path from Task 8 — the only way a no-JS browser can be shown a validation message.

- [ ] **Step 5: Run the browser tests**

```bash
npm run test:e2e
```

Expected: all specs passing. If the no-JS delete step fails because the toast's Undo form is missing, confirm the delete handler's 303 target includes the toast — without JS the toast renders from the reloaded page, so `undo` after a no-JS delete is out of scope for that assertion.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: Playwright smoke test and executable no-JavaScript proof"
```

---

### Task 15: Railway deployment, CI, and the README

Ships it. A portfolio piece is not done until the URL works and the README explains the thinking.

**Files:**
- Create: `railway.json`, `.github/workflows/ci.yml`, `README.md`
- Test: manual verification against the deployed URL

**Interfaces:**
- Consumes: everything.
- Produces: a live URL.

- [ ] **Step 1: Write `railway.json`**

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "node src/server.ts",
    "healthcheckPath": "/healthz",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "numReplicas": 1
  }
}
```

`numReplicas` is pinned to 1 because a volume attaches to a single instance and the store lives in that instance's memory.

- [ ] **Step 2: Write `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

- [ ] **Step 3: Create the Railway service**

In the Railway dashboard:

1. **New Project → Deploy from GitHub repo**, pick this repository.
2. **Settings → Environment**: set `NODE_ENV=production`, `SNAPSHOT_PATH=/data/sessions.json`, and `COOKIE_SECRET` to a fresh 48-character random value. Generate one with:
   ```bash
   node -e "console.log(require('node:crypto').randomBytes(36).toString('base64url'))"
   ```
3. **Settings → Volumes**: add a volume mounted at `/data`. Without this the snapshot is wiped on every deploy — Railway's container filesystem is ephemeral.
4. **Settings → Networking**: generate a public domain.
5. Do **not** set `PORT`; Railway injects it.

- [ ] **Step 4: Verify the deployment**

```bash
curl -s https://<your-domain>/healthz
curl -s -c /tmp/prod-jar.txt https://<your-domain>/ | grep -c 'Try editing this todo'
```

Expected: `{"status":"ok"}` and `1`.

Then in a browser: add a todo, toggle it, redeploy from the Railway dashboard, and reload. The todo must still be there — that is the volume and the snapshot working together. If it vanishes, the volume is not mounted at `/data` or `SNAPSHOT_PATH` does not point into it.

- [ ] **Step 5: Write `README.md`**

```markdown
# htmx todos

A todo app where the server sends HTML and the browser swaps it in. No client-side
framework, no JSON API, no build step — and every action still works with
JavaScript switched off.

**Live:** <your Railway URL>

![demo](docs/demo.gif)

## What this demonstrates

| htmx idiom | Where to look |
|---|---|
| Fragment swaps (`hx-post`, `hx-patch`, `hx-delete`) | `views/partials/macros.njk` |
| Out-of-band swaps for the count and toast | `src/routes/todos.ts`, `views/partials/count.njk` |
| Debounced triggers with a loading indicator | the search input in `views/index.njk` |
| `HX-Push-Url` for shareable, reloadable URLs | `GET /todos` in `src/routes/todos.ts` |
| Designed error responses (422, 410, 404) | `htmx.config.responseHandling` in `views/layout.njk` |
| Progressive enhancement | `src/lib/respond.ts` — 23 lines |

## The one idea

Every mutating handler ends at the same helper:

```ts
function respond(request, reply, fragment) {
  if (!isHtmx(request.headers)) return reply.redirect(backUrl(request), 303);
  return reply.type('text/html; charset=utf-8').send(fragment);
}
```

htmx gets a fragment; a browser without JavaScript gets a 303 and a full page
rendered from the same Nunjucks macros. Nothing is written twice. Fastify routes
declare `method: ['PATCH', 'POST']`, so one handler serves both the verb htmx uses
and the POST an HTML form is limited to.

`e2e/no-js.spec.ts` runs the whole flow with `javaScriptEnabled: false`. That test
is the claim.

## Running it

```bash
npm install          # Node 24+; TypeScript runs directly, there is no build step
npm run dev          # http://localhost:3000
npm test             # node:test — store and route tests
npm run test:e2e     # Playwright, including the no-JS proof
```

## Architecture

```
request → session cookie → route handler → TodoStore → Nunjucks macro → fragment
```

Four layers, each testable alone. `MemoryStore` holds the data; `SnapshotStore`
wraps it and debounces writes to a JSON file. Route handlers know only the
`TodoStore` interface, so the tests run against a bare in-memory store with no
disk and no timers.

## Trade-offs, stated plainly

**There is no database.** Sessions live in memory and are snapshotted to JSON on a
debounced timer. For 30-day ephemeral demo lists this is the right amount of
machinery: no schema, no migrations, no connection string, and a reviewer can read
the entire storage layer in one sitting.

It is the wrong choice for a multi-replica production service, and the app is
deployed as a single replica with a single volume for exactly that reason. The
seam is `TodoStore` in `src/store/types.ts` — SQLite or Postgres would be one new
file implementing that interface, with no change to any route.

**Sessions, not accounts.** A signed cookie identifies a visitor, so the demo needs
no signup and nobody can vandalise anyone else's list. Todos do not sync across
devices, which is the cost.

## Security notes

- Session scoping is the authorization model: every store method takes a session
  id and resolves todos within it, so a guessed id returns 404, not someone's data.
- Nunjucks autoescaping is on and covered by tests that assert `<script>` in a
  title or a search query renders escaped.
- Mutations are rate limited; the cookie is signed, `httpOnly`, and `SameSite=Lax`.
```

- [ ] **Step 6: Record the demo GIF**

Record a short screen capture of add → toggle → search → delete → undo, save it to `docs/demo.gif`, and confirm the README image renders on GitHub.

- [ ] **Step 7: Final verification**

```bash
npm test && npm run typecheck && npm run test:e2e
```

Expected: everything green.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: Railway deploy config, CI pipeline, and README"
```
