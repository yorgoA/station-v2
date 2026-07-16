-- 004_record_payment.sql
-- Real payment application: a payment applies to exactly the bill for the
-- (customer, month) it's recorded against. Rejects if the amount exceeds
-- that bill's remaining balance (no customer-credit-balance concept exists
-- yet, so an "overpayment" would just silently vanish otherwise).
--
-- Run manually with psql or paste into the Supabase SQL Editor.

create or replace function record_payment(
  p_customer_id uuid,
  p_month_key text,
  p_amount numeric,
  p_method text,
  p_receipt_image_url text,
  p_notes text,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_bill bills%rowtype;
  v_new_paid numeric;
  v_new_remaining numeric;
  v_new_status text;
  v_payment_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than 0';
  end if;

  select * into v_bill
  from bills
  where customer_id = p_customer_id and month_key = p_month_key
  for update;

  if not found then
    raise exception 'No bill found for this customer in %', p_month_key;
  end if;

  if p_amount > v_bill.remaining_amount then
    raise exception 'Amount % exceeds remaining balance % for %', p_amount, v_bill.remaining_amount, p_month_key;
  end if;

  v_new_paid := v_bill.paid_amount + p_amount;
  v_new_remaining := v_bill.remaining_amount - p_amount;
  v_new_status := case when v_new_remaining <= 0 then 'paid' else 'unpaid' end;

  update bills
  set paid_amount = v_new_paid,
      remaining_amount = v_new_remaining,
      status = v_new_status
  where id = v_bill.id;

  -- payment_date is pinned to the bill's own month (matching the existing convention
  -- elsewhere in the app, e.g. the old submissions flow's `${monthKey}-07`) rather than
  -- today's real date, since every report/filter in the app treats payment_date as the
  -- billing month, not the literal day cash changed hands.
  insert into payments (customer_id, bill_id, amount, payment_date, method, receipt_image_url, recorded_by_user_id, notes)
  values (p_customer_id, v_bill.id, p_amount, (p_month_key || '-07')::date, p_method, p_receipt_image_url, p_actor_user_id, p_notes)
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;
