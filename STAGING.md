# Environments

| Env | Branch | URL | Supabase |
|---|---|---|---|
| **Production** | `main` | https://station-v2.vercel.app | prod project |
| **Staging** | `staging` | `station-v2-git-staging-<vercel-scope>.vercel.app` (Vercel auto-preview) | see below |
| Local | — | http://localhost:3010 | whatever's in `apps/web/.env.local` |

The footer of every page shows `v<version> · <commit> · <env> · <built-at>`
(`prod` / `staging` / `local`, with a colour cue for the non-prod ones), so you
can always tell which build a tab is running.

## Flow

```
work on a branch  ->  merge into `staging`  ->  test on the staging URL  ->  PR `staging` -> `main`  ->  production
```

- Every push to `staging` triggers a Vercel **Preview** deployment at a stable
  branch URL (`station-v2-git-staging-…vercel.app`). No extra Vercel project.
- Every push to `main` deploys **Production** (unchanged).
- Keep `staging` a superset of `main`: `git checkout staging && git merge main`
  before starting, and only fast-forward `main` from `staging` (or merge a PR).

## Staging database — pick one

**A. Share the production Supabase (zero setup).**
Nothing to do — the `staging` branch build uses the same Supabase env vars as
production unless you override them (below). Fine for "look before prod" checks
by yourself, but staging writes (submissions, approvals, QR collections,
migrations) hit real data.

**B. Separate free Supabase project for staging (isolated).**
1. Create a new Supabase project (free tier).
2. Run every migration in order against it:
   `db/schema.sql` (or `001_init_schema.sql`) then `002` … `011`.
3. Seed: `db/seed.sql`.
4. Create a separate Vercel **Blob** store for staging (keep it off prod's).
5. In Vercel → Project → Settings → Environment Variables, add the staging
   project's `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, and the blob token **scoped to `Preview` only**
   (leave the `Production` values pointing at prod).
6. Re-deploy the `staging` branch.

Now `staging` is fully isolated: run new migrations there first, test, then run
them on prod and merge to `main`.

## Migrations

Migrations are still applied by hand (`psql` / Supabase SQL editor). Order:
`001 … 011`. With option B: run on **staging first**, verify, then prod, then
merge the code to `main`.
