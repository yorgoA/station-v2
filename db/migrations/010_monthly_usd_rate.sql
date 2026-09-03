-- 010_monthly_usd_rate.sql
-- Per-month LBP -> USD conversion rate, entered next to the month's kWh tariff.
-- The printed bill shows the total in LBP and its USD equivalent
-- (usd = round(total_lbp / usd_rate, 2)). Optional: NULL = bill prints LBP only.
--
-- Run manually with psql:
--   psql "$DATABASE_URL" -f 010_monthly_usd_rate.sql
-- Or paste the contents into the Supabase SQL Editor.

begin;

alter table monthly_kwh_tariffs
  add column if not exists usd_rate numeric(14,2)
    check (usd_rate is null or usd_rate > 0);

commit;
