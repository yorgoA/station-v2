# Station V2

Station V2 is the billing and operations system for a private electricity generator provider (subscribers pay a private generator operator for power, on top of/instead of unreliable national grid supply — a common setup in Lebanon). It replaces a Google Sheets–based workflow (the "V1" system, `electricity-mvp` / `Station_V2/`) with a proper Postgres-backed app: customer records, monthly meter-reading billing, payment tracking, a manager-review workflow, and loss/collections reporting.

The provider currently serves two regions/stations — **Mrah Ghanem** (`mrah`) and **Printania** (`printania`) — each with its own generator, customers, and monthly billing batch.

## What the app actually does

1. **Customer registry** — every subscriber has a region, an optional "monitor" (sub-meter) relationship, a billing type, and free-customer status.
2. **Monthly meter-reading entry** — an employee walks the region, photographs each meter, and records the counter reading for the month.
3. **Manager review workflow** — readings are batched per `(month, region)` and go through `draft → pending_review → changes_requested → approved_posted`. Once approved, a batch (and its line items) becomes immutable — enforced by Postgres triggers, not just app logic.
4. **Billing & payments** — approved readings become `bills`; `payments` are recorded against a customer/bill and reduce the remaining balance.
5. **QR-based collection** — a collector can scan/enter a customer number, log a cash collection with a receipt photo, and hand it off for employee validation (`pending_employee_validation → validated_by_employee`).
6. **Reports** — money collected vs. owed, kWh produced vs. billed ("loss analysis"), free-customer impact, monitor customers, per-region breakdowns.

## Roles

| Role | Can do |
|---|---|
| **Manager** | Approve/reject monthly billing batches (with mandatory note on rejection), manage pricing settings, enter generator kWh per month/region, view all reports, manage accounts. |
| **Employee** | Enter monthly meter readings, record payments/receipts, submit batches for manager review, limited customer edits (phone, box number, building, status), validate collector handoffs. |
| **Collector** | Scan a customer QR/number, log a cash collection amount with a photo receipt. |

## The billing calculations

Pricing is stored in Postgres (`ampere_price_tiers`, `monthly_kwh_tariffs`) and managed from the Manager → Settings → Pricing screen via `/api/settings/pricing*`. The shared calculation logic lives in [`apps/web/lib/reports/pricing.ts`](apps/web/lib/reports/pricing.ts) (TS side, used for report previews) and `approve_billing_batch()` in [`db/schema.sql`](db/schema.sql) (DB side, authoritative). Two things drive a bill:

- **Ampere tier price** — a fixed monthly fee based on the customer's subscribed amperage (e.g. 5A → 385,000 LBP, 10A → 685,000 LBP, up to 180A → 10,885,000 LBP). Looked up by exact match, or the next tier below if the exact amperage isn't in the table. These are *current* prices, not month-keyed — editing one only affects batches approved afterward, since every approved bill freezes its own price snapshot.
- **kWh tariff** — a price-per-kWh set **per calendar month** (e.g. 2026-05: 54,335 LBP/kWh), because generator fuel costs fluctuate. There is **no fallback price** — a batch cannot be approved for a month until its tariff is explicitly entered. This is deliberate: meter readings can be submitted anytime, but nothing gets priced with a stale or guessed number.

Billing types determine which components apply to a given customer:
- `metered` — billed on consumption (kWh) only.
- `amp-only` — billed on the ampere tier only (flat monthly fee, no meter reading needed).
- `both` — ampere fee + consumption charge combined.
- `fixed-monthly` — a flat recurring charge unrelated to metering.
- `free` — no charge; still metered for loss-tracking purposes.

Per meter reading:
```
consumption_kwh   = new_counter - previous_counter          (must be >= 0)
consumption_charge = consumption_kwh * kwh_price_for_month
ampere_charge       = fixed price for the customer's subscribed ampere tier
bill_amount          = ampere_charge + consumption_charge    (per billing type, see above)
remaining_amount     = amount - paid_amount                  (DB-enforced check constraint)
```

**Loss analysis** compares what the generator produced against what was actually billed, to surface technical loss, theft, or free-customer usage:
```
loss_percent = (generator_kwh - billed_kwh_to_paying_customers) / generator_kwh * 100
```
This is computed both in SQL ([`db/verify_calculation_parity.sql`](db/verify_calculation_parity.sql)) against `generator_monthly_readings` vs. `bills`, and in the reports API ([`apps/web/app/api/reports/manager/route.ts`](apps/web/app/api/reports/manager/route.ts)) as `(totalKwhProduced - payingKwh) / totalKwhProduced`.

> Note: `calculated_amount` on `billing_batch_items` is still just raw kWh consumption at *submission* time — that's expected, it's draft data. Real pricing only happens once, at the moment a manager approves a batch: `POST /api/billing/batches/[batchId]/approve` calls `approve_billing_batch()`, which prices every item, writes the real `bills` rows, snapshots the ampere/kWh prices used (`ampere_price_snapshot` / `kwh_price_snapshot` on both `billing_batch_items` and `bills`), and blocks (with a clear error) if that month's kWh tariff hasn't been set yet.

## Billing batch lifecycle & safety rules

```
draft → pending_review → changes_requested → pending_review → approved_posted
```
Enforced by a Postgres trigger (`validate_billing_batch_transition`) on `billing_batches`:
- Only the transitions above are allowed.
- Rejecting a batch (`pending_review → changes_requested`) requires a non-empty `manager_note`.
- Any manager decision requires `reviewed_by_user_id` + `reviewed_at`.
- Once a batch is `approved_posted`, both the batch and its `billing_batch_items` become **immutable** (`block_approved_batch_mutation` trigger blocks further insert/update/delete).
- Every meter-reading item requires exactly one counter photo (`counter_image_url`) before it can be approved.
- Approving is a single atomic transaction (`approve_billing_batch()`): a missing kWh tariff, or any item that can't be priced (e.g. a customer with no `subscribed_ampere` on amp-based billing), aborts the whole approval — no partial/wrong bills are ever written.
- `bills` rows are separately protected once written: `block_bill_pricing_mutation` blocks any change to `amount`/`consumption_kwh`/counters/price snapshots and blocks deletion outright, while still allowing `paid_amount`/`remaining_amount`/`status` updates for the payments flow.

**Known gap:** there's currently no way to add a missed reading to a batch that's already `approved_posted` — a manager must ensure all readings are in before approving. A correction/adjustment flow for this is a planned fast-follow, not yet built.

## Data model

Core tables (see [`db/schema.sql`](db/schema.sql)):

- `regions`, `monitors`, `billing_types`, `app_users` — reference data
- `ampere_price_tiers`, `monthly_kwh_tariffs` — current pricing config, manager-editable; changes never affect already-approved bills
- `customers` — subscriber records (region, monitor, billing type, `subscribed_ampere`, `fixed_monthly_amount`, free-customer flag)
- `billing_batches` / `billing_batch_items` / `billing_batch_item_reviews` / `billing_batch_events` — the monthly draft→approve workflow and its audit trail
- `bills` — final approved monthly charges per customer (`amount`, `paid_amount`, `remaining_amount`, price snapshots)
- `payments` — cash/other payments applied against bills
- `qr_collection_logs` — collector scan → employee validation handoff
- `generator_monthly_readings` — generator kWh output per month/region, used for loss analysis

`amp-only` and `both` billing types now exist in `billing_types` seed data alongside `metered`/`fixed-monthly`, matching V1's five categories (`free` is the separate `customers.is_free_customer` flag). The employee entry UI still only exposes `metered`/`fixed-monthly` today — extending it to the other two is a fast-follow, not done in this pass.

`db/schema_notes.md` documents the exact V1 (Google Sheets) → V2 (Postgres) table/column mapping used for backfill, and `db/verify_calculation_parity.sql` / `SECURITY_CHECKLIST.md` are the pre-cutover verification and hardening checklists.

## Tech stack

- **Frontend/API**: Next.js 14 (App Router), React 18, TypeScript, Recharts for charts
- **Database**: Supabase Postgres (`@supabase/supabase-js`, `@supabase/ssr`)
- **Deployment**: Vercel

## Layout

- `apps/web` — Next.js app (dev port **3010**)
- `db/` — schema, migrations, seed data, reconciliation SQL
- `scripts/` — guarded maintenance scripts (e.g. counter-image backfill, clearing draft workflow entries)
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

## Project status / milestones

1. Workspace + architecture
2. Database schema and migrations
3. Role-aware Next.js routes
4. Billing draft / review / approve
5. Reports and loss analysis
6. Sheets backfill and reconciliation
7. Progressive cutover to Postgres

This is an active rebuild — some screens (e.g. pricing settings, billing entry) are still design-first prototypes with local state rather than fully wired to Postgres. See `docs/ARCHITECTURE.md` and `SECURITY_CHECKLIST.md` before any production cutover.
