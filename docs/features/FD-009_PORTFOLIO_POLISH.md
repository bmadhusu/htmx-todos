# FD-009: The README and demo that make it a portfolio piece

**Status:** Open
**Priority:** High
**Effort:** Medium (1-4 hours)
**Impact:** The deliverable the whole project exists for — a reviewer's first ninety seconds are spent on the README and the GIF, not the source.

## Problem

The app works, is deployed, and is tested. But the spec's actual success criterion is that **a
reviewer comes away convinced the author understands hypermedia applications** — and almost nobody
reaches that conclusion by reading `src/routes/todos.ts` first. They read the README, watch the GIF,
click the live link, and only then open the code, if at all.

Left undone, this FD means an excellent project that reads as an unexplained one.

## Solution

Complete the remainder of the plan's Task 15 — everything except the Railway and CI setup already
delivered in FD-001.

**README**, structured for how it is actually read:

1. Live URL and a GIF of the app in use, above everything else.
2. A table mapping each htmx idiom to the file where it lives, so a reviewer can jump straight to
   the code that interests them.
3. "The one idea" — the `respond()` helper quoted in full, because twenty-three lines make the
   argument better than paragraphs do, with a pointer to `e2e/no-js.spec.ts` as the proof.
4. How to run it, including that there is no build step.
5. Architecture as a one-line request flow plus the four layers.
6. **Trade-offs stated plainly** — no database, why that is right for 30-day ephemeral demo data and
   wrong for a multi-replica service, and that `TodoStore` is the seam where SQLite or Postgres drops in.
7. Security notes — session scoping as the authorization model, autoescaping with tests, rate limits,
   signed httpOnly cookie.

**Demo GIF:** add → toggle → search → delete → undo, saved to `docs/demo.gif`, verified rendering on GitHub.

Owning the constraint is the point of section 6: a stated trade-off reads as judgment, while an
unstated one reads as an oversight a reviewer discovered for you.

## Demo

**Watch this:** this is what a reviewer sees in their first ten seconds — a GIF of the app working
and a live link. Thirty seconds in, they know the one idea the project is built on and can click
straight to the file implementing it. A minute in, they have read the trade-offs in my own words,
including the case *against* my own choice, and where the seam is if it needed changing.
**Where:** the GitHub repository page and the live Railway URL.
**Shows:** the project presented the way it will actually be consumed.

## Feedback Sought

- Does the trade-offs section strike the right tone — confident about the decision without
  overselling a demo app?
- Should the README lead with the no-JavaScript claim, or with the app itself and let the claim follow?
- Is there anything a reviewer of *your* target roles would look for that this omits? That question
  is better answered by you than by me.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `README.md` | CREATE | The full structure above |
| `docs/demo.gif` | CREATE | add → toggle → search → delete → undo |

## Verification

1. `npm test && npm run typecheck && npm run test:e2e` — everything green before shipping the story
2. Every file path and claim in the README checked against the actual code — a README that
   misdescribes its own repository is worse than none
3. Every code snippet in the README copied from the real source, not paraphrased
4. GIF renders on the GitHub repository page (not just locally)
5. Live URL in the README resolves and the app works from a cold visit
6. **Demo walkthrough:** open the repo as a stranger would — GIF, live link, one idea, trade-offs —
   and time it. Ninety seconds should be enough to understand the project.

## Plan Coverage

Source: `docs/superpowers/plans/2026-09-26-htmx-todo-app.md`

| Chunk | Tasks | Notes |
|-------|-------|-------|
| — | Task 15 (remainder) | README and demo GIF. `railway.json`, CI, and the Railway service were pulled forward into FD-001 |

## Depends On

- FD-008 (the no-JS proof the README points at)

## Related

- Spec: README requirements, Success criteria
- Plan: Task 15
