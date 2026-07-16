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

## Also shipped this session (committed as `fc9549c`)

4. **amp-only / both billing wired up end-to-end**
   - Customer creation now actually persists `subscribed_ampere` / `fixed_monthly_amount`
     (previously collected nowhere, or in `fixed-monthly`'s case just missing) and fixes a bug
     where `'both'` was silently coerced to `metered` billing_type_id on create
   - Add Customer form shows the ampere/fixed-monthly input conditionally, with validation
   - Entry-rows API + the entry page's per-row billing type selector support all 4 real types
     (`metered`/`amp-only`/`both`/`fixed-monthly`), with a visible warning if an amp-based
     customer has no ampere set
   - **Verified live**: created a real amp-only (10A) and a real `both` (15A + 40kWh) customer via
     the actual employee-authenticated API, submitted readings, approved — bills came out to
     exactly 685,000 and 1,385,000 LBP, matching hand-calculated tier math
   - Test customers `C-0001`/`C-0002` (month `2099-06`) are additional permanent test artifacts,
     same reasoning as `TEST-VERIFY-01` above (bills can't be deleted by design)

## Real-data check (informational, no code change)
Pulled the actual customer book from electricity-mvp's CSV import (`Worksheet-Table 1.csv`, 409
rows) to check which billing types are actually used in this business: **98.3% `both`, 1.7%
`fixed-monthly`, 0% pure `metered`, 0% pure `amp-only`** (plus a `free` flag on ~27 customers,
layered on top). So `both` isn't an edge case — it's almost the entire book.

Result: hid `metered`/`amp-only` from the Add Customer and entry-row dropdowns (employees can no
longer accidentally pick a type nothing in the business uses) — underlying DB/calc support is
untouched, just not offered as a choice. Committed as `af7374c`.

## Also shipped this session (committed as `9534b85`)

5. **Managers can now edit a customer's billing type/ampere/fixed-monthly after creation**
   - This was gap #4 below — closing it. `GET`/`PATCH /api/customers/[customerId]` now
     read/write `subscribedAmpere`/`fixedMonthlyAmount`; `billingPlan` accepts all 4 real types
     (previously hardcoded to `metered`/`fixed-monthly`/`free` only — `both`, your dominant real
     type, couldn't be set post-creation at all). Same `'both'`→`metered` coercion bug from
     creation was present here too and is now fixed.
   - Manager edit page dropdown offers the 3 real options (`both`/`fixed-monthly`/`free`) plus a
     "(legacy)" fallback so an existing `metered`/`amp-only` customer doesn't lose its value just
     from opening the edit form.
   - **Verified live**: edited a real amp-only customer to `both` with a new ampere value via the
     actual manager UI, confirmed both `billing_type_id` and `subscribed_ampere` persisted
     correctly in Postgres.

## Also shipped this session (committed as `e66ac9a`)

6. **Fixed customer-list billing-type mislabeling**
   - `GET /api/customers` (behind `/manager/customers` and `/employee/customers`) compared
     `billing_types.key` (real values: `metered`/`amp-only`/`both`/`fixed-monthly`, lowercase-
     hyphenated) against `"FIXED_MONTHLY"`/`"FREE"` literals that never matched anything real —
     every non-free customer silently fell through to "metered" regardless of actual type.
   - **Verified live**: this wasn't just theoretical — pre-existing test customers (`Karim Test`,
     `Nadim Test`) had real `amp-only`/`fixed-monthly` types in the DB all along, both showing as
     "metered" in the list before the fix, correctly as `amp-only`/`fixed-monthly` after.
   - Also widened the billing-type filter dropdown (both list pages) to offer all 4 real types
     plus `free` (previously only Metered/Fixed-monthly, so you couldn't even filter to see your
     `both` customers — 98% of the book). Verified filtering to "Both" correctly narrows to
     exactly the real `both` customers.

## Also shipped this session (committed as `92c2ec2`, `d4bbd99`)

7. **Real payment application + receipt upload**
   - New `record_payment()` Postgres function: applies a payment to exactly the bill for
     (customer, month), atomically updating `paid_amount`/`remaining_amount`/`status`, rejecting
     if the amount exceeds that bill's remaining balance. Previously, recording a payment did
     **nothing** to what a customer owed — this was a real, silent gap.
   - Ported V1's `receipt-image.ts` (sharp resize/reencode) and `receipt-upload.ts` (Vercel Blob)
     into `apps/web/lib/receipts/`; added `@vercel/blob` + `sharp` as dependencies. New guarded
     `POST /api/receipt/upload` route. Employee payments page now actually uploads the selected
     file before recording the payment.
   - Along the way, fixed **two pre-existing type errors** that had been quietly tolerated by
     `next dev`/`tsc --noEmit` all session but turned out to hard-block Vercel's production build
     (`api/billing/batches/[batchId]/route.ts` non-literal Supabase `.select()`, and a missing
     `?.` in `employee/customers/[customerId]/page.tsx`). Verified with a full local
     `npm run build`, not just `tsc --noEmit` — worth remembering for future sessions, since dev
     mode is more lenient than the real production build.

## 🚀 station-v2 is now deployed and live

- **URL**: https://station-v2.vercel.app (Vercel project `yorgoas-projects/station-v2`, root
  directory `apps/web`, auto-deploys on push to `main`)
- All Supabase env vars + a dedicated **`station-v2-blob`** Vercel Blob store (kept separate from
  V1's existing `station-counters-blob`, per your own "keep V2 isolated from V1" checklist item)
  are configured on the project.
- **Verified live** (unauthenticated): login page loads, and both `/api/customers` and
  `/api/receipt/upload` correctly return 401 without a session — same auth behavior as local dev.
- Cost note (see chat): current setup is $0/month (Vercel Hobby + Supabase Free). The two real
  reasons to eventually pay are Supabase Free's 7-day inactivity auto-pause and Vercel Hobby's
  non-commercial terms — not data volume, which stays cheap for years even with photo uploads
  (~$45/month total for Vercel Pro + Supabase Pro if/when you want that).

## Also shipped this session (committed as `ba242ba`, `4c5a1fe`)

8. **Live-verified payments/receipt upload on production, found + fixed a real bug**
   - Logged in as employee on the real `station-v2.vercel.app`, created a real bill (2,315,050
     LBP: 10A tier + 30kWh), and confirmed: overpayment is correctly rejected with an exact error
     message; a valid partial payment (1,000,000 LBP) reduced the bill to exactly 1,315,050
     remaining; the receipt photo was genuinely uploaded to Vercel Blob (real `sharp`-processed
     PNG, not a placeholder).
   - Found live: `record_payment()` used `current_date` for `payment_date` instead of the bill's
     own month, which silently broke month-filtered payment views even though the payment itself
     applied correctly. Fixed to pin `payment_date` to the bill's `month_key` (matching the
     existing `${monthKey}-07` convention used elsewhere in the app).

9. **RLS enabled on all 15 tables — closed a real public-key exposure**
   - `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are sent to every browser
     by design. Without RLS, that key could query Supabase's REST API directly and read/write any
     table, completely bypassing the app and `requireRole()` — a real, live exposure once
     deployed publicly (not just a checklist item anymore).
   - Fix: RLS enabled with **zero policies** on every table (`db/migrations/005_enable_rls.sql`).
     No policies needed — confirmed the app's client-side code only ever uses the public key for
     Supabase Auth (sign in / get user / sign out), never a direct table query, so default-deny is
     complete and correct. All real data access goes through API routes using the service-role
     key, which bypasses RLS regardless.
   - **Verified live**: `curl` with the real anon key against `/rest/v1/customers` now returns
     `permission denied for table customers` (previously would've returned real data); a real
     logged-in employee session on production still loads correct data
     (`Test PayFlow` → $1,315,050 total due, matching the payment test above) — RLS broke nothing.
   - Updated `SECURITY_CHECKLIST.md` to reflect verified reality instead of the original unchecked
     boilerplate (several Application Authorization items were already true from earlier this
     session and are now checked off with evidence).

## Known gaps / next steps (not started)
- No way to add a missed reading to an already-`approved_posted` batch (accepted gap, not built)
- Settings → Accounts page is still local-state mock data, not real
- No per-region/per-customer ownership scoping (any employee can act on any region's customers —
  role-level checks are solid, there's just no finer-grained ownership boundary yet)

## Where to pick up next session
Just say "check HANDOFF.md and keep going" — natural next step is the missed-reading-after-approval
gap or the real Accounts management page.
