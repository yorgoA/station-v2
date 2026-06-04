# Station V2 Database

This folder will contain:
- Postgres schema definitions
- SQL migrations
- seed/backfill scripts
- reconciliation checks

## Setup order
1. Apply `schema.sql`
2. Apply `seed.sql` (canonical regions + billing types)

## First target
Define tables for:
- regions
- monitors
- customers
- bills
- payments
- billing_batches
- billing_batch_items
- billing_batch_events
- generator_monthly_readings
