-- B4 (Phase 15): the partner's jobs list shows the agency's fee before the job is done. Until then
-- there is no order_fees row (check_out writes it at completion, 20261111090000_agency_fees.sql), so
-- agency_jobs() returns the expected fee, round(price x the agency's payout_percent / 100) with the same
-- half-up rounding as check_out; once the row exists it returns that real fee, which keeps the percent
-- of the moment of completion even if the owner changes the percent later.
--   agency_fee_idr    the fee in whole rupiah
--   agency_fee_final  true when it is the real fee from order_fees, false while it is the expected one
-- Only the agency reads it, for its own jobs (as before); customers and cleaners never see fees.
-- The return type changes, so the function is dropped and made again with its grants; the body is as
-- in 20261114110000_assigned_time.sql plus the fee.

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
  agency_fee_final boolean
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
      coalesce(f.fee_idr, round(o.price_idr * a.payout_percent / 100.0)::integer), f.order_id is not null
    from public.orders as o
    join public.agencies as a on a.id = o.agency_id
    left join public.cleaners as c on c.user_id = o.cleaner_id
    left join public.recordings as r on r.order_id = o.id
    left join public.order_fees as f on f.order_id = o.id
    where a.user_id = (select auth.uid()) and o.status = 'paid'
    order by o.starts_at desc;
end;
$$;

revoke all on function public.agency_jobs() from public, anon;
grant execute on function public.agency_jobs() to authenticated;
