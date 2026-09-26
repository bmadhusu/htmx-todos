# htmx todos

A web-based todo app built with htmx, where the server sends HTML fragments and
every action also works with JavaScript disabled. Built as a portfolio and demo
piece: a reviewer should be able to open a live URL, use it in one click without
signing up, read the source, and find it clean.

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Runtime | Node 24+ | Native TypeScript type stripping — no build step, no `dist/` |
| Language | TypeScript 5.7, strict | `erasableSyntaxOnly`: no enums, no parameter properties, no namespaces; relative imports carry `.ts` |
| Framework | Fastify 5 | `method: ['PATCH', 'POST']` arrays are what make progressive enhancement free |
| Views | `@fastify/view` + Nunjucks | Autoescaping on and explicitly configured; one macro per fragment |
| Client | htmx 2, vendored at `public/htmx.min.js` | Not a CDN — the demo works offline and cannot break from a moved URL |
| Data | **No database** | `MemoryStore` (a `Map`) behind the `TodoStore` interface, wrapped by `SnapshotStore` writing debounced JSON |
| Tests | `node:test` | `npm test` (unit + route via `app.inject()`), `npm run typecheck` |
| E2E | Playwright | `npm run test:e2e` — includes the no-JavaScript proof |
| CI | GitHub Actions | typecheck → unit → Playwright on every push |
| Hosting | Railway | Deploys on push to `main`; volume at `/data`, `SNAPSHOT_PATH=/data/sessions.json`; single replica |

## Best Practices

### TDD loop

Write the failing test → run it and watch it fail → minimal implementation → run it and watch it
pass → commit. The plan's tasks are already shaped this way; follow their steps in order.

### Quality gates

Before any commit:

```bash
npm test && npm run typecheck
```

Before closing an FD, also `npm run test:e2e`.

### Commits

Small and frequent. `FD-XXX: Brief description` for FD-level commits; the plan's intra-task
commits use `feat:` / `test:` prefixes.

### DRY, YAGNI

Build what the spec asks for and nothing speculative. Drag-to-reorder was considered and cut;
don't reintroduce it without a decision.

### File structure

The boundaries the plan locked in — respect them:

| Path | Responsibility |
|------|----------------|
| `src/app.ts` | Builds the Fastify instance, registers plugins |
| `src/server.ts` | Entrypoint: config, snapshot load, sweeper, binds `0.0.0.0:$PORT` |
| `src/session.ts` | Signed `sid` cookie, seeds examples on a first visit |
| `src/store/` | `types.ts` (interface), `memory.ts` (implementation), `snapshot.ts` (persistence decorator) |
| `src/routes/` | `pages.ts` (full page), `todos.ts` (every mutation) |
| `src/lib/` | `respond.ts`, `params.ts`, `render.ts`, `error-handler.ts`, `config.ts` |
| `views/partials/macros.njk` | Single source of every fragment's markup |
| `test/helpers.ts` | Shared harness — a plain module, never a `.test.ts` file |

Route handlers depend only on `TodoStore` — never on `MemoryStore` or the snapshot.

### Testing conventions

- Unit and route tests live in `test/*.test.ts`; `node --test` runs each file in its own process.
- Shared helpers go in `test/helpers.ts`. A helper inside a `.test.ts` file makes every importer
  re-run that file's tests.
- Time-dependent behaviour uses an injected clock (`new MemoryStore({ now })`), never real timers.
- Browser specs live in `e2e/`.

### Non-negotiable invariants

Enforced by `test/contract.test.ts` across every endpoint:

1. **Every mutating route answers `POST`** as well as its htmx verb — a plain HTML form can only
   issue GET or POST.
2. **Every mutation returns the out-of-band count**, so the badge cannot drift from the list.
3. **Every mutation without an `HX-Request` header returns 303** back to `/` with `filter` and `q`
   preserved. The exception is validation failure, which returns 422 to htmx and 303 with
   `error=title` to a form.

Other constraints:

- Session scoping is the authorization model: every store method takes a session id and resolves
  todos within it, so a guessed id returns 404 rather than someone else's data.
- Titles are trimmed, then required to be 1–200 characters.
- `htmx.config.responseHandling` in `views/layout.njk` must keep 422/410/404 swappable — htmx
  ignores non-2xx responses by default, which would turn every designed error into a dead click.
- Bind `0.0.0.0` and read `process.env.PORT`. Binding localhost is the classic Railway 502.
- `COOKIE_SECRET` is required in production and the process refuses to boot without it.

### Deployment

Push to `main` → GitHub Actions runs the gates → Railway builds and deploys → healthcheck at
`/healthz`. Rollback: redeploy the previous deployment from the Railway dashboard (rehearsed and
documented in FD-001).

---

## Feature Design (FD) Management

Features are tracked in `docs/features/`. Each FD has a dedicated file (`FD-XXX_TITLE.md`) and is indexed in `FEATURE_INDEX.md`.

### FD Lifecycle

| Stage | Description |
|-------|-------------|
| **Planned** | Identified but not yet designed |
| **Design** | Actively designing (exploring code, writing plan) |
| **Open** | Designed and ready for implementation |
| **In Progress** | Currently being implemented |
| **Pending Verification** | Code complete, awaiting verification |
| **Complete** | Verified working, ready to archive |
| **Deferred** | Postponed (low priority or blocked) |
| **Closed** | Won't implement (superseded or not needed) |

### Skills

The FD workflow is provided by the `fd-flow` plugin's skills. Claude loads them on its own
when a request matches; you can also invoke any of them by name.

| Skill | Purpose |
|-------|---------|
| `/fd-new` | Capture demo feedback as the next FD (renumbering the queue), or append off-plan work |
| `/fd-explore` | Explore project — overview, FD history, recent activity |
| `/fd-deep` | Deep parallel analysis — 4 agents explore a hard problem from different angles, verify claims, synthesize |
| `/fd-status` | Show active FDs with status and grooming |
| `/fd-verify` | Post-implementation: commit, proofread, verify |
| `/fd-close` | Complete/close an FD, archive file, update index, update changelog |
| `/fd-subplan` | Carve a superpowers plan into demoable, vertical-slice FDs |
| `/fd-init` | (Re)initialize the FD system in a project |

### Upstream Documents

FDs are derived from, and must stay consistent with, the superpowers documents:

- **Spec (design)**: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` — the *what* and *why*
- **Plan**: `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` — the *how*, as `## Chunk N` / `### Task N` steps
- **FDs**: `docs/features/FD-XXX_TITLE.md` — the plan re-cut into **presentation-worthy vertical slices**

`/fd-subplan` performs that re-cut. If the plan changes, re-run it and reconcile rather than
hand-editing FDs into a different shape than the plan.

### Conventions

- **FD files**: `docs/features/FD-XXX_TITLE.md` (XXX = zero-padded number)
- **Commit format**: `FD-XXX: Brief description` (intra-task commits during a plan task may use `feat:` / `test:`)
- **Numbering**: Off-plan work appends at the end (highest number + 1). Feedback from a demo is
  inserted **after the last frozen FD** by `/fd-new`, which pushes not-yet-started FDs back by one.
- **Frozen FDs are never renumbered**: an FD is frozen once it is Complete/Closed/Deferred, is
  In Progress or Pending Verification, or is referenced by any commit, branch, or changelog entry.
  Those numbers live in history and must keep pointing at the same work.
- **Source of truth**: FD file status > index (if discrepancy, file wins)
- **Archive**: Completed FDs move to `docs/features/archive/`
- **Every FD is demoable**: each one ends in something a stakeholder can see, touch, or click in
  a deployed environment. Purely technical work is folded into the slice that first needs it.
- **FD-001 is the tracer bullet**: a walking skeleton deployed to production (CI → build → deploy
  → live URL → health/version endpoint → rollback) before feature work begins.
- **Demo → feedback → next FD**: each FD is demoed on completion. Adjustments become a new FD via
  `/fd-new`, implemented next, rather than reopening the closed one.

### Managing the Index

The `FEATURE_INDEX.md` file has four sections:

1. **Active Features** — All non-complete FDs, sorted by FD number
2. **Completed** — Completed FDs, newest first
3. **Deferred / Closed** — Items that won't be done
4. **Backlog** — Low-priority or blocked items parked for later

### Inline Annotations (`%%`)

Lines starting with `%%` in any file are **inline annotations from the user**. When you encounter them:
- Treat each `%%` annotation as a direct instruction — answer questions, develop further, provide feedback, or make changes as requested
- Address **every** `%%` annotation in the file; do not skip any
- After acting on an annotation, remove the `%%` line from the file
- If an annotation is ambiguous, ask for clarification before acting

This enables a precise review workflow: the engineer annotates FD files or plan docs directly in the editor, then asks Claude to address all annotations — tighter than conversational back-and-forth for complex designs.

### Changelog

- **Format**: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) with [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
- **Updated by**: `/fd-close` (complete disposition only) adds entries under `[Unreleased]`
- **FD references**: Entries end with `(FD-XXX)` for traceability
- **Subsections**: Added, Changed, Fixed, Removed
- **Releasing**: Rename `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD`, add fresh `[Unreleased]` header
