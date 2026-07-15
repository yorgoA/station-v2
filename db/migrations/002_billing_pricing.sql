-- 002_billing_pricing.sql
-- Real billing calculation engine: DB-backed pricing, price snapshots, bill immutability,
-- and the missing "approve batch -> write priced bills" step.
--
-- Run manually with psql:
--   psql "$DATABASE_URL" -f 002_billing_pricing.sql
-- Or paste the contents into the Supabase SQL Editor.

begin;

-- ==========
-- Customer fields required for real pricing
-- ==========
alter table customers
  add column if not exists subscribed_ampere integer,
  add column if not exists fixed_monthly_amount numeric(14,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'customers_subscribed_ampere_positive'
  ) then
    alter table customers
      add constraint customers_subscribed_ampere_positive
      check (subscribed_ampere is null or subscribed_ampere > 0);
  end if;
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'customers_fixed_monthly_amount_nonneg'
  ) then
    alter table customers
      add constraint customers_fixed_monthly_amount_nonneg
      check (fixed_monthly_amount >= 0);
  end if;
end $$;

-- ==========
-- Pricing reference tables (replace hardcoded TS constants)
-- ==========
create table if not exists ampere_price_tiers (
  id uuid primary key default gen_random_uuid(),
  amp integer not null unique check (amp > 0),
  price numeric(14,2) not null check (price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists monthly_kwh_tariffs (
  month_key text primary key,
  kwh_price numeric(14,2) not null check (kwh_price > 0),
  entered_by_user_id uuid references app_users(id),
  entered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

drop trigger if exists trg_set_updated_at_ampere_price_tiers on ampere_price_tiers;
create trigger trg_set_updated_at_ampere_price_tiers
before update on ampere_price_tiers
for each row execute function set_updated_at();

drop trigger if exists trg_set_updated_at_monthly_kwh_tariffs on monthly_kwh_tariffs;
create trigger trg_set_updated_at_monthly_kwh_tariffs
before update on monthly_kwh_tariffs
for each row execute function set_updated_at();

-- ==========
-- Price snapshot columns (frozen at approval time; never edited after)
-- ==========
alter table billing_batch_items
  add column if not exists ampere_price_snapshot numeric(14,2),
  add column if not exists kwh_price_snapshot numeric(14,2);

alter table bills
  add column if not exists ampere_price_snapshot numeric(14,2),
  add column if not exists kwh_price_snapshot numeric(14,2);

-- ==========
-- Bills immutability: pricing fields are frozen once written.
-- paid_amount / remaining_amount / status remain editable (the payments flow needs this).
-- Deletion is blocked outright.
-- ==========
create or replace function block_bill_pricing_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'bills cannot be deleted';
  end if;

  if tg_op = 'UPDATE' then
    if old.amount is distinct from new.amount
       or old.consumption_kwh is distinct from new.consumption_kwh
       or old.previous_counter is distinct from new.previous_counter
       or old.new_counter is distinct from new.new_counter
       or old.ampere_price_snapshot is distinct from new.ampere_price_snapshot
       or old.kwh_price_snapshot is distinct from new.kwh_price_snapshot
    then
      raise exception 'bill pricing fields are immutable once set; only paid_amount/remaining_amount/status may change';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_block_bill_pricing_mutation on bills;
create trigger trg_block_bill_pricing_mutation
before update or delete on bills
for each row execute function block_bill_pricing_mutation();

-- ==========
-- Ampere tier lookup: exact match, else highest tier at or below the given amp,
-- else the smallest tier available (mirrors apps/web/lib/reports/calculations.ts exactly).
-- ==========
create or replace function get_ampere_price(p_amp integer)
returns numeric
language plpgsql
as $$
declare
  v_price numeric;
begin
  select price into v_price from ampere_price_tiers where amp = p_amp;
  if v_price is not null then
    return v_price;
  end if;

  select price into v_price
  from ampere_price_tiers
  where amp <= p_amp
  order by amp desc
  limit 1;
  if v_price is not null then
    return v_price;
  end if;

  select price into v_price from ampere_price_tiers order by amp asc limit 1;
  return v_price;
end;
$$;

-- ==========
-- The missing step: approve a pending_review batch, compute real priced bills,
-- snapshot the prices used, and transition the batch atomically.
-- Raises (and rolls back everything) if the month's kWh price hasn't been set yet,
-- or if any line item can't be priced (missing ampere tier data, unknown billing type).
-- ==========
create or replace function approve_billing_batch(p_batch_id uuid, p_actor_user_id uuid)
returns void
language plpgsql
as $$
declare
  v_batch billing_batches%rowtype;
  v_kwh_price numeric;
  v_item record;
  v_billing_type_key text;
  v_ampere_price numeric;
  v_amount numeric;
  v_ampere_snapshot numeric;
  v_kwh_snapshot numeric;
begin
  select * into v_batch from billing_batches where id = p_batch_id for update;
  if not found then
    raise exception 'Batch % not found', p_batch_id;
  end if;
  if v_batch.status <> 'pending_review' then
    raise exception 'Batch % is % and cannot be approved (must be pending_review)', p_batch_id, v_batch.status;
  end if;

  select kwh_price into v_kwh_price
  from monthly_kwh_tariffs
  where month_key = v_batch.month_key;
  if v_kwh_price is null then
    raise exception 'No kWh price set for month %; set it in Settings before approving', v_batch.month_key;
  end if;

  for v_item in
    select
      bbi.id,
      bbi.customer_id,
      bbi.previous_counter,
      bbi.new_counter,
      bbi.consumption_kwh,
      bbi.is_free_customer_snapshot,
      bbi.billing_type_id_snapshot,
      c.subscribed_ampere,
      c.fixed_monthly_amount
    from billing_batch_items bbi
    join customers c on c.id = bbi.customer_id
    where bbi.batch_id = p_batch_id
  loop
    select key into v_billing_type_key from billing_types where id = v_item.billing_type_id_snapshot;
    if v_billing_type_key is null then
      raise exception 'Item % has no resolvable billing type', v_item.id;
    end if;

    v_ampere_snapshot := null;
    v_kwh_snapshot := null;

    if v_item.is_free_customer_snapshot then
      v_amount := 0;
    elsif v_billing_type_key = 'metered' then
      v_kwh_snapshot := v_kwh_price;
      v_amount := v_item.consumption_kwh * v_kwh_price;
    elsif v_billing_type_key = 'amp-only' then
      if v_item.subscribed_ampere is null then
        raise exception 'Customer % has no subscribed_ampere for amp-only billing (item %)', v_item.customer_id, v_item.id;
      end if;
      v_ampere_price := get_ampere_price(v_item.subscribed_ampere);
      if v_ampere_price is null then
        raise exception 'No ampere price tiers configured; cannot price item %', v_item.id;
      end if;
      v_ampere_snapshot := v_ampere_price;
      v_amount := v_ampere_price;
    elsif v_billing_type_key = 'both' then
      if v_item.subscribed_ampere is null then
        raise exception 'Customer % has no subscribed_ampere for combined billing (item %)', v_item.customer_id, v_item.id;
      end if;
      v_ampere_price := get_ampere_price(v_item.subscribed_ampere);
      if v_ampere_price is null then
        raise exception 'No ampere price tiers configured; cannot price item %', v_item.id;
      end if;
      v_ampere_snapshot := v_ampere_price;
      v_kwh_snapshot := v_kwh_price;
      v_amount := v_ampere_price + v_item.consumption_kwh * v_kwh_price;
    elsif v_billing_type_key = 'fixed-monthly' then
      v_amount := coalesce(v_item.fixed_monthly_amount, 0);
    else
      raise exception 'Unknown billing type % for item %', v_billing_type_key, v_item.id;
    end if;

    if v_amount is null or v_amount < 0 then
      raise exception 'Computed an invalid amount for item %', v_item.id;
    end if;

    update billing_batch_items
    set ampere_price_snapshot = v_ampere_snapshot,
        kwh_price_snapshot = v_kwh_snapshot
    where id = v_item.id;

    insert into bills (
      customer_id, month_key, region_id, billing_batch_id,
      previous_counter, new_counter, consumption_kwh,
      amount, paid_amount, remaining_amount, status,
      ampere_price_snapshot, kwh_price_snapshot
    )
    values (
      v_item.customer_id, v_batch.month_key, v_batch.region_id, v_batch.id,
      v_item.previous_counter, v_item.new_counter, v_item.consumption_kwh,
      v_amount, 0, v_amount, 'unpaid',
      v_ampere_snapshot, v_kwh_snapshot
    );
  end loop;

  update billing_batches
  set status = 'approved_posted',
      reviewed_by_user_id = p_actor_user_id,
      reviewed_at = now()
  where id = p_batch_id;

  insert into billing_batch_events (batch_id, from_status, to_status, actor_user_id, note)
  values (p_batch_id, 'pending_review', 'approved_posted', p_actor_user_id, 'Approved via approve_billing_batch()');
end;
$$;

commit;
