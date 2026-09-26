# FD-001: Walking skeleton live on Railway

**Status:** In Progress
**Priority:** High
**Effort:** Medium (1-4 hours)
**Impact:** Proves the whole delivery path — repo → CI → build → deploy → live URL → rollback — while the app is still nearly empty and hiccups cost nothing to fix.

## Problem

Every later FD assumes "push to main and it's live." That assumption is worth almost nothing until
it has been exercised end to end. Discovering a Railway port-binding mistake, a missing secret, or
a broken healthcheck in week three — with five features stacked on top — costs far more than
discovering it now against fifteen lines of code.

A portfolio piece also has a hard requirement the plan treats as a final step: the live URL *is*
the deliverable. It should exist from day one.

## Solution

Implement the plan's Task 1 (Fastify skeleton, `/healthz`, `node:test` harness via `app.inject()`),
then pull the plan's Railway and CI setup from Task 15 forward and deploy it.

Three additions the plan does not specify, needed for a tracer bullet:

1. **A version in `/healthz`** — `{ status: 'ok', version: process.env.RAILWAY_GIT_COMMIT_SHA ?? 'dev' }`,
   so the endpoint proves *which commit* is live rather than merely that something is.
2. **A placeholder `GET /`** returning a minimal HTML shell. Deliberately throwaway — FD-002 replaces
   it with the real Nunjucks page.
3. **A rehearsed rollback** — deploy a one-line change, confirm it is live, roll back, confirm the
   previous version is live again. Write the exact steps into this file when done.

The Railway **volume is not set up here**; persistence arrives with FD-007, which is the first slice
that has anything to persist.

## Demo

**Watch this:** I open the live URL and you see the app's shell. I hit `/healthz` and it tells you
the exact commit running. I change one line of visible text, push it, and we watch it go live. Then
I roll it back and watch the old text return.
**Where:** the Railway-generated public domain.
**Shows:** the delivery path works, is observable, and is reversible — every later demo is on real
infrastructure, not a laptop.

## Feedback Sought

- Is a Railway-generated subdomain good enough for the portfolio, or do you want a custom domain
  before this goes in front of anyone?
- Should `/healthz` be public? It exposes a commit SHA, which is harmless for an open-source
  portfolio piece but is a choice worth making deliberately.
- Do you want CI to block the deploy (deploy only after tests pass), or deploy in parallel and
  rely on the healthcheck? Railway's GitHub integration defaults to deploying on push.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | CREATE | Scripts, deps, `engines.node >= 24` |
| `tsconfig.json` | CREATE | Strict, `erasableSyntaxOnly`, `allowImportingTsExtensions`, `noEmit` |
| `.gitignore`, `.nvmrc` | CREATE | Ignore `node_modules/`, `data/`, test output; pin Node 24 |
| `src/app.ts` | CREATE | `buildApp(deps)`, `/healthz` with version, placeholder `GET /` |
| `src/server.ts` | CREATE | Binds `0.0.0.0` on `process.env.PORT` |
| `test/health.test.ts` | CREATE | `/healthz` returns 200 and reports a version |
| `railway.json` | CREATE | Nixpacks, `startCommand`, `healthcheckPath`, `numReplicas: 1` |
| `.github/workflows/ci.yml` | CREATE | typecheck + unit tests on push and PR |

## Verification

1. `node --version` reports v24 or higher — if not, stop rather than adding a bundler
2. `npm test && npm run typecheck` — health test passes, no type errors
3. `PORT=3001 node src/server.ts` then `curl -s localhost:3001/healthz` → `{"status":"ok","version":"dev"}`
4. Push to `main`; GitHub Actions goes green
5. `curl -s https://<domain>/healthz` → status ok and the live commit SHA
6. **Demo walkthrough:** change one line of visible text, push, confirm live, roll back from the
   Railway dashboard, confirm the previous text returns. Record the rollback steps in this file.

## Plan Coverage

Source: `docs/superpowers/plans/2026-09-26-htmx-todo-app.md` (15 flat tasks, no `## Chunk` groupings)

| Chunk | Tasks | Notes |
|-------|-------|-------|
| — | Task 1 | Directly — walking skeleton, healthcheck, test harness |
| — | Task 15 (partial) | `railway.json`, CI workflow, and the Railway service setup pulled forward. README and demo GIF stay in FD-009 |

**Beyond the plan:** the version field in `/healthz`, the placeholder `GET /`, and the rollback
rehearsal. The plan has no version endpoint and no rollback step; a tracer bullet needs both.

## Depends On

Nothing. This is the tracer bullet.

## Related

- Spec: `docs/superpowers/specs/2026-09-26-htmx-todo-design.md` (Deployment)
- Plan: Tasks 1 and 15
- FD-002 replaces the placeholder `GET /`; FD-007 adds the `/data` volume
