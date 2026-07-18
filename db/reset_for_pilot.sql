-- Reset business/test data before the August pilot, keeping config intact.
--
-- KEPT (never touched by this script):
--   app_users              -- your 4 real accounts
--   regions                -- mrah / printania
--   billing_types          -- metered / amp-only / both / fixed-monthly
--   ampere_price_tiers     -- current ampere pricing table
--
-- WIPED (all test/demo data accumulated this build-out):
--   customers, monitors, billing_batches (+ its cascaded items/reviews/events),
--   bills, payments, qr_collection_logs, monthly_kwh_tariffs,
--   generator_monthly_readings
--
-- Run this yourself in the Supabase SQL editor (this is a permanent delete --
-- not something to run casually or automate). Everything runs in one
-- transaction, so it either fully applies or fully rolls back.

begin;

-- Three separate immutability triggers protect approved/priced data and must
-- all be disabled for this one operation, then re-enabled immediately after:
--   trg_block_bill_pricing_mutation    on bills             (blocks DELETE outright)
--   trg_block_approved_batch_updates   on billing_batches    (blocks UPDATE/DELETE once approved_posted)
--   trg_block_approved_item_updates    on billing_batch_items(blocks INSERT/UPDATE/DELETE once parent batch is approved_posted)
alter table bills disable trigger trg_block_bill_pricing_mutation;
alter table billing_batches disable trigger trg_block_approved_batch_updates;
alter table billing_batch_items disable trigger trg_block_approved_item_updates;

delete from payments;
delete from bills;
delete from qr_collection_logs;
delete from billing_batches;              -- cascades to billing_batch_items,
                                           -- billing_batch_item_reviews, billing_batch_events
delete from monthly_kwh_tariffs;
delete from generator_monthly_readings;
delete from customers;
delete from monitors;

alter table bills enable trigger trg_block_bill_pricing_mutation;
alter table billing_batches enable trigger trg_block_approved_batch_updates;
alter table billing_batch_items enable trigger trg_block_approved_item_updates;

-- Sanity check: everything above should read 0, app_users should still show your real accounts.
select 'customers' as table_name, count(*) from customers
union all select 'monitors', count(*) from monitors
union all select 'bills', count(*) from bills
union all select 'payments', count(*) from payments
union all select 'billing_batches', count(*) from billing_batches
union all select 'billing_batch_items', count(*) from billing_batch_items
union all select 'qr_collection_logs', count(*) from qr_collection_logs
union all select 'monthly_kwh_tariffs', count(*) from monthly_kwh_tariffs
union all select 'generator_monthly_readings', count(*) from generator_monthly_readings
union all select 'app_users (should stay 4)', count(*) from app_users;

commit;
