# FD-008: Automated proof it works without JavaScript

**Status:** Open
**Priority:** High
**Effort:** Medium (1-4 hours)
**Impact:** Converts the project's central claim from a sentence in a README into a test anyone can run — the strongest single artifact in the portfolio.

## Problem

Every FD so far has ended with "and I disabled JavaScript and it still worked" demonstrated by hand.
Manual proof decays: one future change to a form or a link breaks it silently, and nothing notices.

The same is true of the architecture's two invariants — every mutation returning the out-of-band
count, and every mutation answering a plain `POST`. They hold today because each FD was built that
way, with nothing stopping the next endpoint from forgetting.

## Solution

Two plan tasks, both test-only:

**Task 13 — contract tests.** One table of every mutating endpoint, iterated twice: once asserting
the response contains the out-of-band count element, once asserting a request without the `HX-Request`
header returns 303. A future endpoint that forgets either fails the suite rather than shipping. It
also asserts every mutating URL appears in the route table and accepts `POST`, since an HTML form can
only issue GET or POST.

**Task 14 — Playwright.** Two specs against a real browser:

1. The full flow with JavaScript on — add, toggle, inline edit, search, delete, undo — plus an
   assertion that **no navigation ever occurred**, which is the difference between htmx swapping
   fragments and the browser reloading pages. A second test confirms two browser contexts get
   independent lists.
2. **The same flow with `javaScriptEnabled: false`.** Add, toggle, edit, filter, search, delete, and
   a validation error — every one via plain form posts and real links.

## Demo

**Watch this:** this is the entire app being driven by a real browser with JavaScript switched off at
the browser level — not stubbed, not mocked, genuinely disabled. Every feature completes. Then the
same suite with JavaScript on, where it also asserts the page never navigated once. Those two runs
are the whole architectural claim, and they run on every push.
**Where:** `npm run test:e2e` locally and in the GitHub Actions log.
**Shows:** progressive enhancement is real, verified, and protected against regression.

## Feedback Sought

- Chromium only, or should CI run Firefox and WebKit too? It is a config line against a slower CI.
- Should the no-JS spec be called out at the very top of the README, or kept as supporting evidence
  under the architecture section?
- Undo after a no-JS delete is out of scope for the spec's assertions (the toast renders from the
  reloaded page). Worth covering, or is that a fair boundary?

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `test/contract.test.ts` | CREATE | OOB count and 303 fallback across every mutation; route-table check |
| `playwright.config.ts` | CREATE | `webServer` on port 3100, isolated `SNAPSHOT_PATH` |
| `e2e/todo.spec.ts` | CREATE | Full htmx flow, no-navigation assertion, per-visitor isolation |
| `e2e/no-js.spec.ts` | CREATE | The same flow with `javaScriptEnabled: false`, plus a validation error |
| `package.json` | MODIFY | `@playwright/test` devDependency |
| `.github/workflows/ci.yml` | MODIFY | Install Chromium, run e2e, upload the report on failure |

## Verification

1. `npm test` — contract tests pass for all five mutations, in both directions
2. `npm run test:e2e` — both browser specs pass
3. Confirm the htmx spec asserts zero `framenavigated` events — without that assertion it would pass
   even if htmx were removed entirely
4. Confirm the no-JS spec sets `test.use({ javaScriptEnabled: false })` at file scope
5. Deliberately break an invariant (drop the OOB count from one handler), confirm the contract test
   fails, then restore it — proof the test has teeth
6. **Demo walkthrough:** run both suites, then show the CI log doing the same on push

## Plan Coverage

Source: `docs/superpowers/plans/2026-09-26-htmx-todo-app.md`

| Chunk | Tasks | Notes |
|-------|-------|-------|
| — | Task 14 | Directly |
| — | Task 13 | Folded in (technical) — contract tests protect the same invariants the browser tests demonstrate |

## Depends On

- FD-007 (every feature and all configuration in place)

## Related

- Spec: Testing (items 3, 4, 5)
- Plan: Tasks 13, 14
