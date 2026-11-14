-- B8 (Phase 15): the payment method, shown on the confirmation and the order (Customer-Payment,
-- Customer-Confirmed, Customer-Orders). Midtrans names it in the notification it signs (payment_type:
-- "bank_transfer", "qris", "gopay", "credit_card", ...; https://docs.midtrans.com/docs/https-notification-webhooks).
-- The webhook passes it to apply_payment_result() as a new last argument with a default, so a call
-- without it still works; it is kept only when the order becomes paid, and a repeated notification
-- changes nothing (as before). The old three-argument function is dropped, or a three-argument call
-- would be ambiguous, and made again with its grant (service_role only); its body is as in
-- 20261028090000_payment_results.sql plus the method.
-- my_orders() and admin_order_detail() return it (payment_type); their bodies are as in
-- 20261114140000_customer_note.sql plus o.payment_type.
-- Choosing the method before Snap (enabled_payments) is not part of this migration.

alter table public.orders
  add column payment_type text check (payment_type is null or payment_type ~ '^[a-z][a-z0-9_]{0,31}$');

comment on column public.orders.payment_type is
  'How the customer paid, as Midtrans names it (bank_transfer, qris, ...), from the signed notification (B8).';

drop function public.apply_payment_result(uuid, public.order_status, integer);

create function public.apply_payment_result(
  p_order uuid,
  p_status public.order_status,
  p_amount integer,
  p_payment_type text default null
)
returns public.order_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  -- Midtrans' own form only ("bank_transfer", "qris"); anything else is dropped, never refused:
  -- refusing would make Midtrans retry a payment that did arrive.
  v_type text := case when p_payment_type ~ '^[a-z][a-z0-9_]{0,31}$' then p_payment_type end;
begin
  if p_status is null or p_status not in ('paid', 'failed', 'cancelled') then
    raise exception 'status_invalid';
  end if;

  select o.status, o.price_idr, o.slot_id into v_order
  from public.orders as o
  where o.id = p_order
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.price_idr is distinct from p_amount then
    raise exception 'amount_mismatch';
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

drop function public.my_orders();

create function public.my_orders()
returns table (
  order_id uuid,
  service_id text,
  area_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  address text,
  contact_phone text,
  price_idr integer,
  status public.order_status,
  created_at timestamptz,
  cleaner_name text,
  cleaner_photo_url text,
  checked_in_at timestamptz,
  completed_at timestamptz,
  recording_id uuid,
  recording_expires_at timestamptz,
  recording_deleted boolean,
  order_code text,
  assigned_at timestamptz,
  customer_note text,
  payment_type text
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.service_id, o.area_id, o.starts_at, o.ends_at, o.address, o.contact_phone, o.price_idr,
    o.status, o.created_at, c.full_name, c.photo_url, o.checked_in_at, o.completed_at,
    r.id, r.expires_at, r.deleted_at is not null, o.code, o.assigned_at, o.customer_note, o.payment_type
  from public.orders as o
  left join public.cleaners as c on c.user_id = o.cleaner_id
  left join public.recordings as r on r.order_id = o.id
  where o.customer_id = (select auth.uid())
  order by o.created_at desc;
$$;

drop function public.admin_order_detail(uuid);

create function public.admin_order_detail(p_order uuid)
returns table (
  order_id uuid,
  order_code text,
  status public.order_status,
  service_id text,
  area_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  address text,
  contact_phone text,
  customer_name text,
  agency_id uuid,
  agency_name text,
  cleaner_id uuid,
  cleaner_name text,
  price_idr integer,
  agency_fee_idr integer,
  homeklin_income_idr integer,
  agency_fee_final boolean,
  created_at timestamptz,
  paid_at timestamptz,
  assigned_at timestamptz,
  checked_in_at timestamptz,
  completed_at timestamptz,
  stream_status public.stream_status,
  stream_updated_at timestamptz,
  customer_note text,
  payment_type text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
    select o.id, o.code, o.status, o.service_id, o.area_id, o.starts_at, o.ends_at, o.address, o.contact_phone,
      p.full_name, a.id, a.name, o.cleaner_id, c.full_name, o.price_idr,
      fee.amount, o.price_idr - fee.amount, f.order_id is not null,
      o.created_at, case when o.status = 'paid' then o.payment_result_at end,
      o.assigned_at, o.checked_in_at, o.completed_at, s.status, s.updated_at, o.customer_note, o.payment_type
    from public.orders as o
    join public.agencies as a on a.id = o.agency_id
    left join public.profiles as p on p.id = o.customer_id
    left join public.cleaners as c on c.user_id = o.cleaner_id
    left join public.order_fees as f on f.order_id = o.id
    left join public.stream_sessions as s on s.order_id = o.id
    cross join lateral (
      select coalesce(f.fee_idr, round(o.price_idr * a.payout_percent / 100.0)::integer) as amount
    ) as fee
    where o.id = p_order;

  if not found then
    raise exception 'order_not_found';
  end if;
end;
$$;

revoke all on function public.apply_payment_result(uuid, public.order_status, integer, text) from public, anon, authenticated;
grant execute on function public.apply_payment_result(uuid, public.order_status, integer, text) to service_role;
revoke all on function public.my_orders() from public, anon;
revoke all on function public.admin_order_detail(uuid) from public, anon;
grant execute on function public.my_orders() to authenticated;
grant execute on function public.admin_order_detail(uuid) to authenticated;
