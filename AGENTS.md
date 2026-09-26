# htmx todos

A web-based todo app built with htmx, where the server sends HTML fragments and
every action also works with JavaScript disabled. Built as a portfolio and demo
piece: a reviewer should be able to open a live URL, use it in one click without
signing up, read the source, and find it clean.

## Tech Stack

Node 24+ with TypeScript (native type stripping — no build step), Fastify 5,
`@fastify/view` + Nunjucks, htmx 2 (vendored, not CDN), `node:test`, Playwright,
deployed on Railway.

**No database.** State lives in an in-memory `MemoryStore` behind a `TodoStore`
interface, wrapped by a `SnapshotStore` that debounces writes to a JSON file on a
Railway volume. `TodoStore` in `src/store/types.ts` is the seam where SQLite or
Postgres would drop in.

## Best Practices

- **TDD**: write the failing test, watch it fail, implement minimally, watch it pass, commit.
- **Progressive enhancement is not optional**: every mutating route must answer `POST`
  as well as its htmx verb, and every mutation must return the out-of-band count.
  `test/contract.test.ts` enforces both across every endpoint.
- **One macro per fragment**: a todo row is defined once in `views/partials/macros.njk`
  and reused by every render path, so it cannot drift out of sync with itself.
- **Route handlers depend only on `TodoStore`** — never on `MemoryStore` or the snapshot.
- **Session scoping is the authorization model**: every store method takes a session id
  and resolves todos within it.

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
