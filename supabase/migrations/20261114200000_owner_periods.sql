-- B5: periods and growth for the owner and partner dashboards (Owner-Overview, Owner-Partners,
-- Owner-Admins, Partner-Summary).
--
-- Definitions used throughout, so the screens agree with each other:
--   * A period of N days is the last N x 24 hours up to now; the previous period is the N days before it.
--     N is 7, 30 or 90; anything else (also null) is refused with invalid_days.
--   * Revenue: the price of paid orders, dated by when the payment result arrived (payment_result_at),
--     or by when the order was made if no result time is stored (older and seeded orders).
--   * Paid out to agencies: the agency fees (order_fees), dated by when the job was completed. This is
--     the same figure the agency sees as its "Imbalan" in agency_summary, so the owner's payout per
--     agency and the partner's own total match. HomeKlin's remainder is revenue minus paid out.
--   * On time: the cleaner checked in no later than the job's start (checked_in_at <= starts_at), as a
--     percentage of the jobs completed in the last 30 days; null when there were none.
-- Customers' personal data never appears in any of these numbers.

-- ─── owner_numbers(p_days) ───────────────────────────────────────────────────────────────────────
-- The old owner_numbers() had no argument; the new one takes the period. p_days defaults to 30 so a
-- call without it (the current owner page) still works. The old keys are kept unchanged; new keys:
-- days, period, previous, daily, payouts_by_agency. Refusals: not_owner, invalid_days.

drop function public.owner_numbers();

-- A helper for owner_numbers only: revenue, paid orders, average order, paid out and remainder between
-- two times. Not callable by any client (execute revoked below); owner_numbers checks the role first.
create function public.owner_period_totals(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'revenue_idr', r.revenue,
    'paid_orders', r.orders,
    'avg_order_idr', case when r.orders > 0 then round(r.revenue::numeric / r.orders) else 0 end,
    'paid_out_idr', f.paid_out,
    'homeklin_idr', r.revenue - f.paid_out
  )
  from (
    select coalesce(sum(o.price_idr), 0)::bigint as revenue, count(*) as orders
    from public.orders as o
    where o.status = 'paid'
      and coalesce(o.payment_result_at, o.created_at) >= p_from
      and coalesce(o.payment_result_at, o.created_at) < p_to
  ) as r,
  (
    select coalesce(sum(fee.fee_idr), 0)::bigint as paid_out
    from public.order_fees as fee
    join public.orders as o on o.id = fee.order_id
    where o.completed_at >= p_from and o.completed_at < p_to
  ) as f;
$$;

revoke all on function public.owner_period_totals(timestamptz, timestamptz) from public, anon, authenticated;

create function public.owner_numbers(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_since date := (now() at time zone 'Asia/Jakarta')::date - 29;
  v_start timestamptz;
begin
  if not public.is_owner() then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'invalid_days' using detail = 'p_days must be 7, 30 or 90';
  end if;
  v_start := now() - make_interval(days => p_days);

  return jsonb_build_object(
    -- Unchanged from 20261104160100_owner.sql (all time, and the 30-day trend by order date).
    'revenue_idr', (select coalesce(sum(price_idr), 0) from public.orders where status = 'paid'),
    'paid_orders', (select count(*) from public.orders where status = 'paid'),
    'completed_jobs', (select count(*) from public.orders where status = 'paid' and completed_at is not null),
    'by_status', (
      select jsonb_object_agg(s.status, coalesce(c.count, 0))
      from unnest(enum_range(null::public.order_status)) as s(status)
      left join (select status, count(*) as count from public.orders group by status) as c on c.status = s.status
    ),
    'trend', (
      select jsonb_agg(jsonb_build_object('date', d.day, 'orders', coalesce(t.orders, 0), 'revenue_idr', coalesce(t.revenue, 0)) order by d.day)
      from generate_series(v_since, v_since + 29, interval '1 day') as d(day)
      left join (
        select (created_at at time zone 'Asia/Jakarta')::date as day,
          count(*) as orders,
          sum(price_idr) filter (where status = 'paid') as revenue
        from public.orders
        where (created_at at time zone 'Asia/Jakarta')::date >= v_since
        group by 1
      ) as t on t.day = d.day::date
    ),
    'agencies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'agency_id', a.id, 'name', a.name, 'status', a.status,
        'jobs', coalesce(n.jobs, 0), 'completed', coalesce(n.completed, 0), 'revenue_idr', coalesce(n.revenue, 0)
      ) order by coalesce(n.revenue, 0) desc, a.name), '[]'::jsonb)
      from public.agencies as a
      left join (
        select agency_id, count(*) as jobs, count(completed_at) as completed, sum(price_idr) as revenue
        from public.orders where status = 'paid' group by agency_id
      ) as n on n.agency_id = a.id
    ),
    -- New in B5.
    'days', p_days,
    'period', public.owner_period_totals(v_start, now()),
    'previous', public.owner_period_totals(now() - make_interval(days => 2 * p_days), v_start),
    -- Revenue per Jakarta day for the last 14 days whatever the period (the chart has 14 bars).
    'daily', (
      select jsonb_agg(jsonb_build_object('date', d.day::date, 'revenue_idr', coalesce(t.revenue, 0)) order by d.day)
      from generate_series(v_today - 13, v_today, interval '1 day') as d(day)
      left join (
        select (coalesce(payment_result_at, created_at) at time zone 'Asia/Jakarta')::date as day,
          sum(price_idr) as revenue
        from public.orders
        where status = 'paid'
          and (coalesce(payment_result_at, created_at) at time zone 'Asia/Jakarta')::date >= v_today - 13
        group by 1
      ) as t on t.day = d.day::date
    ),
    -- Fees per agency in the period; only agencies that earned something, largest first.
    'payouts_by_agency', (
      select coalesce(jsonb_agg(jsonb_build_object('agency_id', a.id, 'name', a.name, 'paid_out_idr', p.paid_out)
        order by p.paid_out desc, a.name), '[]'::jsonb)
      from (
        select fee.agency_id, sum(fee.fee_idr)::bigint as paid_out
        from public.order_fees as fee
        join public.orders as o on o.id = fee.order_id
        where o.completed_at >= v_start
        group by fee.agency_id
      ) as p
      join public.agencies as a on a.id = p.agency_id
    )
  );
end;
$$;

revoke all on function public.owner_numbers(int) from public, anon;
grant execute on function public.owner_numbers(int) to authenticated;

-- ─── agency_summary(p_days) ──────────────────────────────────────────────────────────────────────
-- Adds previous_total_fee_idr (the fees of the N days before the period). It was security invoker,
-- relying on the order_fees RLS policy, but 20261111090000_agency_fees.sql revoked all table rights
-- on order_fees and payouts from authenticated, so every agency's call failed with "permission
-- denied". It is now security definer and limited to the caller's own agency (my_agency_id()).
-- Refusals: not_agency, invalid_days.

drop function public.agency_summary(int);

create function public.agency_summary(p_days int)
returns table (
  total_fee_idr          bigint,
  jobs_count             bigint,
  avg_fee_idr            numeric,
  pending_idr            bigint,
  previous_total_fee_idr bigint
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
    coalesce(sum(f.fee_idr), 0)::bigint,
    count(*)::bigint,
    case when count(*) > 0
      then round(sum(f.fee_idr)::numeric / count(*), 2)
      else 0::numeric
    end,
    -- "Menunggu dibayarkan": fees not yet in a paid payout.
    coalesce(
      sum(f.fee_idr) filter (
        where f.payout_id is null
           or not exists (
             select 1 from public.payouts as p
             where p.id = f.payout_id and p.status = 'paid'
           )
      ), 0
    )::bigint,
    (
      select coalesce(sum(prev.fee_idr), 0)::bigint
      from public.order_fees as prev
      join public.orders as po on po.id = prev.order_id
      where prev.agency_id = v_agency
        and po.completed_at >= now() - make_interval(days => 2 * p_days)
        and po.completed_at < now() - make_interval(days => p_days)
    )
  from public.order_fees as f
  join public.orders as o on o.id = f.order_id
  where f.agency_id = v_agency
    and o.completed_at >= now() - make_interval(days => p_days);
end;
$$;

revoke all on function public.agency_summary(int) from public, anon;
grant execute on function public.agency_summary(int) to authenticated;

-- ─── owner_agencies() ────────────────────────────────────────────────────────────────────────────
-- Adds the last 30 days per agency: completed_30d, on_time_percent (null when no completed jobs),
-- cancelled_30d (dated like revenue) and paid_out_30d_idr. Refusal: not_owner.

drop function public.owner_agencies();

create function public.owner_agencies()
returns table (
  agency_id        uuid,
  key              text,
  name             text,
  status           text,
  area_ids         text[],
  cleaners         bigint,
  jobs             bigint,
  revenue_idr      bigint,
  has_sign_in      boolean,
  created_at       timestamptz,
  completed_30d    bigint,
  on_time_percent  numeric,
  cancelled_30d    bigint,
  paid_out_30d_idr bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - interval '30 days';
begin
  if not public.is_owner() then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  return query
    select a.id, a.key, a.name, a.status,
      coalesce((select array_agg(aa.area_id order by aa.area_id) from public.agency_areas as aa where aa.agency_id = a.id), '{}'),
      (select count(*) from public.cleaners as c where c.agency_id = a.id),
      (select count(*) from public.orders as o where o.agency_id = a.id and o.status = 'paid'),
      (select coalesce(sum(o.price_idr), 0)::bigint from public.orders as o where o.agency_id = a.id and o.status = 'paid'),
      a.user_id is not null,
      a.created_at,
      coalesce(done.completed, 0),
      done.on_time,
      (select count(*) from public.orders as o
        where o.agency_id = a.id and o.status = 'cancelled' and coalesce(o.payment_result_at, o.created_at) >= v_since),
      (select coalesce(sum(fee.fee_idr), 0)::bigint from public.order_fees as fee
        join public.orders as o on o.id = fee.order_id
        where fee.agency_id = a.id and o.completed_at >= v_since)
    from public.agencies as a
    left join lateral (
      select count(*) as completed,
        round(100.0 * count(*) filter (where o.checked_in_at <= o.starts_at) / nullif(count(*), 0), 1) as on_time
      from public.orders as o
      where o.agency_id = a.id and o.status = 'paid' and o.completed_at >= v_since
    ) as done on true
    order by a.status, a.name;
end;
$$;

revoke all on function public.owner_agencies() from public, anon;
grant execute on function public.owner_agencies() to authenticated;

-- ─── owner_admins() ──────────────────────────────────────────────────────────────────────────────
-- Adds last_sign_in_at from auth.users (null for an admin who has never signed in). Refusal: not_owner.

drop function public.owner_admins();

create function public.owner_admins()
returns table (user_id uuid, full_name text, email text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, u.email::text, p.created_at, u.last_sign_in_at
    from public.profiles as p
    join auth.users as u on u.id = p.id
    where p.role = 'admin'
    order by p.full_name, u.email;
end;
$$;

revoke all on function public.owner_admins() from public, anon;
grant execute on function public.owner_admins() to authenticated;
