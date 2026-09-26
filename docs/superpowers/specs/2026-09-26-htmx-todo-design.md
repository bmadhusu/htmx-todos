# htmx Todo App — Design

**Date:** 2026-09-26
**Status:** Approved design, ready for implementation planning

## Purpose

A web-based todo app built with htmx, intended as a **portfolio and demo piece**.
Success means a reviewer can open a live URL, use the app in one click without
signing up, read the source and find it clean, and come away convinced the
author understands hypermedia-driven applications.

The todo domain is deliberately mundane. It is the vehicle for demonstrating
htmx idioms — partial swaps, out-of-band updates, debounced triggers, designed
error responses, and genuine progressive enhancement.

### Success criteria

1. Live public URL on Railway, working on first click with no signup.
2. Every feature works with JavaScript disabled, proven by an automated test.
3. Test suite runs in seconds and covers store logic, routes, and one browser flow.
4. README states the architecture and its trade-offs explicitly.

### Explicit non-goals

- User accounts, email, or passwords.
- Multi-device sync; a list belongs to a browser session.
- Horizontal scaling. One process, one volume, by design.
- Drag-to-reorder. Considered and cut: the only feature requiring a JS library,
  and the least htmx demonstrated per unit of effort.

## Decisions and their rationale

| Decision | Choice | Rationale |
|---|---|---|
| Server | Fastify (Node 22+, TypeScript) | First-class TS types, schema validation, plugin encapsulation. `method` arrays make progressive enhancement nearly free. |
| Templating | `@fastify/view` + Nunjucks | Jinja-style macros are the natural unit for an htmx fragment; one macro definition serves every render path. |
| Persistence | **No database.** In-memory store + debounced JSON snapshot. | Chosen by the product owner over SQLite. Per-session lists expiring in 30 days are genuinely ephemeral data. Trade-off is stated in the README rather than hidden. |
| Identity | Signed `sid` cookie, no login | Zero-friction demo; each visitor gets a private list nobody else can vandalise. |
| Test runner | `node:test` | Zero dependencies, consistent with the minimal-dependency ethos. |
| Hosting | Railway (existing account) | Deploy on push from GitHub, injected `PORT`, public domain, volume for the snapshot. |

## Features

Core: add, toggle complete, inline edit, delete, filter (all / active / done),
live remaining count.

Extras, each showcasing a distinct htmx idiom:

- **Live search as you type** — `hx-trigger="keyup changed delay:300ms"` plus `hx-indicator`.
- **Undo after delete** — out-of-band toast swap with server-held transient state.
- **Progressive enhancement** — every action also works as a plain form POST.

## Architecture

One Fastify process, four layers, each independently testable.

```
src/
  server.ts           entrypoint: reads env, binds 0.0.0.0:$PORT
  app.ts              builds the Fastify instance, registers plugins
  session.ts          plugin: signed `sid` cookie, created on first request
  store/
    types.ts          TodoStore interface + Todo / Session types
    memory.ts         MemoryStore — the real implementation
    snapshot.ts       decorator: debounced JSON persistence
  routes/
    pages.ts          GET /
    todos.ts          all mutations, each returning a fragment
  lib/
    respond.ts        the HX-Request / 303 content-negotiation helper
  views/
    layout.njk        shell: htmx script, htmx.config, styles
    index.njk         full page
    partials/
      row.njk         {% macro row(todo) %}  <- single source of a todo's markup
      edit.njk        row in edit mode
      list.njk        calls row() in a loop
      count.njk       remaining count, swapped out-of-band
      toast.njk       undo toast, swapped out-of-band
```

### Data model

```ts
type Todo = { id: string; title: string; done: boolean; createdAt: string };

type Session = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  todos: Todo[];
  trash?: { todo: Todo; index: number; expiresAt: string };
};
```

`trash` holds at most one entry — the most recent deletion, with a 30-second TTL.
Deleting again discards any previous undo.

### The store interface

Route handlers depend on this and nothing else.

```ts
interface TodoStore {
  list(sid: string, filter: Filter, query?: string): Todo[];
  create(sid: string, title: string): Todo;
  get(sid: string, id: string): Todo | undefined;
  rename(sid: string, id: string, title: string): Todo;
  setDone(sid: string, id: string, done: boolean): Todo;
  remove(sid: string, id: string): Todo;
  restore(sid: string, id: string): Todo;   // throws ExpiredUndo past TTL
  remaining(sid: string): number;
  sweep(now: Date): void;                    // drops sessions idle > 30 days
}
```

`MemoryStore` is a `Map<string, Session>`. `SnapshotStore` wraps any store and
writes `$SNAPSHOT_PATH` on a debounced timer and on `SIGTERM`. Tests use a bare
`MemoryStore`: no disk, no timers, deterministic. Adding SQLite later means one
new file implementing this interface, with nothing else changed.

**Session scoping is the authorization model.** Every method takes `sid` and
resolves the todo *within that session*, so guessing another visitor's todo id
yields a 404 rather than their data. The interface shape enforces this rather
than relying on each handler remembering a check.

### The row macro

htmx's swap model renders the same markup in three situations: the initial full
list, a single row after toggle or rename, and a restored row after undo. All
three call `row.njk`, so a row cannot drift out of sync with itself.

## Routes

Fastify's `method` option accepts an array, so one route definition serves both
the verb htmx uses and the `POST` a plain HTML form is limited to. No `_method`
override middleware, no duplicated handlers.

| Route | Verbs | Purpose |
|---|---|---|
| `GET /` | GET | Full page; reads `?filter=` and `?q=` |
| `GET /todos` | GET | List fragment — powers search and filters |
| `POST /todos` | POST | Create |
| `GET /todos/:id/edit` | GET | Swap a row into its edit form |
| `/todos/:id/title` | PATCH, POST | Rename |
| `/todos/:id/done` | PATCH, POST | Toggle |
| `/todos/:id` | DELETE, POST | Delete |
| `POST /todos/:id/restore` | POST | Undo |
| `GET /healthz` | GET | Railway healthcheck |

Toggle and rename are separate endpoints rather than one `PATCH /todos/:id`
because an unchecked checkbox submits nothing: a combined endpoint could not
distinguish "user cleared done" from "user renamed and `done` was absent from
this form." Splitting them makes every request body unambiguous.

### Content negotiation

Every mutating handler ends at one helper:

```ts
function respond(req, reply, fragment: string) {
  if (req.headers['hx-request']) return reply.type('text/html').send(fragment);
  return reply.redirect(303, backUrl(req));   // no-JS: full page reload
}
```

This function *is* the progressive enhancement story. htmx receives a fragment;
a JS-disabled browser receives a 303 back to `/` with `filter` and `q`
preserved, and the same macros render the fresh page. Nothing is written twice.

### Out-of-band updates

Every mutation returns its primary fragment plus `count.njk` carrying
`hx-swap-oob="true"`, so the remaining-count badge updates without any handler
targeting it, and cannot disagree with the list.

### Search and filters

The search input uses `hx-get="/todos"`, `hx-trigger="keyup changed delay:300ms, search"`,
`hx-target="#todo-list"`, and an `hx-indicator` spinner. Filter links hit the
same endpoint. Both set `hx-push-url` to the **`/` URL** (`/?filter=active&q=milk`),
never `/todos?...`, so a reload or shared link renders a full page rather than a
bare fragment.

### Undo

`DELETE /todos/:id` moves the todo into `session.trash` with a 30-second TTL and
returns three things: an empty string (the row's `outerHTML` swap removes it), an
OOB toast, and the OOB count. The toast's Undo button posts to
`/todos/:id/restore`, which re-inserts the todo at its original index and returns
the full list plus an OOB empty toast. Past the TTL, restore returns **410** and
htmx swaps in an expiry message.

## Error handling

htmx does not swap non-2xx responses by default, so a helpful 422 fragment would
show the user nothing. `layout.njk` configures this explicitly:

```js
htmx.config.responseHandling = [
  { code: "204", swap: false },
  { code: "[23]..", swap: true },
  { code: "422", swap: true },   // validation: re-render input with error
  { code: "410", swap: true },   // undo expired
  { code: "[45]..", swap: false, error: true },
];
```

Errors are designed responses, not dead clicks.

- **Validation** via Fastify JSON schema: title trimmed, 1–200 characters.
  Failure returns 422 with the input re-rendered and an inline message.
- **Missing or expired cookie** mints a fresh session seeded with example todos.
  A first-time visitor has no error path.
- **Autoescaping on, explicitly configured** rather than assumed. Todo titles are
  user input rendered back into HTML; a test asserts
  `<img src=x onerror=alert(1)>` renders escaped.
- **Snapshot failures log and continue.** A disk problem must never fail a
  request. The in-memory store is authoritative; the file is a convenience.
- **`@fastify/rate-limit` on mutations** — a public URL with no login.
- **Global error handler** branches on `HX-Request`: a toast fragment for htmx, a
  full error page otherwise.
- **Boot-time fail-fast** if `COOKIE_SECRET` is unset when `NODE_ENV=production`.

## Testing

`node:test` with `node --test`.

1. **Store unit tests** with an injected clock: filtering, search, toggle, trash
   TTL expiry, 30-day sweep. No real timers, no disk.
2. **Route tests via `app.inject()`** — no ports, no network. Assert status codes,
   `Location` headers, and fragment contents.
3. **Two contract tests protecting the architecture:** every mutation response
   contains the OOB count element, and every mutation without an `HX-Request`
   header returns 303. A future endpoint that forgets either fails the suite.
4. **Playwright smoke test:** add, toggle, search, delete, undo.
5. **The portfolio test:** that same flow in a Playwright context with
   `javaScriptEnabled: false` — executable proof of the README's central claim.

## Deployment

Railway service connected to the GitHub repo, deploying on push to `main`.

- **Volume** mounted at `/data`; `SNAPSHOT_PATH=/data/sessions.json`. Railway's
  filesystem is otherwise ephemeral, so without the volume every redeploy wipes
  all sessions.
- **Bind `0.0.0.0` and read `process.env.PORT`.** Binding localhost is the
  classic Railway "deploy succeeded, 502 on every request" failure.
- **One volume per service means one replica.** Accepted: this app is explicitly
  single-process.
- **Env vars:** `COOKIE_SECRET` (required in production), `SNAPSHOT_PATH`,
  `NODE_ENV`.
- **Healthcheck:** `/healthz`.
- **GitHub Actions** runs typecheck, unit, integration, and Playwright on every
  push; Railway deploys `main`.

## README requirements

The README is part of the deliverable, not an afterthought:

1. Live URL and a GIF of the app in use.
2. The hypermedia argument: what htmx does here and why no client framework.
3. The no-JS claim, with a pointer to the test that proves it.
4. An honest trade-offs section: no database means sessions live in memory with a
   JSON snapshot, which is right for 30-day ephemeral demo data and wrong for a
   multi-replica production service — and the `TodoStore` interface is the seam
   where SQLite or Postgres would drop in.
