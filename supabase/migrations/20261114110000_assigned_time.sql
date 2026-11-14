-- B3 (Phase 15): the time the agency gave the job to a cleaner, for the "Ditugaskan" step of every
-- timeline. assign_cleaner() sets it each time it assigns (a new assignment moves it); a refused
-- assignment changes nothing. Orders assigned before this migration keep it empty: their real time is
-- not known, and a made-up one would be wrong on the timeline.
-- agency_jobs() and my_orders() return it (the customer already sees that a cleaner was assigned, by
-- name, so the time tells them nothing new); admin reads it in admin_order_detail() (B2).
-- The return types change, so both readers are dropped and made again with their grants; the bodies
-- are as in 20261114100000_order_code_everywhere.sql plus o.assigned_at.

alter table public.orders add column assigned_at timestamptz;

comment on column public.orders.assigned_at is
  'When the agency last assigned a cleaner (assign_cleaner). Empty before an assignment, and on orders assigned before B3.';

-- As in 20261104090000_jobs.sql, plus the assigned time.
create or replace function public.assign_cleaner(p_order uuid, p_cleaner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agency uuid;
  v_job record;
begin
  if not public.current_role_is('agency') then
    raise exception 'not_agency' using errcode = '42501';
  end if;

  select a.id into v_agency from public.agencies as a where a.user_id = (select auth.uid());

  select o.checked_in_at, o.completed_at into v_job
  from public.orders as o
  where o.id = p_order and o.agency_id = v_agency and o.status = 'paid'
  for update;
  if not found then
    raise exception 'job_not_found';
  end if;

  if not exists (select 1 from public.cleaners where user_id = p_cleaner and agency_id = v_agency) then
    raise exception 'cleaner_not_found';
  end if;
  if v_job.checked_in_at is not null or v_job.completed_at is not null then
    raise exception 'job_started';
  end if;

  update public.orders set cleaner_id = p_cleaner, assigned_at = now() where id = p_order;
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
  assigned_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.service_id, o.area_id, o.starts_at, o.ends_at, o.address, o.contact_phone, o.price_idr,
    o.status, o.created_at, c.full_name, c.photo_url, o.checked_in_at, o.completed_at,
    r.id, r.expires_at, r.deleted_at is not null, o.code, o.assigned_at
  from public.orders as o
  left join public.cleaners as c on c.user_id = o.cleaner_id
  left join public.recordings as r on r.order_id = o.id
  where o.customer_id = (select auth.uid())
  order by o.created_at desc;
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
  assigned_at timestamptz
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
      r.id, r.expires_at, r.deleted_at is not null, o.code, o.assigned_at
    from public.orders as o
    join public.agencies as a on a.id = o.agency_id
    left join public.cleaners as c on c.user_id = o.cleaner_id
    left join public.recordings as r on r.order_id = o.id
    where a.user_id = (select auth.uid()) and o.status = 'paid'
    order by o.starts_at desc;
end;
$$;

revoke all on function public.assign_cleaner(uuid, uuid) from public, anon;
revoke all on function public.my_orders() from public, anon;
revoke all on function public.agency_jobs() from public, anon;
grant execute on function public.assign_cleaner(uuid, uuid) to authenticated;
grant execute on function public.my_orders() to authenticated;
grant execute on function public.agency_jobs() to authenticated;
