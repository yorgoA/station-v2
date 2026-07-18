-- Manual override for the billing-entry month gate.
--
-- The default rule (apps/web/lib/billing/entry-window.ts) opens a month for
-- entry starting on the 27th of that same month. This table lets a manager
-- force a month open early (e.g. a pilot/test run before the 27th) or force
-- it closed even after the 27th. No row for a month = fall back to the
-- default calendar rule.
create table if not exists billing_month_locks (
  month_key text primary key check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  override text not null check (override in ('unlocked', 'locked')),
  updated_by_user_id uuid references app_users(id),
  updated_at timestamptz not null default now()
);

-- set_updated_at() already exists (db/schema.sql) -- reused here, not redefined.
drop trigger if exists trg_set_updated_at_billing_month_locks on billing_month_locks;
create trigger trg_set_updated_at_billing_month_locks
before update on billing_month_locks
for each row execute function set_updated_at();

alter table billing_month_locks enable row level security;
