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

**B. Separate free Supabase project for staging (isolated).** ← chosen

Staging project: **`station-v2-staging`** in the **`Tromba-Staging`** org (free tier).
Project ref `qfnbnvzlmwlkurijypwa` · URL `https://qfnbnvzlmwlkurijypwa.supabase.co`

Done:
- [x] Supabase project created.
- [x] `db/schema.sql` run in the SQL editor (all of `001…011` folded in).
- [x] `db/seed.sql` run (2 regions, 4 billing_types, 20 ampere tiers).
- [x] Verified: 16 public tables, 7 functions, seed rows present.

Left to do (all in Vercel + Supabase Auth — must be done by hand because it
means pasting the service-role key into a field):

1. **Split the 3 Supabase env vars in Vercel** (Project → Settings → Environment
   Variables). They are currently one value each, scoped to *Production and
   Preview*. For `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`:
   - Edit the existing var → set its environment to **Production only**.
   - Add a new var with the **same name**, the **staging** value, **Preview only**:
     - `NEXT_PUBLIC_SUPABASE_URL` = `https://qfnbnvzlmwlkurijypwa.supabase.co`
     - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = staging *publishable* key
       (Supabase → Project Settings → API Keys)
     - `SUPABASE_SERVICE_ROLE_KEY` = staging *secret* key (same page)
2. **Blob store** — either leave `station-v2-blob` shared (staging test photos
   land in the prod bucket, no billing impact), or create
   `station-v2-blob-staging` connected to **Preview only** and flip
   `station-v2-blob` to **Production only** so `BLOB_READ_WRITE_TOKEN` doesn't
   collide.
3. **Redeploy `staging`** (Deployments → latest `staging` build → Redeploy) so it
   picks up the new Preview vars.
4. **Bootstrap the first staging manager** (rest of the accounts get made from
   the app afterwards):
   - Supabase staging → Authentication → Users → Add user: email + password,
     and under *User Metadata* set `{ "role": "manager" }`.
   - Supabase staging → SQL Editor:
     `insert into app_users (role, display_name, email, is_active)
      values ('manager', 'Manager', '<that email, lowercased>', true);`
   - Log in to the staging URL as that manager → Settings → Accounts → create
     the employee and collector accounts there.

Now `staging` is fully isolated: run new migrations there first, test, then run
them on prod and merge to `main`.

## Migrations

Migrations are still applied by hand (`psql` / Supabase SQL editor). Order:
`001 … 011`. With option B: run on **staging first**, verify, then prod, then
merge the code to `main`.
