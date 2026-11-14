-- B1 (Phase 15): the redesign shows the short order number ("HK-1042") on the customer's orders, the
-- cleaner's jobs and the agency's jobs, as admin_jobs() and live_streams() already do
-- (20261112090000_order_codes.sql, 20261112100000_admin_jobs_code.sql). Each function now also returns
-- o.code as order_code, on the same rows as before: nobody reads an order they could not read before.
-- The return types change, so each function is dropped and made again with its grants; the bodies are
-- as in 20261104090000_jobs.sql plus o.code.

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
  order_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.service_id, o.area_id, o.starts_at, o.ends_at, o.address, o.contact_phone, o.price_idr,
    o.status, o.created_at, c.full_name, c.photo_url, o.checked_in_at, o.completed_at,
    r.id, r.expires_at, r.deleted_at is not null, o.code
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
  order_code text
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
      p.full_name, o.stream_consent, o.checked_in_at, o.completed_at, o.code
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
  order_code text
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
      r.id, r.expires_at, r.deleted_at is not null, o.code
    from public.orders as o
    join public.agencies as a on a.id = o.agency_id
    left join public.cleaners as c on c.user_id = o.cleaner_id
    left join public.recordings as r on r.order_id = o.id
    where a.user_id = (select auth.uid()) and o.status = 'paid'
    order by o.starts_at desc;
end;
$$;

revoke all on function public.my_orders() from public, anon;
revoke all on function public.my_jobs() from public, anon;
revoke all on function public.agency_jobs() from public, anon;
grant execute on function public.my_orders() to authenticated;
grant execute on function public.my_jobs() to authenticated;
grant execute on function public.agency_jobs() to authenticated;
