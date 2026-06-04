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
- [ ] Enable and verify RLS on all public-facing tables.
- [ ] Create explicit policies per role/action (manager, employee).
- [ ] Verify non-authorized role cannot read/write restricted rows.
- [ ] Ensure immutable behavior for approved billing data is enforced.

## Application authorization
- [ ] Protect all mutation routes/actions with session + role checks.
- [ ] Enforce manager-only actions (approvals, settings, correction paths).
- [ ] Enforce employee edit limits (`phone`, `boxNumber`, `building`, `status` only).
- [ ] Add server-side ownership/permission validation for every write.

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
