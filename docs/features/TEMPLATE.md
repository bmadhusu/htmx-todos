# FD-XXX: Title

**Status:** Open
**Priority:** Low | Medium | High
**Effort:** Low (< 1 hour) | Medium (1-4 hours) | High (> 4 hours)
**Impact:** Brief description of what this enables

## Problem

What we're solving and why it matters.

## Solution

How to implement it. Be specific about approach.

## Demo

What a stakeholder can see, touch, or click when this is done, and where
(local URL or the deployed Railway URL). Every FD ends in something demoable.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/routes/todos.ts` | MODIFY | Add the handler and its fragment response |
| `views/partials/macros.njk` | MODIFY | Markup for the fragment being swapped |
| `src/store/memory.ts` | MODIFY | Store method backing the behaviour |
| `test/todos-<area>.test.ts` | CREATE | Route tests via `app.inject()` |

## Verification

Concrete steps. For this project that normally means:

1. `npm test && npm run typecheck` — unit and route tests pass
2. `npm run test:e2e` — Playwright, including the no-JavaScript proof
3. Exercise it in the browser with JS on, then with JS disabled in DevTools
4. Confirm the out-of-band count stays consistent with the list

## Related

- Spec: `docs/superpowers/specs/2026-09-26-htmx-todo-design.md`
- Plan: `docs/superpowers/plans/2026-09-26-htmx-todo-app.md` (Task N)
- Related FDs:
