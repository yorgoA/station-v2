# Testing & CI

Two layers, both against a real deployed environment (staging) -- nothing here
runs against a local dev server or a mocked backend.

| | Runs when | What | Where |
|---|---|---|---|
| **Smoke** | every push to `staging` | Fast: login, each role's dashboard loads, the Monitors page renders | `.github/workflows/staging-smoke.yml` |
| **Pre-production gate** | every PR into `main` | `next lint`, `prettier --check`, `tsc`, `next build`, and the **full** Playwright suite (smoke + regression) | `.github/workflows/main-regression.yml` |

Promoting `staging` -> `main` now goes through a **pull request** instead of a
direct push, specifically so the gate above can block a bad merge. Everything
else (branch -> `staging`) is unchanged.

## One-time setup (you have to do these -- I can't enter secrets)

### 1. GitHub Actions secrets
Repo -> **Settings -> Secrets and variables -> Actions -> New repository secret**. Add:

| Name | Value |
|---|---|
| `VERCEL_AUTOMATION_BYPASS_SECRET` | From Vercel -> station-v2 -> Settings -> Deployment Protection -> **Protection Bypass for Automation** -- I generated one there labeled "GitHub Actions - Playwright E2E"; click the eye icon and copy it. |
| `E2E_MANAGER_EMAIL` | `yorgo.staging.stationv2@hotmail.com` |
| `E2E_MANAGER_PASSWORD` | the staging manager's password |
| `E2E_EMPLOYEE_EMAIL` | `aoun.station.acc.staging.stationv2@gmail.com` |
| `E2E_EMPLOYEE_PASSWORD` | the staging employee's password |
| `E2E_COLLECTOR_EMAIL` | `yamen.staging.stationv2@hotmail.com` |
| `E2E_COLLECTOR_PASSWORD` | the staging collector's password |

Why a bypass secret at all: staging has Vercel Authentication turned on (so
only you can browse it) -- without this, GitHub's runner would get bounced by
Vercel's own login wall before it ever reached the app.

### 2. Branch protection on `main`
Repo -> **Settings -> Branches -> Add branch protection rule** -> branch name
pattern `main` ->
- Check **Require a pull request before merging**
- Check **Require status checks to pass before merging**, then search for and
  add these three (they only appear in the list after the workflow has run at
  least once -- see the bootstrap note below):
  - `lint-format-typecheck`
  - `build`
  - `full-regression`
- Save.

From then on, the merge button on a `staging -> main` PR is disabled until all
three are green.

### Bootstrap note
These workflow files, plus a couple of housekeeping changes (Prettier applied
to the whole codebase once, the new `e2e/` folder), were pushed straight to
`main` in this same batch -- there was no PR gate yet for the change that
*creates* the gate. Every promotion after this one goes through the PR flow
above.

## Running locally

```bash
cd e2e
cp .env.example .env   # fill in the same values as the GitHub secrets above
npm install
npx playwright install --with-deps chromium
npm run test:smoke        # fast subset
npm run test:regression   # everything else
npm run test:all          # both
npm run report             # open the HTML report from the last run
```

## What's covered vs. not (yet)

**Covered:**
- Login works and rejects bad credentials cleanly (no crash)
- Each role lands on the right dashboard and it renders with no console errors
- Every nav item per role at least responds and mounts without a client-side
  crash (`e2e/tests/regression/pages.spec.ts`)
- The actual security-review questions, automated: unauthenticated requests
  get 401, a role can't call another role's manager-only endpoints (403), the
  endpoints that *should* work for a role still do, and a failing request
  never leaks a raw error message to the client
- AppShell's client-side role gate really redirects cross-role visits instead
  of rendering the other role's page
- The Monitors page's KPI row and "Linked kWh (included)" column render
  (direct regression guard for this session's fix)

**Not covered yet, on purpose:** real write flows -- an employee submitting a
billing batch, a manager approving and posting it, a collector recording a QR
collection and an employee validating it. These mutate real data in the
shared staging database that's also used for manual QA, so doing this safely
needs a dedicated test customer that gets created and cleaned up per run.
Worth a follow-up phase once the read-only suite has been running for a
while.
