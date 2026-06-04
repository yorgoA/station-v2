# Station V2 Schema Notes (V1 -> V2 Mapping)

Purpose: provide deterministic mapping from Google Sheets-era data structures to V2 Postgres tables.

## Source of Truth in V1
- Sheets access layer: `src/lib/google-sheets.ts`
- Sheet parsing utilities: `src/lib/sheets-utils.ts`
- Billing/payment behavior: `src/app/actions/bill.ts`, `src/app/actions/payment.ts`
- Formula reference: `docs/calculations.md`

## Mapping Principles
- Keep existing business logic outcomes unchanged.
- Normalize where helpful, but preserve reportability/history.
- Prefer explicit nullable fields over implicit missing cells.
- Preserve month key format as `YYYY-MM`.

## V1 Tabs -> V2 Tables

### Customers tab -> `customers`
- `customerNumber` -> `customers.customer_number`
- `name`/`fullName` -> `customers.full_name`
- `region` -> `customers.region_id` (via lookup in `regions`)
- `monitor` -> `customers.monitor_id` (via lookup in `monitors`)
- `billingType` -> `customers.billing_type_id` (via lookup in `billing_types`)
- `boxNumber` -> `customers.box_number`
- `building` -> `customers.building`
- `phone` -> `customers.phone`
- `status` -> `customers.status`
- free-customer flag -> `customers.is_free_customer`
- legacy old total -> `customers.old_total_amount`
- notes (if present) -> `customers.notes`

### Bills tab -> `bills`
- customer ref -> `bills.customer_id`
- month -> `bills.month_key`
- region -> `bills.region_id`
- previous counter -> `bills.previous_counter`
- new counter -> `bills.new_counter`
- consumption -> `bills.consumption_kwh`
- total amount -> `bills.amount`
- paid amount -> `bills.paid_amount`
- remaining -> `bills.remaining_amount`
- status -> `bills.status`

### Payments tab -> `payments`
- customer ref -> `payments.customer_id`
- bill ref (if resolvable) -> `payments.bill_id`
- payment amount -> `payments.amount`
- date -> `payments.payment_date`
- method -> `payments.method`
- receipt image/url -> `payments.receipt_image_url`
- notes -> `payments.notes`

### Settings / reference tabs -> reference tables
- regions -> `regions`
- monitors -> `monitors`
- billing types -> `billing_types`

### New in V2 (no direct V1 equivalent)
- `billing_batches`
- `billing_batch_items`
- `billing_batch_events`
- `generator_monthly_readings`

## Backfill Order (recommended)
1. `regions`
2. `billing_types`
3. `monitors`
4. `customers`
5. `bills`
6. `payments`
7. Optional historical reconstruction for `billing_batches` (if possible)

## Data Quality Checks Before Insert
- Month values parse to `YYYY-MM`.
- Numeric fields parse and are non-negative where required.
- Counter monotonicity: `new_counter >= previous_counter`.
- Customer references resolve uniquely.
- Duplicate prevention:
  - customers by `customer_number`
  - bills by `(customer_id, month_key)`
  - generator readings by `(month_key, region_id)`

## Reconciliation Checks After Backfill
- Total customers count per region.
- Sum of bill amounts and remaining balances per month.
- Sum of payments per month.
- Spot-check 20 random customers:
  - monthly bill amount
  - carry-over/remaining logic
  - payment linkage correctness

## Open Decisions (implementation-time)
- Exact V1 column names can vary by sheet version; confirm from parser utilities before final script.
- If historic batch workflow cannot be reconstructed, migrate historical bills directly as approved records.
