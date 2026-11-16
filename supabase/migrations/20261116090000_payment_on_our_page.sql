-- Payment on HomeKlin's own page (replaces the Snap redirect of T10). The customer chooses QRIS, a bank's
-- virtual account or a card on HomeKlin's payment step, and the server asks Midtrans' Core API (Sandbox)
-- to charge that one method (https://docs.midtrans.com/reference/core-api-overview). What Midtrans
-- answers (the virtual account number, the QR code, the expiry) is kept on the order so a reload shows
-- the same instructions. Whether the payment succeeded is still decided only by Midtrans' signed
-- notification (T11), never by the browser.
--
-- One order can be charged again when the customer changes method: every try is an "attempt", and
-- Midtrans knows it as "<order id>_<attempt>" (an order id can be used only once at Midtrans). An
-- order paid or charged before this migration has attempt 0 and Midtrans id "<order id>" (the Snap
-- transaction). A notification about an older attempt can no longer fail or cancel the order (it is
-- usually our own cancellation of the method the customer left), but money for any attempt still counts.

alter table public.orders
  add column payment_attempt integer not null default 0 check (payment_attempt >= 0),
  add column payment_details jsonb check (payment_details is null or (
    jsonb_typeof(payment_details) = 'object' and payment_details ->> 'method' in ('qris', 'bank', 'card')
  ));

comment on column public.orders.payment_attempt is
  'How many times the customer has been charged or has changed method; Midtrans'' order id is "<id>_<attempt>" from attempt 1.';
comment on column public.orders.payment_details is
  'What the customer needs to pay with the current attempt (virtual account number, QR code link, expiry), from Midtrans'' answer.';

-- The state of the customer's own order's payment, or nothing for anyone else.
create function public.order_payment_state(p_order uuid)
returns table (payment_attempt integer, payment_details jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select o.payment_attempt, o.payment_details
  from public.orders as o
  where o.id = p_order and o.customer_id = (select auth.uid());
$$;

-- Opens a new attempt on the customer's own order while it waits for payment, and forgets the details of
-- the one before (the server then cancels that one at Midtrans). Refusals: order_not_payable (not theirs
-- or not waiting for payment), attempts_exhausted (10 per order: each one is a call to Midtrans).
-- previous_charge says whether the attempt before had made a charge at Midtrans (its details, or the old
-- Snap link), so there is something to cancel.
create function public.begin_payment_attempt(p_order uuid)
returns table (attempt integer, previous_attempt integer, previous_charge boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
begin
  select o.payment_attempt, o.payment_details, o.payment_url into v_order
  from public.orders as o
  where o.id = p_order and o.customer_id = (select auth.uid()) and o.status = 'pending_payment'
  for update;

  if not found then
    raise exception 'order_not_payable';
  end if;
  if v_order.payment_attempt >= 10 then
    raise exception 'attempts_exhausted';
  end if;

  update public.orders
  set payment_attempt = v_order.payment_attempt + 1, payment_details = null, payment_started_at = now()
  where id = p_order;

  return query select v_order.payment_attempt + 1, v_order.payment_attempt,
    (v_order.payment_details is not null or v_order.payment_url is not null);
end;
$$;

-- Keeps what Midtrans answered for the attempt just opened (only while it is still the current one and
-- has no details yet). Refusals: order_not_payable, details_invalid.
create function public.attach_payment_details(p_order uuid, p_attempt integer, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_details is null or jsonb_typeof(p_details) <> 'object' or p_details ->> 'method' not in ('qris', 'bank', 'card') then
    raise exception 'details_invalid';
  end if;

  update public.orders
  set payment_details = p_details
  where id = p_order
    and customer_id = (select auth.uid())
    and status = 'pending_payment'
    and payment_attempt = p_attempt
    and payment_details is null;

  if not found then
    raise exception 'order_not_payable';
  end if;
end;
$$;

-- As in 20261114190000_payment_method.sql, plus p_attempt (the attempt the notification is about,
-- 0 for a legacy Snap transaction): a failed or cancelled verdict about an attempt older than the
-- order's current one changes nothing. Paid is accepted from any attempt, because the money arrived.
drop function public.apply_payment_result(uuid, public.order_status, integer, text);

create function public.apply_payment_result(
  p_order uuid,
  p_status public.order_status,
  p_amount integer,
  p_payment_type text default null,
  p_attempt integer default 0
)
returns public.order_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_type text := case when p_payment_type ~ '^[a-z][a-z0-9_]{0,31}$' then p_payment_type end;
begin
  if p_status is null or p_status not in ('paid', 'failed', 'cancelled') then
    raise exception 'status_invalid';
  end if;

  select o.status, o.price_idr, o.slot_id, o.payment_attempt into v_order
  from public.orders as o
  where o.id = p_order
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.price_idr is distinct from p_amount then
    raise exception 'amount_mismatch';
  end if;

  if p_status <> 'paid' and coalesce(p_attempt, 0) < v_order.payment_attempt then
    return v_order.status;
  end if;

  if v_order.status = 'pending_payment' then
    update public.orders
    set status = p_status, payment_result_at = now(),
        payment_type = case when p_status = 'paid' then v_type end
    where id = p_order;

    if p_status in ('failed', 'cancelled') then
      update public.availability_slots
      set booked = booked - 1
      where id = v_order.slot_id and booked > 0;
    end if;

    return p_status;
  end if;

  if p_status = 'paid' and v_order.status in ('failed', 'cancelled') then
    update public.availability_slots
    set booked = booked + 1
    where id = v_order.slot_id and booked < capacity;

    if found then
      update public.orders
      set status = 'paid', payment_result_at = now(), payment_type = v_type
      where id = p_order;
      return 'paid';
    end if;
  end if;

  return v_order.status;
end;
$$;

revoke all on function public.order_payment_state(uuid) from public, anon;
revoke all on function public.begin_payment_attempt(uuid) from public, anon;
revoke all on function public.attach_payment_details(uuid, integer, jsonb) from public, anon;
revoke all on function public.apply_payment_result(uuid, public.order_status, integer, text, integer) from public, anon, authenticated;
grant execute on function public.order_payment_state(uuid) to authenticated;
grant execute on function public.begin_payment_attempt(uuid) to authenticated;
grant execute on function public.attach_payment_details(uuid, integer, jsonb) to authenticated;
grant execute on function public.apply_payment_result(uuid, public.order_status, integer, text, integer) to service_role;
