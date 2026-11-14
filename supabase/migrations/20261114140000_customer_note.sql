-- B7 (Phase 15): the customer's note for the cleaner, given with the booking ("the key is at the guard
-- post"). orders.customer_note holds 0 to 300 characters, trimmed; empty when there is none (also on
-- every older order).
-- book_slot() takes it as a new last argument p_note with a default, so a call without it (the booking
-- form until the redesign adds the field) still books. Adding an argument makes a new function, and the
-- old six-argument one would then make a six-argument call ambiguous, so the old one is dropped and the
-- new one made with the grants. Its body is as in 20261105090000_security_fixes.sql plus the note: the
-- note is checked with the other fields before any place is taken (note_invalid), and the race-safe
-- place-taking (one guarded update with skip locked) is unchanged.
-- The note is read by the customer (my_orders), the assigned cleaner (my_jobs), the agency the job is
-- routed to (agency_jobs) and admin (admin_order_detail), on the same rows as before. Their return
-- types change, so they are dropped and made again with their grants, the bodies as in
-- 20261114110000_assigned_time.sql, 20261114100000_order_code_everywhere.sql,
-- 20261114120000_agency_fee_expected.sql and 20261114130000_admin_order_detail.sql plus o.customer_note.

alter table public.orders
  add column customer_note text not null default ''
    check (char_length(customer_note) <= 300);

comment on column public.orders.customer_note is
  'The customer''s note for the cleaner, 0 to 300 characters (B7). Read by the customer, the assigned cleaner, the agency and admin.';

drop function public.book_slot(text, text, timestamptz, text, text, boolean);

create function public.book_slot(
  p_service text,
  p_area text,
  p_starts_at timestamptz,
  p_address text,
  p_phone text,
  p_consent boolean,
  p_note text default ''
)
returns table (
  order_id uuid,
  service_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  price_idr integer,
  status public.order_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid := (select auth.uid());
  v_price integer;
  v_slot record;
  v_order uuid;
  v_address text := btrim(coalesce(p_address, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_note text := btrim(coalesce(p_note, ''));
begin
  if v_customer is null or not exists (
    select 1 from public.profiles where id = v_customer and role = 'customer'
  ) then
    raise exception 'not_customer' using errcode = '42501';
  end if;

  if p_consent is not true then
    raise exception 'consent_required';
  end if;

  if char_length(v_address) not between 10 and 300 then
    raise exception 'address_invalid';
  end if;

  if v_phone !~ '^\+628[0-9]{7,11}$' then
    raise exception 'phone_invalid';
  end if;

  -- B7: checked before any place is taken, so a refused note books nothing.
  if char_length(v_note) > 300 then
    raise exception 'note_invalid';
  end if;

  -- T34 (M2): free the places of orders nobody paid for, then allow at most 3 unpaid orders each.
  perform public.release_unpaid_orders();
  if (select count(*) from public.orders as unpaid where unpaid.customer_id = v_customer and unpaid.status = 'pending_payment') >= 3 then
    raise exception 'too_many_unpaid';
  end if;

  select service.price_idr into v_price
  from public.services as service
  where service.id = p_service and service.is_active;
  if v_price is null then
    raise exception 'service_unavailable';
  end if;

  update public.availability_slots as slot
  set booked = slot.booked + 1
  where slot.id = (
      select candidate.id
      from public.availability_slots as candidate
      join public.agencies as agency on agency.id = candidate.agency_id
      where candidate.area_id = p_area
        and candidate.starts_at = p_starts_at
        and candidate.starts_at > now()
        and candidate.booked < candidate.capacity
        and agency.status = 'active'
      order by candidate.booked::numeric / candidate.capacity, random()
      limit 1
      for update of candidate skip locked
    )
    and slot.booked < slot.capacity
  returning slot.id, slot.agency_id, slot.ends_at into v_slot;

  if v_slot.id is null then
    raise exception 'slot_unavailable';
  end if;

  insert into public.orders
    (customer_id, service_id, area_id, agency_id, slot_id, starts_at, ends_at, address, contact_phone, price_idr, stream_consent, customer_note)
  values
    (v_customer, p_service, p_area, v_slot.agency_id, v_slot.id, p_starts_at, v_slot.ends_at, v_address, v_phone, v_price, true, v_note)
  returning id into v_order;

  return query
    select o.id, o.service_id, o.starts_at, o.ends_at, o.price_idr, o.status
    from public.orders as o
    where o.id = v_order;
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
  customer_note text
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.service_id, o.area_id, o.starts_at, o.ends_at, o.address, o.contact_phone, o.price_idr,
    o.status, o.created_at, c.full_name, c.photo_url, o.checked_in_at, o.completed_at,
    r.id, r.expires_at, r.deleted_at is not null, o.code, o.assigned_at, o.customer_note
  from public.orders as o
  left join public.cleaners as c on c.user_id = o.cleaner_id
  left join public.recordings as r on r.order_id = o.id
  where o.customer_id = (select auth.uid())
  order by o.created_at desc;
$$;

drop function public.my_jobs();

create function public.my_jobs()
returns table (
  order_id uuid,
  service_id text,
  area_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  address text,
  contact_phone text,
  customer_name text,
  stream_consent boolean,
  checked_in_at timestamptz,
  completed_at timestamptz,
  order_code text,
  customer_note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.current_role_is('cleaner') then
    raise exception 'not_cleaner' using errcode = '42501';
  end if;

  return query
    select o.id, o.service_id, o.area_id, o.starts_at, o.ends_at, o.address, o.contact_phone,
      p.full_name, o.stream_consent, o.checked_in_at, o.completed_at, o.code, o.customer_note
    from public.orders as o
    left join public.profiles as p on p.id = o.customer_id
    where o.cleaner_id = (select auth.uid())
      and o.status = 'paid'
      and (
        (o.completed_at is null and o.ends_at > now() - interval '12 hours')
        or o.completed_at > now() - interval '1 day'
      )
    order by o.starts_at;
end;
$$;

drop function public.agency_jobs();

create function public.agency_jobs()
returns table (
  order_id uuid,
  service_id text,
  area_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  address text,
  contact_phone text,
  cleaner_id uuid,
  cleaner_name text,
  checked_in_at timestamptz,
  completed_at timestamptz,
  recording_id uuid,
  recording_expires_at timestamptz,
  recording_deleted boolean,
  order_code text,
  assigned_at timestamptz,
  agency_fee_idr integer,
  agency_fee_final boolean,
  customer_note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.current_role_is('agency') then
    raise exception 'not_agency' using errcode = '42501';
  end if;

  return query
    select o.id, o.service_id, o.area_id, o.starts_at, o.ends_at, o.address, o.contact_phone,
      o.cleaner_id, c.full_name, o.checked_in_at, o.completed_at,
      r.id, r.expires_at, r.deleted_at is not null, o.code, o.assigned_at,
      coalesce(f.fee_idr, round(o.price_idr * a.payout_percent / 100.0)::integer), f.order_id is not null, o.customer_note
    from public.orders as o
    join public.agencies as a on a.id = o.agency_id
    left join public.cleaners as c on c.user_id = o.cleaner_id
    left join public.recordings as r on r.order_id = o.id
    left join public.order_fees as f on f.order_id = o.id
    where a.user_id = (select auth.uid()) and o.status = 'paid'
    order by o.starts_at desc;
end;
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
  customer_note text
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
      o.assigned_at, o.checked_in_at, o.completed_at, s.status, s.updated_at, o.customer_note
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

revoke all on function public.book_slot(text, text, timestamptz, text, text, boolean, text) from public, anon;
revoke all on function public.my_orders() from public, anon;
revoke all on function public.my_jobs() from public, anon;
revoke all on function public.agency_jobs() from public, anon;
revoke all on function public.admin_order_detail(uuid) from public, anon;
grant execute on function public.book_slot(text, text, timestamptz, text, text, boolean, text) to authenticated;
grant execute on function public.my_orders() to authenticated;
grant execute on function public.my_jobs() to authenticated;
grant execute on function public.agency_jobs() to authenticated;
grant execute on function public.admin_order_detail(uuid) to authenticated;
