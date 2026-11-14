-- B2 (Phase 15): admin's read of one order, for the Admin-Order and Admin-Order-Issue screens. One
-- row: the service, the window, the area and address; the customer's name (profiles) and the phone the
-- customer gave for the job (orders.contact_phone); the agency and the cleaner; the price split into the
-- agency's fee and HomeKlin's income (the real fee from order_fees after check-out, before that the
-- expected one, as in agency_jobs, 20261114120000_agency_fee_expected.sql: they always add up to the
-- price); the status times; and the live stream's state with its last change (stream_sessions).
-- Any status is read, not only paid orders, so admin can look into an unpaid or cancelled one; paid_at
-- is the time the paid result arrived (payment_result_at), empty for an order that is not paid.
-- No customer e-mail: the screens do not need it. Refusals: not_admin, order_not_found.

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
  stream_updated_at timestamptz
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
      o.assigned_at, o.checked_in_at, o.completed_at, s.status, s.updated_at
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

revoke all on function public.admin_order_detail(uuid) from public, anon;
grant execute on function public.admin_order_detail(uuid) to authenticated;
