# Station V2 Backfill and Reconciliation Plan

Primary objective: migrate data to Postgres **without changing calculation outputs**.

## Non-Negotiable Safety Rules
- Take a pre-change snapshot before each migration step.
- Run changes in scoped batches (by table and month range).
- Take post-change snapshot and diff against expected deltas.
- Stop immediately on unexpected diffs.

## Execution Phases

### Phase 0: Baseline Capture (V1)
1. Export baseline aggregates from current system:
   - customer count by region
   - bills totals by month (amount, paid, remaining)
   - payments totals by month
   - sample customer ledgers
2. Save baseline artifacts under timestamped snapshot folder.

### Phase 1: Reference Data
1. Insert `regions`, `billing_types`, `monitors`.
2. Verify record counts and key uniqueness.

### Phase 2: Customers
1. Insert `customers` using deterministic lookups for region/monitor/billing type.
2. Verify:
   - unique `customer_number`
   - free-customer flags
   - old totals preserved

### Phase 3: Bills
1. Insert historical `bills` by month.
2. Enforce:
   - one bill per customer+month
   - `remaining_amount = amount - paid_amount`
3. Verify monthly totals match baseline.

### Phase 4: Payments
1. Insert `payments` and resolve bill links where possible.
2. Verify payment totals by month and customer samples.

### Phase 5: Optional Workflow Reconstruction
1. Historical data may be loaded as already approved records.
2. New workflow tables (`billing_batches*`) become active for V2 forward months.

## Reconciliation Checklist (Must Pass)
- Monthly bill totals equal baseline.
- Monthly paid totals equal baseline.
- Monthly remaining totals equal baseline.
- Spot-check at least 20 customer ledgers across regions.
- Confirm formulas from `docs/calculations.md` produce identical results.

## Cutover Readiness Gate
Proceed to dual-read/cutover only after:
- all reconciliation checks pass
- no unresolved mismatches remain
- mismatch report is empty or explicitly accepted by owner
