-- 008_optional_counter_image_flat_billing.sql
-- Billing entry no longer collects a counter reading or a counter photo for
-- flat-charge customers (billing types `fixed-monthly` and `amp-only`): their
-- bill is the same amount every month regardless of the meter. Only
-- consumption-based rows (`metered`, `both`) carry a reading + one photo.
--
-- Effect on this table: `counter_image_url` becomes nullable. It stays
-- effectively required for metered/both items -- enforced in the billing-entry
-- UI and POST /api/billing/submissions, same as before -- but a flat-charge
-- item is now stored with new_counter = previous_counter, consumption_kwh = 0,
-- and counter_image_url = NULL.
--
-- approve_billing_batch() already prices `fixed-monthly` from
-- customers.fixed_monthly_amount and `amp-only` from the ampere tier without
-- touching the counter or the image, so it needs no change. The monthly kWh
-- tariff gate is likewise unchanged.
--
-- Run manually with psql:
--   psql "$DATABASE_URL" -f 008_optional_counter_image_flat_billing.sql
-- Or paste the contents into the Supabase SQL Editor.

begin;

alter table billing_batch_items
  alter column counter_image_url drop not null;

commit;
