# Station V2 Security Checklist

Use this checklist before production cutover.

## Current phase (development)
- [x] V2 workspace isolated from V1 (`Station_V2/`).
- [x] V2 database is separate from live V1 data source.
- [x] Server-side Supabase connectivity verified.
- [x] Cursor safety rules added for data mutations and verification.

## Secrets management
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is used only in server-side code.
- [ ] Ensure `.env.local` is never committed or exposed.
- [ ] Add separate env vars for local/dev/staging/production.
- [ ] Rotate keys once setup stabilizes (recommended).

## Database access control
- [ ] Remove temporary broad dev grants/policies.
- [x] Enable and verify RLS on all public-facing tables (`db/migrations/005_enable_rls.sql`).
- [ ] ~~Create explicit policies per role/action~~ — not needed: RLS is enabled with zero
      policies (default-deny) for `anon`/`authenticated`. The app never queries tables with
      the public key (verified: every `createSupabasePublicClient()` call site is Auth-only),
      so per-role DB policies would be unused surface area, not missing coverage.
- [x] Verify non-authorized role cannot read/write restricted rows (tested live: anon key
      querying tables directly via the REST API is denied after RLS was enabled).
- [x] Ensure immutable behavior for approved billing data is enforced (`block_approved_batch_mutation`,
      `block_bill_pricing_mutation` triggers).

## Application authorization
- [x] Protect all mutation routes/actions with session + role checks (`requireRole()` on all
      API routes, verified live: unauthenticated requests return 401 across the board).
- [x] Enforce manager-only actions (approvals, settings, batch review/approve are all
      `requireRole(["manager"])`).
- [x] Enforce employee edit limits (`phone`, `boxNumber`, `building`, `status` only — enforced
      server-side in the customer PATCH handler, not just hidden in the UI).
- [ ] Add server-side ownership/permission validation for every write (role-level checks are
      done; there's no per-region/per-customer ownership scoping yet — e.g. any employee can
      act on any region's customers).

## Data integrity and auditability
- [ ] Ensure mandatory manager note on rejection is enforced.
- [ ] Ensure exactly one counter image is required per monthly reading item.
- [ ] Log state transitions (`draft` -> `pending_review` -> ...).
- [ ] Add immutable audit trail for corrections and sensitive updates.
- [ ] Add reconciliation checks for totals before and after migration.

## Notifications and operational safety
- [ ] Add in-app + email notifications for approval workflow events.
- [ ] Add manager reminder notifications for missing generator monthly input.
- [ ] Add alerting on failed jobs/mutations.
- [ ] Add monthly backup and restore drill.

## Pre-production gate (must pass all)
- [ ] Security review completed.
- [ ] RLS/permissions test suite passes.
- [ ] Migration rehearsal completed with parity checks.
- [ ] No unresolved high-severity findings.
