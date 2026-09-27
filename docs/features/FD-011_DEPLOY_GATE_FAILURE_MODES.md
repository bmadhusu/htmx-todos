# FD-011: Decide the deploy gate's remaining failure modes

**Status:** Open
**Priority:** Medium
**Effort:** Medium (1-4 hours)
**Impact:** Settles three open questions about how the deploy pipeline behaves at its edges, and records the reasoning so the answers are not re-litigated later.

## Feedback Origin

**Parent:** FD-010 — CI gates the deploy (completed 2026-09-26)
**Type:** Refinement — the pipeline works; these are decisions its `## Feedback Sought` section
deliberately left open.

**Questions as raised:**

> 1. Should `main` also get branch protection? The gate stops a bad commit from *deploying*;
>    protection would stop it from *landing*.
> 2. If `verify-deploy` fails — deployed, but never reports the right commit — should it roll back
>    automatically, or fail loudly and leave the decision to a human?
> 3. Is a five-minute polling ceiling right? It is generous against the measured 16–56s, but a cold
>    Railway build could exceed it and fail a deploy that was merely slow.

## Problem

FD-010 made the happy path safe: a commit with failing tests cannot reach production. What it did
not settle is how the system should behave when things go wrong in less tidy ways — a bad commit
landing on `main` at all, a deploy that lands but never identifies itself, or a deploy that is
simply slower than the verification is willing to wait.

None of these block feature work. All three are cheaper to decide now, while the pipeline is small
and fresh, than at the moment one of them actually fires.

## Solution

Three decisions. Each carries a recommendation and the reasoning behind it; implement the
recommendation unless the project owner chooses the alternative, and record which was chosen.

### 1. Branch protection — recommendation: skip it, unless adopting a PR workflow

There is a mechanical catch worth stating plainly: **required status checks gate pull request
merges, not direct pushes.** A check runs *after* a commit exists, so it cannot prevent that commit
from being pushed to `main` in the first place. Classic branch protection on a repository whose
normal flow is `git push origin main` therefore buys very little — it either does nothing or it
forces every change through a PR.

Since the deploy gate already prevents bad code from reaching production, the remaining risk is a
red commit sitting on `main`, which is untidy rather than dangerous.

- **Recommended:** no branch protection while this stays a solo repository with direct pushes.
  Record the decision so it is not revisited by accident.
- **Alternative:** adopt a PR workflow — a GitHub ruleset requiring the `test` check, with bypass
  disabled for administrators. This is the right answer the moment a second person commits, and the
  cost is a PR per change.

### 2. `verify-deploy` failure — recommendation: fail loudly, do not auto-roll-back

A verification timeout means *uncertainty*, not a known-bad deploy: the service may be slow, the
healthcheck may be flapping, or the build may genuinely have failed. Rolling back automatically on
uncertainty risks reverting a deploy that was merely late, and does so unattended.

- **Recommended:** keep the job failing, and make the failure actionable — on timeout,
  `scripts/wait-for-deploy.sh` should print the rollback steps from FD-001 rather than only the last
  response, so whoever reads the red build knows what to do next without hunting for the procedure.
- **Alternative:** automatic rollback via the Railway CLI. It needs the previous deployment id,
  which means recording it before deploying, and it makes an unattended decision at the least
  certain moment.

### 3. Polling ceiling — recommendation: measure a cold build, then set the budget from evidence

The current budget is 30 attempts at 10 seconds. It was chosen against warm deploys measured at
16–56 seconds and has never been tested against a cold build (one where dependencies change and
Nixpacks cannot reuse its cache).

- **Recommended:** force a cold build, measure it, and set the ceiling to roughly three times the
  observed duration. Record the measurement in this file so the number has a justification attached
  rather than being a guess that hardened into a constant.
- **Alternative:** leave it at five minutes and revisit if it ever fires.

## Demo

**Watch this:** here is the decision record — for each of the three edge cases, what the pipeline
now does and why. Then the part you can see: I make the verification fail on purpose, and instead of
a bare timeout the build tells you exactly how to roll back. And here is a cold build, timed, with
the polling budget set from that measurement rather than from a guess.
**Where:** the GitHub Actions log, and `docs/features/archive/FD-011_DEPLOY_GATE_FAILURE_MODES.md`
once closed.
**Shows:** the pipeline's edge cases are decided and documented, not discovered during an incident.

## Feedback Sought

- Does the no-branch-protection call still hold if someone else starts contributing? That is the
  trigger to revisit, and it is worth naming now.
- Is a red build a loud enough signal on its own, or should a failed `verify-deploy` also notify
  somewhere you actually watch?
- Does three times a cold build feel right as a ceiling, or would you rather the budget be tight so
  a slow deploy surfaces as a failure quickly?

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `scripts/wait-for-deploy.sh` | MODIFY | On timeout, print the rollback procedure alongside the last response |
| `.github/workflows/ci.yml` | MODIFY | Adjust the `verify-deploy` attempt budget to the measured cold-build figure |
| `AGENTS.md` | MODIFY | Record the branch-protection decision in `### Deployment` so it is not re-litigated |
| `docs/features/FD-011_DEPLOY_GATE_FAILURE_MODES.md` | MODIFY | Record the chosen options and the cold-build measurement |

## Implementation Steps

- [ ] **Step 1: Record the decisions** — in this file, state which option was chosen for each of the
      three questions and why. Do this first: the code changes follow from the decisions.
- [ ] **Step 2: Write the failing test** — in `test/health.test.ts`, assert that
      `scripts/wait-for-deploy.sh` contains the rollback guidance, so the help text cannot be dropped
      silently. Read the file and assert on its contents.
- [ ] **Step 3: Run it and confirm it fails** — `npm test`, expect the new assertion to fail.
- [ ] **Step 4: Add the guidance** — in `scripts/wait-for-deploy.sh`, extend the timeout branch to
      print the rollback steps: Railway dashboard → the service → Deployments → select by commit
      SHA → ⋮ → Rollback, then re-check `/healthz`.
- [ ] **Step 5: Run the gates** — `npm test && npm run typecheck`, then `bash -n scripts/wait-for-deploy.sh`.
- [ ] **Step 6: Measure a cold build** — change a dependency in `package.json` to defeat the Nixpacks
      cache, push, and time from push to `/healthz` reporting the new commit. Record the figure in
      this file.
- [ ] **Step 7: Set the budget from the measurement** — update the attempt count in the
      `verify-deploy` step of `.github/workflows/ci.yml` to roughly three times the cold-build time.
- [ ] **Step 8: Record the branch-protection decision** — add it to `### Deployment` in `AGENTS.md`,
      including the trigger for revisiting it.
- [ ] **Step 9: Commit** — `FD-011: Decide the deploy gate's remaining failure modes`.

## Verification

1. `npm test && npm run typecheck` — all tests pass, no type errors
2. `bash -n scripts/wait-for-deploy.sh` — syntax clean
3. Forced-failure check: `./scripts/wait-for-deploy.sh https://htmx-todos-production.up.railway.app 0000000000000000000000000000000000000000 2 1` exits 1 **and** prints the rollback steps
4. The cold-build measurement is written in this file with the date it was taken
5. The attempt budget in `.github/workflows/ci.yml` matches that measurement
6. `grep -A 4 '^### Deployment' AGENTS.md` shows the branch-protection decision and its revisit trigger
7. Full pipeline still green: `test` → `deploy` → `verify-deploy`, and `/healthz` reports the pushed commit
8. **Demo walkthrough:** the click path in `## Demo`

## Depends On

Nothing. FD-010 is complete and this refines it; it touches CI configuration, one shell script, and
documentation, so it can be implemented at any point.

## Related

- Parent: `docs/features/archive/FD-010_CI_GATES_DEPLOY.md` — its `## Results` section holds the
  16–56 second warm-deploy measurements this FD's budget is currently based on
- `docs/features/archive/FD-001_WALKING_SKELETON_TO_RAILWAY.md` — its `## Delivery Path` section
  holds the rollback procedure step 4 should surface
- **Also open, deliberately out of scope:** docs-only commits still trigger a full deploy. A
  `paths-ignore` for `docs/**` would save builds, at the cost of the running commit no longer
  matching `main` — which is the drift `/healthz` exists to expose. Recorded in FD-010 and left alone.
