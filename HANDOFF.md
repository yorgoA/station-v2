# Handoff — 2026-07-16

## Just shipped (committed as `6731ed7`)

1. **Real billing calculation engine**
   - `ampere_price_tiers` / `monthly_kwh_tariffs` tables (replaced hardcoded TS constants)
   - `approve_billing_batch()` Postgres function: computes real ampere+kWh pricing, snapshots
     the prices used onto each bill, blocks approval if that month's kWh price isn't set yet
   - `bills` are now immutable once priced (new trigger) — `paid_amount`/`remaining_amount`/`status`
     still editable for the future payments flow
   - Verified live end-to-end (submit → block-without-price → set price → approve → correct bill
     amount → edit blocked)

2. **Real auth on every API route**
   - `lib/auth/require-role.ts` — validates the Supabase session server-side, checks role,
     resolves the real `app_users` actor (no more fake `system.manager` placeholder)
   - Applied to all 17 API routes in the app
   - Employees are now hard-blocked from editing anything on a customer except
     phone/boxNumber/building/status (previously unenforced despite a code comment saying so)
   - Added `'collector'` to the `user_role` enum

3. **Cleanup**
   - Deleted 8 dead placeholder pages (`/customers`, `/payments`, `/settings`, `/reports/overview`,
     `/reports/audit`, `/reports/loss-analysis`, `/reports/monthly-bills`, `/reports/monthly-collections`)
     — these were unreachable anyway since `middleware.ts` unconditionally redirects them to `/login`
   - Built a real `/manager/reports/audit` page + API to replace one of them

## DB state (as of this session)
- Migrations `002_billing_pricing.sql` and `003_collector_role.sql`: **both applied** (you ran them)
- `app_users` has your 3 real accounts (manager/employee/collector) wired to real emails
- **`TEST-VERIFY-01` test customer/bill/batch still exists** — by design, `bills` rows can't be
  deleted (the new immutability trigger blocks `DELETE` outright). If you want it gone, someone
  has to temporarily `ALTER TABLE bills DISABLE TRIGGER trg_block_bill_pricing_mutation`, delete,
  then re-enable — not something to do casually. Recommend just leaving it; it's obviously fake
  (fake month `2099-02`/`2099-04`, fake customer number) and harmless.

## Known gaps / next steps (not started)
- No way to add a missed reading to an already-`approved_posted` batch (flagged earlier as an
  accepted gap, not yet built)
- Employee entry UI still only supports `metered`/`fixed-monthly` billing types, even though
  `amp-only`/`both` now exist as real DB rows and the calc engine supports them
- Receipt/photo upload isn't wired to real storage (no `@vercel/blob`/`sharp` yet)
- Settings → Accounts page is still local-state mock data, not real
- No RLS policies on Supabase tables — everything currently relies on the app-layer `requireRole`
  guard + the service-role key; `SECURITY_CHECKLIST.md` still has this open

## Where to pick up next session
Just say "check HANDOFF.md and keep going" — the two natural next steps discussed were:
(a) extend the entry UI for `amp-only`/`both`, or (b) wire the payments flow / receipt upload.
