# FD-002: Every visitor gets their own seeded list

**Status:** Open
**Priority:** High
**Effort:** High (> 4 hours)
**Impact:** The app becomes a real page with real per-visitor data — the first thing a stakeholder can look at and react to.

## Problem

FD-001 proves delivery but shows nothing. This slice makes the product visible: a visitor opens the
URL and immediately sees a todo list that is theirs alone, with no signup, no login, and no way to
see or damage anyone else's list.

It also retires the riskiest assumption in the spec — that zero-friction private lists are
achievable with nothing but a signed cookie.

## Solution

Four plan tasks, which together form the first complete vertical slice (cookie → session → store →
macro → rendered page):

- **Task 2** — `TodoStore` interface, `Todo`/`Session` types, `MemoryStore` with an injected clock.
- **Task 3** — tests pinning the time-dependent behaviour: undo trash, its 30-second TTL, and the
  30-day session sweep. Written now because `MemoryStore` implements them now; the UI arrives in FD-006.
- **Task 5** — session plugin: signed `sid` cookie (httpOnly, SameSite=Lax, 30-day), seeding three
  example todos on a first visit, and treating a tampered cookie exactly like a first visit.
- **Task 6** — Nunjucks with autoescaping, the macro library, vendored htmx, `public/app.css`,
  `GET /` rendering the full page, and the error handler that every later FD relies on for its 404
  and 410 paths.

The todos are **read-only in this slice** — nothing is clickable yet. That is deliberate: it puts
the visual design and the seeded copy in front of a stakeholder before any interaction is built on
top of them.

## Demo

**Watch this:** I open the live URL and a todo list appears with three starter items and a "3 left"
counter. I open the same URL in a private window and you see a completely separate list — no login,
no signup, nothing shared. Then I put `<script>alert(1)</script>` in a todo title and it shows up as
plain text instead of running.
**Where:** the live Railway URL.
**Shows:** per-visitor privacy with zero friction, and that user input cannot inject markup.

## Feedback Sought

- Are the three seeded todos the right first impression? They currently teach the features
  ("Try editing this todo", "Tick one off", "Delete one, then hit Undo").
- Does the visual design read as portfolio-quality, or should it be more distinctive before the
  interactions are built on top of it?
- Sessions last 30 days and are per-browser. Is that the right story to tell a reviewer, or should
  the page say so explicitly somewhere visible?

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/store/types.ts` | CREATE | `Filter`, `Todo`, `Session`, `TodoStore`, `SerializableStore`, `parseFilter` |
| `src/store/errors.ts` | CREATE | `NotFound`, `ExpiredUndo` |
| `src/store/memory.ts` | CREATE | `MemoryStore` — a `Map` with an injected clock |
| `src/session.ts` | CREATE | Signed `sid` cookie, seeding, tampered-cookie handling |
| `src/app.ts` | MODIFY | Register cookie, formbody, view, static, session; drop the placeholder `GET /` |
| `src/lib/params.ts` | CREATE | `parseListParams`, `backUrl` (never reads `Referer`) |
| `src/lib/render.ts` | CREATE | `fragments(app)` — one call site per fragment |
| `src/lib/error-handler.ts` | CREATE | `NotFound` → 404, `ExpiredUndo` → 410, branching on `HX-Request` |
| `src/routes/pages.ts` | CREATE | `GET /` with `?filter=`, `?q=`, `?edit=` |
| `views/layout.njk` | CREATE | Shell, htmx script, `htmx.config.responseHandling` |
| `views/index.njk` | CREATE | Full page |
| `views/partials/macros.njk` | CREATE | `row`, `editRow`, `countBadge`, `toastBox` |
| `views/partials/*.njk` | CREATE | `row`, `edit`, `list`, `count`, `toast`, `error` render wrappers |
| `public/htmx.min.js` | CREATE | Vendored htmx 2.0.4 |
| `public/app.css` | CREATE | Small, readable stylesheet |
| `test/helpers.ts` | CREATE | Shared harness — a plain module, not a `.test.ts` file |
| `test/store/memory.test.ts` | CREATE | Store reads, writes, filtering, search, isolation |
| `test/store/trash.test.ts` | CREATE | Undo TTL, trash replacement, session sweep |
| `test/session.test.ts` | CREATE | Cookie flags, seeding, tampered cookie, unknown session |
| `test/pages.test.ts` | CREATE | Full page render, escaping, empty state, `?edit=`, 404 page |

## Verification

1. `npm test && npm run typecheck` — store, session, and page tests pass
2. `npm run dev` → `http://localhost:3000` shows three todos and "3 left"
3. Open a private window: a separate list with its own three seeded todos
4. Confirm the escaping test asserts `<img src=x onerror=alert(1)>` renders as entities
5. Confirm `/static/htmx.min.js` and `/static/app.css` both return 200
6. **Demo walkthrough:** deploy, open the live URL, open it again in a private window, and show the
   two lists are independent

## Plan Coverage

Source: `docs/superpowers/plans/2026-09-26-htmx-todo-app.md`

| Chunk | Tasks | Notes |
|-------|-------|-------|
| — | Tasks 2, 3, 5, 6 | Directly. Task 3 is test-only (technical) and rides along with Task 2, which implements what it pins |

## Depends On

- FD-001 (deployment path, `buildApp` shape)

## Related

- Spec: Architecture, Data model, The store interface, The row macro
- Plan: Tasks 2, 3, 5, 6
