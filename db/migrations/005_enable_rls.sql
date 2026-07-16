-- 005_enable_rls.sql
-- Locks down every public table so the anon/publishable key -- which is,
-- by design, embedded in every browser bundle and effectively public --
-- can't read or write anything directly via Supabase's auto-generated
-- REST API, bypassing the app (and its requireRole() guard) entirely.
--
-- No policies are added because none are needed: every use of the public
-- key in apps/web is for Supabase Auth only (sign in / get user / sign
-- out) -- confirmed by grepping every createSupabasePublicClient() call
-- site -- never a direct table query. All real data access goes through
-- Next.js API routes using the service-role key, which always bypasses
-- RLS regardless of policies. So "RLS enabled, zero policies" is a
-- complete default-deny for anon/authenticated with no loss of app
-- functionality.
--
-- Run manually with psql or paste into the Supabase SQL Editor.

alter table regions enable row level security;
alter table monitors enable row level security;
alter table billing_types enable row level security;
alter table app_users enable row level security;
alter table ampere_price_tiers enable row level security;
alter table monthly_kwh_tariffs enable row level security;
alter table customers enable row level security;
alter table billing_batches enable row level security;
alter table billing_batch_items enable row level security;
alter table billing_batch_item_reviews enable row level security;
alter table billing_batch_events enable row level security;
alter table bills enable row level security;
alter table payments enable row level security;
alter table qr_collection_logs enable row level security;
alter table generator_monthly_readings enable row level security;
