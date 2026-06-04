-- Station V2 canonical seed data
-- Purpose: keep backend region/type setup aligned with UI codes.

begin;

-- Canonical regions
insert into regions (code, name, is_active)
values
  ('mrah', 'Mrah Ghanem', true),
  ('printania', 'Printania', true)
on conflict (code)
do update set
  name = excluded.name,
  is_active = excluded.is_active;

-- Canonical billing types
insert into billing_types (key, label, is_active)
values
  ('metered', 'Metered', true),
  ('fixed-monthly', 'Fixed Monthly', true)
on conflict (key)
do update set
  label = excluded.label,
  is_active = excluded.is_active;

commit;
