# FD-010: CI gates the deploy

**Status:** In Progress
**Priority:** High
**Effort:** Medium (1-4 hours)
**Impact:** A commit with failing tests can no longer reach the live URL, and a deploy is not called successful until the running commit has been confirmed.

## Feedback Origin

**Parent:** FD-001 — Walking skeleton live on Railway (demoed 2026-09-26)
**Type:** Extension — the demo revealed a gap the slice did not claim to cover
**Feedback as given:**

> CI doesn't gate the deploy. Railway deploys on push in parallel with GitHub Actions, so a commit
> with failing tests would still go live.

Raised as question 3 under FD-001's `## Feedback Sought` and selected for capture as its own FD.

## Problem

Railway's GitHub integration deploys on every push to `main`. GitHub Actions runs on the same push,
in parallel. Neither waits for the other, so the two are independent reactions to a push rather than
stages of a pipeline. A commit that fails `npm test` still reaches the live URL; CI turns red
afterwards and changes nothing.

Two consequences:

1. **The live URL is the portfolio deliverable.** A reviewer opening it during the window between a
   bad push and a human noticing sees a broken app, and "the tests caught it" is not visible to them.
2. **`AGENTS.md` currently describes a pipeline that does not exist** — "Push to `main` → GitHub
   Actions runs the gates → Railway builds and deploys" reads as sequential. Anyone trusting that
   description would assume a safety property the project does not have, which is worse than having
   no description.

FD-001 proved the delivery path works and is reversible. It did not make it *safe*, and did not
claim to. This FD closes that gap while the cost is still one workflow file.

## Solution

Two changes, plus a documentation correction.

### 1. Make the deploy wait for CI

**Chosen: CI drives the deploy.** Railway's GitHub auto-deploy is turned off, and the workflow runs
`test` → `deploy` → `verify-deploy`, each depending on the last.

**Why not Railway's "Wait for CI" setting,** which looked preferable at design time: it holds the
deploy until the commit's GitHub check suite concludes, while `verify-deploy` waits for the deploy
to appear. Put them together and the check suite contains a job waiting on a deploy that is waiting
on the check suite. It deadlocks, times out, and nothing ships. That is structural rather than a
misconfiguration, so the two features are mutually exclusive unless verification is moved into a
separate workflow — which trades the deadlock for a race against Railway's own trigger.

The CI-driven path keeps both halves with no circularity. Deployments still appear in Railway's
dashboard, so FD-001's rehearsed rollback is unaffected.

### 2. Verify the deploy, do not assume it

Add a `verify-deploy` job that polls `/healthz` until it reports the pushed commit, failing after a
bounded number of attempts. FD-001 measured deploy latency at 16–56 seconds, so poll every 10 seconds
for up to 5 minutes.

This turns "Railway accepted the push" into "the live service is answering with this exact commit" —
the property `/healthz` was built to expose in FD-001, checked automatically instead of by hand.

### 3. Correct the documentation

Update `AGENTS.md` → `### Deployment` so it describes the pipeline that actually exists, including
what gates what.

## Demo

**Watch this:** I push a commit with a deliberately broken test. CI goes red, and the live site never
changes — `/healthz` still reports the previous commit. Nothing reached production. Then I fix the
test and push again: CI goes green, the deploy follows, and CI itself confirms the live site is
answering with the new commit before it reports success.
**Where:** the GitHub Actions tab and https://htmx-todos-production.up.railway.app/healthz
**Shows:** the pipeline is now sequential and self-verifying, not two independent reactions to a push.

## Feedback Sought

- Should a red CI block the deploy outright, or should `main` also get branch protection so a failing
  commit cannot land there in the first place? These solve overlapping problems at different points.
- If `verify-deploy` fails — the deploy landed but the service never reports the right commit —
  should it roll back automatically, or just fail loudly and leave the decision to a human?
- Is a five-minute polling ceiling right? It is generous against the measured 16–56 seconds, but a
  cold Railway build could exceed it and fail a deploy that was merely slow.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `.github/workflows/ci.yml` | MODIFY | `deploy` job (`needs: test`, `main` pushes only) and `verify-deploy` job (`needs: deploy`); queue concurrency so deploys cannot overlap |
| `scripts/wait-for-deploy.sh` | CREATE | Polls `/healthz` until it reports the expected commit; exits non-zero on timeout |
| `AGENTS.md` | MODIFY | Rewrite `### Deployment` to describe the real pipeline and its gate |
| Railway dashboard | MODIFY | Enable **Wait for CI**, or disable auto-deploy if using the fallback |
| `AGENTS.md` | MODIFY | `### Deployment` rewritten to describe the real pipeline, its gate, and the required secret |

## Implementation Steps

- [ ] **Step 1: Determine which path applies** — open the Railway service settings and check whether
      **Wait for CI** exists. Record which path was taken in this file before writing any workflow.
- [ ] **Step 2: Enable the gate** — turn on Wait for CI, or disable auto-deploy and add a
      `RAILWAY_TOKEN` repository secret for the fallback.
- [ ] **Step 3: Write the failing check** — add the `verify-deploy` job to `.github/workflows/ci.yml`,
      polling `https://htmx-todos-production.up.railway.app/healthz` until `version` equals
      `${{ github.sha }}`, every 10s, for at most 30 attempts, exiting non-zero on timeout.
- [ ] **Step 4: Prove the gate works** — on a scratch branch, push a commit with a deliberately
      failing test. Confirm CI goes red and `/healthz` still reports the previous commit. Delete the
      branch afterwards; do not merge it.
- [ ] **Step 5: Prove the happy path** — push a passing commit to `main`. Confirm CI goes green,
      `verify-deploy` passes, and `/healthz` reports the new commit.
- [ ] **Step 6: Correct `AGENTS.md`** — rewrite `### Deployment` to match what was actually built.
- [ ] **Step 7: Run the gates and commit** — `npm test && npm run typecheck`, then commit as
      `FD-010: Gate the Railway deploy behind CI`.

## Verification

1. `npm test && npm run typecheck` — both pass; this FD changes no application code, so any failure
   here is unrelated and should be investigated before continuing
2. `gh run list --limit 1 --json conclusion,displayTitle` — the latest run reports `success`
3. Bad-commit check: on a scratch branch, a commit with a failing test produces a red run, and
   `curl -s https://htmx-todos-production.up.railway.app/healthz` still reports the **previous**
   commit SHA
4. Good-commit check: after a passing push to `main`, that same curl reports the **new** commit SHA,
   and the `verify-deploy` job passed on its own rather than being confirmed by hand
5. Timeout check: confirm `verify-deploy` fails cleanly with a readable message rather than hanging
   when the expected SHA never appears
6. `grep -A 4 '^### Deployment' AGENTS.md` — the description matches the pipeline as built
7. **Demo walkthrough:** the click path in `## Demo`, shown from the Actions tab

## Depends On

Nothing. It touches CI configuration and documentation only, so it can be implemented before, after,
or alongside any feature FD.

## Related

- Parent: `docs/features/archive/FD-001_WALKING_SKELETON_TO_RAILWAY.md` — its `## Delivery Path`
  section records the rollback procedure and the measured deploy latency this FD's polling budget
  is based on
- Spec: `docs/superpowers/specs/2026-09-26-htmx-todo-design.md` (Deployment)
- `/healthz` and its version field, added in FD-001, are what make step 4 checkable at all
