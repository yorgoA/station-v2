-- Station V2 Postgres schema (draft v1)
-- Goal: preserve V1 billing logic while enabling cleaner workflows.

create extension if not exists "pgcrypto";

-- ==========
-- Enums
-- ==========
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('manager', 'employee');
  end if;
  if not exists (select 1 from pg_type where typname = 'billing_batch_status') then
    create type billing_batch_status as enum (
      'draft',
      'pending_review',
      'changes_requested',
      'approved_posted'
    );
  end if;
end $$;

-- ==========
-- Core reference tables
-- ==========
create table if not exists regions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists monitors (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references regions(id) on delete restrict,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (region_id, name)
);

create table if not exists billing_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  role user_role not null,
  display_name text not null,
  email text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ==========
-- Customers
-- ==========
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  customer_number text not null unique,
  full_name text not null,
  region_id uuid not null references regions(id) on delete restrict,
  monitor_id uuid references monitors(id) on delete set null,
  billing_type_id uuid references billing_types(id) on delete set null,
  box_number text,
  building text,
  phone text,
  is_free_customer boolean not null default false,
  status text not null default 'active',
  old_total_amount numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customers_region on customers(region_id);
create index if not exists idx_customers_status on customers(status);
create index if not exists idx_customers_billing_type on customers(billing_type_id);

-- ==========
-- Billing workflow (draft -> review -> approved)
-- ==========
create table if not exists billing_batches (
  id uuid primary key default gen_random_uuid(),
  month_key text not null, -- format: YYYY-MM
  region_id uuid not null references regions(id) on delete restrict,
  status billing_batch_status not null default 'draft',
  submitted_by_user_id uuid references app_users(id),
  submitted_at timestamptz,
  reviewed_by_user_id uuid references app_users(id),
  reviewed_at timestamptz,
  manager_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  unique (month_key, region_id)
);

create index if not exists idx_billing_batches_month_region on billing_batches(month_key, region_id);
create index if not exists idx_billing_batches_status on billing_batches(status);

create table if not exists billing_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references billing_batches(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete restrict,
  previous_counter numeric(14,3) not null,
  new_counter numeric(14,3) not null,
  consumption_kwh numeric(14,3) not null,
  calculated_amount numeric(14,2) not null,
  billing_type_id_snapshot uuid references billing_types(id) on delete set null,
  monitor_id_snapshot uuid references monitors(id) on delete set null,
  is_free_customer_snapshot boolean not null default false,
  counter_image_url text not null, -- exactly 1 required image per item
  counter_image_uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (new_counter >= previous_counter),
  check (consumption_kwh >= 0),
  unique (batch_id, customer_id)
);

create index if not exists idx_billing_items_batch on billing_batch_items(batch_id);
create index if not exists idx_billing_items_customer on billing_batch_items(customer_id);

create table if not exists billing_batch_item_reviews (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references billing_batches(id) on delete cascade,
  batch_item_id uuid not null references billing_batch_items(id) on delete cascade,
  decision text not null check (decision in ('approved', 'changes_needed')),
  note text,
  actor_user_id uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_item_id)
);

create index if not exists idx_batch_item_reviews_batch on billing_batch_item_reviews(batch_id);
create index if not exists idx_batch_item_reviews_decision on billing_batch_item_reviews(decision);

create table if not exists billing_batch_events (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references billing_batches(id) on delete cascade,
  from_status billing_batch_status,
  to_status billing_batch_status not null,
  actor_user_id uuid references app_users(id),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_billing_events_batch on billing_batch_events(batch_id, created_at);

-- ==========
-- Final approved billing and payments
-- ==========
create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete restrict,
  month_key text not null,
  region_id uuid not null references regions(id) on delete restrict,
  billing_batch_id uuid references billing_batches(id) on delete set null,
  previous_counter numeric(14,3) not null,
  new_counter numeric(14,3) not null,
  consumption_kwh numeric(14,3) not null,
  amount numeric(14,2) not null,
  paid_amount numeric(14,2) not null default 0,
  remaining_amount numeric(14,2) not null,
  status text not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  check (new_counter >= previous_counter),
  check (consumption_kwh >= 0),
  check (amount >= 0),
  check (paid_amount >= 0),
  check (remaining_amount = amount - paid_amount),
  unique (customer_id, month_key)
);

create index if not exists idx_bills_month_region on bills(month_key, region_id);
create index if not exists idx_bills_customer on bills(customer_id, month_key);
create index if not exists idx_bills_status on bills(status);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete restrict,
  bill_id uuid references bills(id) on delete set null,
  amount numeric(14,2) not null,
  payment_date date not null,
  method text,
  receipt_image_url text,
  recorded_by_user_id uuid references app_users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount > 0)
);

create index if not exists idx_payments_customer_date on payments(customer_id, payment_date);
create index if not exists idx_payments_bill on payments(bill_id);

-- ==========
-- Collector scan handover logs (pending -> validated)
-- ==========
create table if not exists qr_collection_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete restrict,
  customer_number text not null,
  customer_name text not null,
  region_id uuid not null references regions(id) on delete restrict,
  month_key text not null,
  collected_amount numeric(14,2) not null check (collected_amount > 0),
  currency text not null default 'LBP',
  status text not null default 'pending_employee_validation',
  bill_scan_image_name text,
  employee_receipt_image_name text,
  modification_reason text,
  modified_by_employee boolean not null default false,
  validated_by_employee_at timestamptz,
  scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

create index if not exists idx_qr_logs_status_scanned_at on qr_collection_logs(status, scanned_at desc);
create index if not exists idx_qr_logs_month_region on qr_collection_logs(month_key, region_id);

-- ==========
-- Generator monthly readings for loss analysis
-- ==========
create table if not exists generator_monthly_readings (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  region_id uuid not null references regions(id) on delete restrict,
  generator_kwh numeric(14,3) not null check (generator_kwh > 0),
  entered_by_user_id uuid references app_users(id),
  entered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  unique (month_key, region_id)
);

create index if not exists idx_generator_readings_month_region
  on generator_monthly_readings(month_key, region_id);

-- ==========
-- Transition + immutability safety
-- ==========
create or replace function validate_billing_batch_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    -- allowed transitions only
    if not (
      (old.status = 'draft' and new.status = 'pending_review') or
      (old.status = 'pending_review' and new.status = 'changes_requested') or
      (old.status = 'changes_requested' and new.status = 'pending_review') or
      (old.status = 'pending_review' and new.status = 'approved_posted')
    ) then
      raise exception 'Invalid billing batch transition: % -> %', old.status, new.status;
    end if;

    -- manager note required on rejection
    if old.status = 'pending_review'
       and new.status = 'changes_requested'
       and (new.manager_note is null or btrim(new.manager_note) = '') then
      raise exception 'manager_note is required when requesting changes';
    end if;

    -- review metadata required when manager acts
    if old.status = 'pending_review'
       and new.status in ('changes_requested', 'approved_posted')
       and (new.reviewed_by_user_id is null or new.reviewed_at is null) then
      raise exception 'reviewed_by_user_id and reviewed_at are required for manager decisions';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_billing_batch_transition on billing_batches;
create trigger trg_validate_billing_batch_transition
before update on billing_batches
for each row execute function validate_billing_batch_transition();

-- Lock approved batches and their items from updates/deletes.
create or replace function block_approved_batch_mutation()
returns trigger
language plpgsql
as $$
declare
  target_status billing_batch_status;
begin
  -- billing_batches guard
  if tg_table_name = 'billing_batches' then
    if tg_op in ('UPDATE', 'DELETE') and old.status = 'approved_posted' then
      raise exception 'approved_posted batches are immutable';
    end if;
    if tg_op = 'UPDATE' then
      return new;
    end if;
    return old;
  end if;

  -- billing_batch_items guard (block insert/update/delete against approved batches)
  if tg_op = 'INSERT' then
    select status into target_status from billing_batches where id = new.batch_id;
  else
    select status into target_status from billing_batches where id = old.batch_id;
  end if;

  if target_status = 'approved_posted' then
    raise exception 'items in approved_posted batch are immutable';
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    return new;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_block_approved_batch_updates on billing_batches;
create trigger trg_block_approved_batch_updates
before update or delete on billing_batches
for each row execute function block_approved_batch_mutation();

drop trigger if exists trg_block_approved_item_updates on billing_batch_items;
create trigger trg_block_approved_item_updates
before insert or update or delete on billing_batch_items
for each row execute function block_approved_batch_mutation();

-- Keep updated_at maintained centrally.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_regions on regions;
create trigger trg_set_updated_at_regions
before update on regions
for each row execute function set_updated_at();

drop trigger if exists trg_set_updated_at_monitors on monitors;
create trigger trg_set_updated_at_monitors
before update on monitors
for each row execute function set_updated_at();

drop trigger if exists trg_set_updated_at_billing_types on billing_types;
create trigger trg_set_updated_at_billing_types
before update on billing_types
for each row execute function set_updated_at();

drop trigger if exists trg_set_updated_at_app_users on app_users;
create trigger trg_set_updated_at_app_users
before update on app_users
for each row execute function set_updated_at();

drop trigger if exists trg_set_updated_at_customers on customers;
create trigger trg_set_updated_at_customers
before update on customers
for each row execute function set_updated_at();

drop trigger if exists trg_set_updated_at_billing_batches on billing_batches;
create trigger trg_set_updated_at_billing_batches
before update on billing_batches
for each row execute function set_updated_at();

drop trigger if exists trg_set_updated_at_billing_batch_items on billing_batch_items;
create trigger trg_set_updated_at_billing_batch_items
before update on billing_batch_items
for each row execute function set_updated_at();

drop trigger if exists trg_set_updated_at_billing_batch_item_reviews on billing_batch_item_reviews;
create trigger trg_set_updated_at_billing_batch_item_reviews
before update on billing_batch_item_reviews
for each row execute function set_updated_at();

drop trigger if exists trg_set_updated_at_bills on bills;
create trigger trg_set_updated_at_bills
before update on bills
for each row execute function set_updated_at();

drop trigger if exists trg_set_updated_at_payments on payments;
create trigger trg_set_updated_at_payments
before update on payments
for each row execute function set_updated_at();

drop trigger if exists trg_set_updated_at_generator_monthly_readings on generator_monthly_readings;
create trigger trg_set_updated_at_generator_monthly_readings
before update on generator_monthly_readings
for each row execute function set_updated_at();

drop trigger if exists trg_set_updated_at_qr_collection_logs on qr_collection_logs;
create trigger trg_set_updated_at_qr_collection_logs
before update on qr_collection_logs
for each row execute function set_updated_at();
