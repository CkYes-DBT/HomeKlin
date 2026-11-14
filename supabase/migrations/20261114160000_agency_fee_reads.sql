-- T44 fix: agencies could not read their own fees. 20261111090000_agency_fees.sql revoked every table
-- right on order_fees and payouts from authenticated, while its row-level security policies (agency
-- reads its own, owner reads all; 20261111090001_fix_order_fees_rls.sql) expected a select to reach
-- them, and the agency summary functions ran as the caller (security invoker), so with an agency's
-- session they failed with "permission denied for table order_fees". They also read orders, services
-- and profiles, which authenticated cannot read at all, so a table grant alone would not fix them.
--
-- 1. select on order_fees and payouts to authenticated, so the existing policies decide: an agency
--    sees its own rows, the owner all, every other role none (no policy matches). No insert, update or
--    delete: fees and payouts are written only by check_out, generate_payouts and mark_payout_paid.
-- 2. agency_fees_daily, agency_fees_by_cleaner, agency_fees_by_service and agency_payouts_list run as
--    security definer, limited to the caller's own agency (my_agency_id(), as agency_summary since
--    20261114200000_owner_periods.sql) and refused to anyone else (not_agency). Their columns stay.
-- 3. agency_fees_daily groups by the Jakarta date (Asia/Jakarta), not the UTC date: a job finished at
--    01:30 in Jakarta belongs to that day, not the one before.
-- 4. agency_fees_by_cleaner names the cleaner from cleaners (the name the agency gave), with profiles
--    as before only as a fallback.

grant select on table public.order_fees to authenticated;
grant select on table public.payouts to authenticated;

create or replace function public.agency_fees_daily(p_days int)
returns table (
  day     date,
  fee_idr bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_agency uuid := public.my_agency_id();
begin
  if v_agency is null then
    raise exception 'not_agency' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'invalid_days' using detail = 'p_days must be 7, 30 or 90';
  end if;

  return query
  select
    (o.completed_at at time zone 'Asia/Jakarta')::date as day,
    sum(f.fee_idr)::bigint as fee_idr
  from public.order_fees as f
  join public.orders as o on o.id = f.order_id
  where f.agency_id = v_agency
    and o.completed_at >= now() - make_interval(days => p_days)
  group by 1
  order by 1;
end;
$$;

create or replace function public.agency_fees_by_cleaner(p_days int)
returns table (
  cleaner_id    uuid,
  full_name     text,
  fee_idr       bigint,
  share_percent numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_agency uuid := public.my_agency_id();
  v_total bigint;
begin
  if v_agency is null then
    raise exception 'not_agency' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'invalid_days' using detail = 'p_days must be 7, 30 or 90';
  end if;

  select coalesce(sum(f.fee_idr), 0) into v_total
  from public.order_fees as f
  join public.orders as o on o.id = f.order_id
  where f.agency_id = v_agency
    and o.completed_at >= now() - make_interval(days => p_days);

  return query
  select
    o.cleaner_id,
    coalesce(c.full_name, pr.full_name),
    sum(f.fee_idr)::bigint as fee_idr,
    case when v_total > 0
      then round(sum(f.fee_idr)::numeric * 100 / v_total, 1)
      else 0::numeric
    end as share_percent
  from public.order_fees as f
  join public.orders as o on o.id = f.order_id
  left join public.cleaners as c on c.user_id = o.cleaner_id
  left join public.profiles as pr on pr.id = o.cleaner_id
  where f.agency_id = v_agency
    and o.completed_at >= now() - make_interval(days => p_days)
  group by o.cleaner_id, coalesce(c.full_name, pr.full_name)
  order by fee_idr desc;
end;
$$;

create or replace function public.agency_fees_by_service(p_days int)
returns table (
  service_id    text,
  service_name  text,
  fee_idr       bigint,
  share_percent numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_agency uuid := public.my_agency_id();
  v_total bigint;
begin
  if v_agency is null then
    raise exception 'not_agency' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'invalid_days' using detail = 'p_days must be 7, 30 or 90';
  end if;

  select coalesce(sum(f.fee_idr), 0) into v_total
  from public.order_fees as f
  join public.orders as o on o.id = f.order_id
  where f.agency_id = v_agency
    and o.completed_at >= now() - make_interval(days => p_days);

  return query
  select
    o.service_id,
    s.name_id as service_name,
    sum(f.fee_idr)::bigint as fee_idr,
    case when v_total > 0
      then round(sum(f.fee_idr)::numeric * 100 / v_total, 1)
      else 0::numeric
    end as share_percent
  from public.order_fees as f
  join public.orders   as o on o.id = f.order_id
  join public.services as s on s.id = o.service_id
  where f.agency_id = v_agency
    and o.completed_at >= now() - make_interval(days => p_days)
  group by o.service_id, s.name_id
  order by fee_idr desc;
end;
$$;

create or replace function public.agency_payouts_list(p_limit int)
returns table (
  id             uuid,
  period_start   date,
  period_end     date,
  amount_idr     integer,
  jobs_count     integer,
  status         text,
  payout_date    date,
  paid_at        timestamptz,
  paid_reference text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_agency uuid := public.my_agency_id();
begin
  if v_agency is null then
    raise exception 'not_agency' using errcode = '42501';
  end if;

  return query
  select p.id, p.period_start, p.period_end, p.amount_idr, p.jobs_count, p.status, p.payout_date, p.paid_at, p.paid_reference
  from public.payouts as p
  where p.agency_id = v_agency
  order by p.period_end desc
  limit greatest(coalesce(p_limit, 0), 0);
end;
$$;

revoke all on function public.agency_fees_daily(int)      from public, anon;
revoke all on function public.agency_fees_by_cleaner(int) from public, anon;
revoke all on function public.agency_fees_by_service(int) from public, anon;
revoke all on function public.agency_payouts_list(int)    from public, anon;
grant execute on function public.agency_fees_daily(int)      to authenticated;
grant execute on function public.agency_fees_by_cleaner(int) to authenticated;
grant execute on function public.agency_fees_by_service(int) to authenticated;
grant execute on function public.agency_payouts_list(int)    to authenticated;
