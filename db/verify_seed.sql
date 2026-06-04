-- Station V2 seed verification checks
-- Run after schema.sql + seed.sql
-- Returns PASS/FAIL rows for required canonical setup.

with checks as (
  select
    'regions_has_mrah'::text as check_name,
    exists (select 1 from regions where code = 'mrah') as is_ok
  union all
  select
    'regions_has_printania',
    exists (select 1 from regions where code = 'printania')
  union all
  select
    'billing_types_has_metered',
    exists (select 1 from billing_types where key = 'metered')
  union all
  select
    'billing_types_has_fixed_monthly',
    exists (select 1 from billing_types where key = 'fixed-monthly')
)
select
  check_name,
  case when is_ok then 'PASS' else 'FAIL' end as status
from checks
order by check_name;
