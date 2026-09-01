-- 009_fixed_monthly_amount_change_request.sql
-- Lets an employee, while entering a month's billing, flag that a fixed-monthly
-- customer's amount looks wrong and propose a corrected value. The proposal
-- rides along with the batch: the manager sees it during review and approves or
-- rejects it. Approving updates customers.fixed_monthly_amount going forward
-- (the standing value) -- it never rewrites already-approved bills, which keep
-- the amount they were approved with.
--
-- Stored on the batch item so it is scoped to one batch / month / review cycle;
-- a resubmit (changes_requested -> pending_review) clears the decision so the
-- manager re-decides against whatever the current amount is by then.
--
-- Run manually with psql:
--   psql "$DATABASE_URL" -f 009_fixed_monthly_amount_change_request.sql
-- Or paste the contents into the Supabase SQL Editor.

begin;

alter table billing_batch_items
  add column if not exists proposed_fixed_monthly_amount numeric(14,2)
    check (proposed_fixed_monthly_amount is null or proposed_fixed_monthly_amount > 0),
  add column if not exists proposed_fixed_monthly_note text,
  add column if not exists proposed_fixed_monthly_decision text
    check (proposed_fixed_monthly_decision in ('approved', 'rejected'));

commit;
