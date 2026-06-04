# Station V2

Standalone rebuild of the electricity station app: Supabase Postgres, role-based workflows, billing batches, and reports.

Previously lived inside `electricity-mvp` as `Station_V2/`; this repo is the canonical home for V2.

## Layout

- `apps/web` — Next.js app (port **3010** in dev)
- `db/` — schema, migrations, seeds
- `scripts/` — guarded maintenance scripts
- `docs/` — architecture notes

## Local setup

```bash
cd apps/web
cp .env.example .env.local   # fill in Supabase values
npm install
npm run dev
```

Open http://localhost:3010

## Deploy

Deploy `apps/web` as the Vercel project root, or set Root Directory to `apps/web` in Vercel.

## Milestones

1. Workspace + architecture
2. Database schema and migrations
3. Role-aware Next.js routes
4. Billing draft / review / approve
5. Reports and loss analysis
6. Sheets backfill and reconciliation
7. Progressive cutover to Postgres

See `docs/ARCHITECTURE.md` and `SECURITY_CHECKLIST.md`.
