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
  ('amp-only', 'Ampere Only', true),
  ('both', 'Ampere + Metered', true),
  ('fixed-monthly', 'Fixed Monthly', true)
on conflict (key)
do update set
  label = excluded.label,
  is_active = excluded.is_active;

-- Starting ampere price tiers (business reference config, not customer data).
-- Manager can edit these afterward via Settings -> Pricing; edits never affect
-- already-approved bills, which carry their own frozen price snapshot.
insert into ampere_price_tiers (amp, price)
values
  (3, 231000), (4, 308000), (5, 385000), (6, 462000), (7, 539000),
  (10, 685000), (15, 985000), (16, 1062000), (20, 1285000), (25, 1585000),
  (30, 1885000), (32, 2039000), (40, 2485000), (48, 3016000), (60, 3685000),
  (63, 3865000), (75, 4585000), (120, 7285000), (150, 9085000), (180, 10885000)
on conflict (amp)
do update set
  price = excluded.price;

commit;
