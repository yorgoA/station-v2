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

## Known gaps / next steps (not started)
- No way to add a missed reading to an already-`approved_posted` batch (accepted gap, not built)
- Receipt/photo upload isn't wired to real storage (no `@vercel/blob`/`sharp` yet)
- Settings → Accounts page is still local-state mock data, not real
- No RLS policies on Supabase tables — everything currently relies on the app-layer `requireRole`
  guard + the service-role key; `SECURITY_CHECKLIST.md` still has this open
- **`GET /api/customers` (the list endpoint behind `/manager/customers` and `/employee/customers`)
  mislabels every customer's billing type as either `free` or `metered`** — it has its own
  primitive mapping (`isFree ? "free" : key === "FIXED_MONTHLY" ? "fixed-monthly" : "metered"`)
  that doesn't know about `both`/`amp-only` at all. Confirmed live: `C-0001`/`C-0002` (real `both`/
  `amp-only` customers) show as "metered" in the customer list table, even though the detail page
  (`GET /api/customers/[customerId]`, already fixed) shows the correct type. Same file's filter
  dropdown also only offers Metered/Fixed-monthly as filter options. Not fixed yet — same root
  cause as the gap we just closed, different endpoint.

## Where to pick up next session
Just say "check HANDOFF.md and keep going" — natural next step is either the customers-list
mislabeling bug above (quick, same shape as what we just fixed), the payments flow / receipt
upload, or one of the other gaps.
