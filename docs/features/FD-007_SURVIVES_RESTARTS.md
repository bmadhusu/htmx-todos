# FD-007: Todos survive restarts and redeploys

**Status:** Open
**Priority:** High
**Effort:** Medium (1-4 hours)
**Impact:** Turns "a demo that loses your data" into "a demo you can come back to tomorrow" — the single largest credibility difference for a no-database app.

## Problem

Everything to this point lives in memory. Railway's filesystem is ephemeral and every deploy
restarts the process, so a reviewer who adds a todo, comes back after the next push, and finds an
empty list learns the wrong lesson about the architecture.

The spec chose no database deliberately. That choice is only defensible if restarts are survivable;
otherwise "no database" reads as an oversight rather than a decision.

## Solution

Two plan tasks, plus the Railway volume that FD-001 deliberately left out.

**Task 4 — `SnapshotStore`.** A decorator over any `SerializableStore`: reads delegate straight
through, mutations schedule a debounced write, and the write is atomic (temp file, then rename).
It is deliberately tolerant on the way in — a missing file, truncated JSON, a well-formed file of
the wrong shape, or entries missing required fields all start an empty store and log, rather than
crashing the process. A write failure logs and never propagates into a request.

**Task 12 — wiring it up.** Validated configuration that fails fast when `COOKIE_SECRET` is missing
or too short in production; snapshot load at boot; an hourly unref'd sweeper for 30-day-idle sessions;
a `SIGTERM` handler that closes the server *then* flushes, so the snapshot includes every accepted
mutation; and `@fastify/rate-limit` on mutations only, since this is a public URL with no login.

**Railway:** add a volume mounted at `/data` with `SNAPSHOT_PATH=/data/sessions.json`.

## Demo

**Watch this:** I add a todo on the live site. Now I redeploy the app from the Railway dashboard —
the server genuinely restarts, new container and all. I reload, and my todo is still there. And to
show the failure mode is handled rather than avoided: here is the test suite feeding it a corrupted
data file, and instead of crashing, it starts clean and logs the problem.
**Where:** the live Railway URL plus the Railway dashboard.
**Shows:** durable state without a database, and a persistence layer that fails safe.

## Feedback Sought

- Sessions are swept after 30 days idle. Right retention for a public demo?
- Rate limiting allows 60 mutations per minute per IP. Generous enough for a real user, tight enough
  for a public URL — but it is a guess worth sanity-checking.
- Is a single replica an acceptable trade-off to state in the README, or does the portfolio need a
  horizontally-scalable story (which would mean the SQLite or Postgres path behind `TodoStore`)?

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/store/snapshot.ts` | CREATE | `SnapshotStore` — debounced atomic writes, tolerant `static load` |
| `src/lib/config.ts` | CREATE | `loadConfig` — port, cookie secret, snapshot path, production gate |
| `src/server.ts` | MODIFY | Snapshot load, sweeper, `SIGTERM` flush ordering |
| `src/app.ts` | MODIFY | Register `@fastify/rate-limit` with `global: false`; `rateLimitMax` dep for tests |
| `src/routes/todos.ts` | MODIFY | `config: { rateLimit: {} }` on mutating routes only |
| `test/store/snapshot.test.ts` | CREATE | Flush, load, missing file, truncated JSON, wrong shape, write failure, read delegation |
| `test/config.test.ts` | CREATE | Dev defaults, env overrides, production secret gate, bad `PORT` |
| `test/rate-limit.test.ts` | CREATE | Mutations limited, reads not |
| Railway dashboard | MODIFY | Volume at `/data`; `SNAPSHOT_PATH`, `COOKIE_SECRET`, `NODE_ENV` |

## Verification

1. `npm test && npm run typecheck` — snapshot, config, and rate-limit tests pass
2. Confirm `loadConfig` throws when `NODE_ENV=production` and `COOKIE_SECRET` is absent or under 32 chars
3. Local restart check: start the server, add a todo, `kill -TERM`, confirm it is in `data/sessions.json`,
   restart, confirm it renders
4. Confirm shutdown order is close-then-flush, so nothing accepted is lost
5. Confirm the volume is mounted at `/data` and `SNAPSHOT_PATH` points inside it — without this,
   every redeploy wipes all sessions
6. **Demo walkthrough:** add a todo on the live URL, redeploy from the dashboard, reload, confirm it survived

## Plan Coverage

Source: `docs/superpowers/plans/2026-09-26-htmx-todo-app.md`

| Chunk | Tasks | Notes |
|-------|-------|-------|
| — | Task 12 | Directly |
| — | Task 4 | Folded in (technical) — `SnapshotStore` has no demo of its own; this is the first slice that needs it |

**Beyond the plan:** the Railway volume setup, deliberately deferred from FD-001 because there was
nothing to persist yet.

## Depends On

- FD-002 (`SerializableStore`, `toJSON`/`fromJSON`)
- FD-006 (all mutations exist, so rate-limit coverage is complete)

## Related

- Spec: Persistence decision, Deployment
- Plan: Tasks 4, 12
- Review Focus item 2 (corrupt or unreadable snapshot at boot) is tested here
