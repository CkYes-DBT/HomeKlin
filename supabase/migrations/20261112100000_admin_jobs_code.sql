-- The live monitor (task M1, user 2026-11-12) also shows today's jobs that have a cleaner but no
-- check-in yet, as cards with the status "Belum check-in", and every card carries the order number
-- (20261112090000_order_codes.sql). admin_jobs() already lists every paid job with its check-in; it
-- now returns the order number as well. The return type changes, so the function is dropped and made
-- again; the body is as in 20261104090000_jobs.sql plus o.code.

drop function public.admin_jobs();

create function public.admin_jobs()
returns table (
  order_id uuid,
  service_id text,
  area_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  agency_name text,
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
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
    select o.id, o.service_id, o.area_id, o.starts_at, o.ends_at, a.name, c.full_name,
      o.checked_in_at, o.completed_at, r.id, r.expires_at, r.deleted_at is not null, o.code
    from public.orders as o
    join public.agencies as a on a.id = o.agency_id
    left join public.cleaners as c on c.user_id = o.cleaner_id
    left join public.recordings as r on r.order_id = o.id
    where o.status = 'paid'
    order by o.starts_at desc;
end;
$$;

revoke all on function public.admin_jobs() from public, anon;
grant execute on function public.admin_jobs() to authenticated;
