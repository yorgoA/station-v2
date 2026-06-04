-- verify_calculation_parity.sql
-- Run after backfill to validate core financial parity by month and region.
--
-- Optional psql variables:
--   \set month_key '2026-04'
--   \set region_code 'north'

-- 1) Bills financial summary
select
  b.month_key,
  r.code as region_code,
  count(*) as bills_count,
  round(sum(b.amount)::numeric, 2) as total_amount,
  round(sum(b.paid_amount)::numeric, 2) as total_paid,
  round(sum(b.remaining_amount)::numeric, 2) as total_remaining
from bills b
join regions r on r.id = b.region_id
where (:'month_key' is null or b.month_key = :'month_key')
  and (:'region_code' is null or r.code = :'region_code')
group by b.month_key, r.code
order by b.month_key, r.code;

-- 2) Payment summary (cash actually recorded)
select
  to_char(p.payment_date, 'YYYY-MM') as month_key,
  r.code as region_code,
  count(*) as payments_count,
  round(sum(p.amount)::numeric, 2) as total_payments
from payments p
join customers c on c.id = p.customer_id
join regions r on r.id = c.region_id
where (:'month_key' is null or to_char(p.payment_date, 'YYYY-MM') = :'month_key')
  and (:'region_code' is null or r.code = :'region_code')
group by to_char(p.payment_date, 'YYYY-MM'), r.code
order by month_key, r.code;

-- 3) Integrity checks that should return zero rows
-- 3a) Invalid remaining formula
select b.id, b.customer_id, b.month_key, b.amount, b.paid_amount, b.remaining_amount
from bills b
where b.remaining_amount <> (b.amount - b.paid_amount);

-- 3b) Counter monotonicity violations
select b.id, b.customer_id, b.month_key, b.previous_counter, b.new_counter
from bills b
where b.new_counter < b.previous_counter;

-- 3c) Approved batch items missing required image evidence
select bi.id, bi.batch_id, bi.customer_id
from billing_batch_items bi
join billing_batches bb on bb.id = bi.batch_id
where bb.status = 'approved_posted'
  and (bi.counter_image_url is null or btrim(bi.counter_image_url) = '');

-- 4) Loss-analysis rollup (if generator inputs exist)
select
  g.month_key,
  r.code as region_code,
  g.generator_kwh,
  coalesce(sum(b.consumption_kwh), 0) as app_total_kwh,
  (g.generator_kwh - coalesce(sum(b.consumption_kwh), 0)) as kwh_difference,
  case
    when g.generator_kwh > 0
      then round((((g.generator_kwh - coalesce(sum(b.consumption_kwh), 0)) / g.generator_kwh) * 100)::numeric, 2)
    else null
  end as loss_percent
from generator_monthly_readings g
join regions r on r.id = g.region_id
left join bills b
  on b.region_id = g.region_id
 and b.month_key = g.month_key
where (:'month_key' is null or g.month_key = :'month_key')
  and (:'region_code' is null or r.code = :'region_code')
group by g.month_key, r.code, g.generator_kwh
order by g.month_key, r.code;
