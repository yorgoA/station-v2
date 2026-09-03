-- 011_qr_collection_expected_amount.sql
-- Records what the customer's bill actually was at scan time, next to what the
-- collector says he collected. The collector's screen prefills the collected
-- amount with this; if the customer paid only part of it, the collector lowers
-- the collected amount and the employee sees both figures side by side on
-- /employee/review-qr.
--
-- Run manually with psql:
--   psql "$DATABASE_URL" -f 011_qr_collection_expected_amount.sql
-- Or paste the contents into the Supabase SQL Editor.

begin;

alter table qr_collection_logs
  add column if not exists expected_amount numeric(14,2)
    check (expected_amount is null or expected_amount >= 0);

commit;
