# FD-004: Add a todo, with and without JavaScript

**Status:** Open
**Priority:** High
**Effort:** Medium (1-4 hours)
**Impact:** The app becomes usable, and the progressive-enhancement mechanism the entire architecture rests on gets built and proven.

## Problem

You cannot add a todo. Beyond the obvious, this slice builds `respond()` — the twenty-three lines
that let every mutation serve both htmx and a plain HTML form without writing anything twice. Every
later FD depends on it, so it needs to exist and be demonstrated early.

This is also where input validation gets its shape: a 422 that htmx can actually display, and a
message a no-JavaScript browser can still see.

## Solution

Implement the plan's Task 8:

- **`src/lib/respond.ts`** — `respond()` returns a fragment when `HX-Request` is present and a 303
  back to `/` (with `filter` and `q` preserved) otherwise. `respondInvalid()` does the same for 422,
  redirecting with `error=title` so a form submission can still surface the message.
- **`POST /todos`** — creates the todo and returns the new row **plus the out-of-band count**, so the
  badge updates without the handler targeting it.
- **Validation** — `parseTitle()` trims first, then requires 1–200 characters. Whitespace-only and
  201 characters are both 422; exactly 200 succeeds.

The create form appends with `hx-swap="beforeend"` and clears itself via `hx-on::after-request`, only
on success.

## Demo

**Watch this:** I type "walk the dog", hit Add, and the row appears at the bottom while the counter
ticks up — the page never reloaded. Now the interesting part: I turn JavaScript off completely,
type another todo, hit Add, and it still works. The page reloads this time, but the feature is
intact. Same server code, same HTML templates, no duplicate implementation.
**Where:** the live Railway URL, with DevTools open to toggle JavaScript.
**Shows:** htmx fragment swaps, out-of-band count updates, and genuine progressive enhancement.

## Feedback Sought

- New todos append to the bottom. Should they go to the top instead? Undo restores to the original
  position either way, so this is purely a preference.
- The 200-character limit is enforced with a message. Is that the right ceiling for a todo title?
- With JavaScript off, a validation error shows after a page reload. Acceptable, or should the form
  also preserve what the user typed?

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/respond.ts` | CREATE | `respond`, `respondInvalid`, `parseTitle`, `parseMutationCtx` |
| `src/routes/todos.ts` | MODIFY | Add the `POST /todos` handler |
| `test/todos-create.test.ts` | CREATE | Row + OOB count, 303 fallback, trimming, 422 cases, emoji round-trip |

## Verification

1. `npm test && npm run typecheck` — create tests pass
2. Confirm the htmx case asserts both the new row and `<span id="count" hx-swap-oob="true">4 left</span>`
3. Confirm the non-htmx case asserts 303 with `Location: /?filter=active&q=dog`
4. Confirm 422 for whitespace-only, missing field, and 201 characters; 200 succeeds
5. `npm run dev`: add a todo (row appears, count updates, input clears, no reload)
6. Disable JavaScript and add another — the page reloads and the todo is there
7. **Demo walkthrough:** both paths above, on the live URL

## Plan Coverage

Source: `docs/superpowers/plans/2026-09-26-htmx-todo-app.md`

| Chunk | Tasks | Notes |
|-------|-------|-------|
| — | Task 8 | Directly, including `src/lib/respond.ts` (technical, but it is this slice's whole point) |

## Depends On

- FD-003 (`src/routes/todos.ts`)

## Related

- Spec: Content negotiation, Out-of-band updates
- Plan: Task 8
- Review Focus item 1 (whitespace-only and over-length titles) is tested here
