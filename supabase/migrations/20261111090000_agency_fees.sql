-- T40: agency fees, payouts and summaries backend.
-- Rounding rule: round(price_idr * percent / 100.0) uses PostgreSQL round() which rounds half
-- away from zero (half-up for positive integers with positive percent). This is the single
-- authoritative definition used in check_out and in tests.
-- Default agency share: PAYOUT_PERCENT_DEFAULT = 70 (column default below).
-- HomeKlin keeps the remaining 30 %. The owner may change payout_percent per agency.
-- Customers never read fee or payout data: a separate table (not a column on orders) enforces this.

-- Sources:
-- https://supabase.com/docs/guides/database/postgres/row-level-security
-- https://supabase.com/docs/guides/database/functions (security definer, search_path)

-- ─── 1. Add payout_percent to agencies ───────────────────────────────────────────────────────────

alter table public.agencies
  add column payout_percent numeric(5,2) not null default 70
    check (payout_percent >= 0 and payout_percent <= 100);

comment on column public.agencies.payout_percent is
  'Agency share of each completed order price, in percent. PAYOUT_PERCENT_DEFAULT = 70. '
  'Only the owner role may change this (enforced by lack of a direct-write RLS policy).';

-- ─── 2. Create payouts table ──────────────────────────────────────────────────────────────────────
-- Must be created before order_fees because order_fees.payout_id references it.

create table public.payouts (
  id              uuid        primary key default gen_random_uuid(),
  agency_id       uuid        not null references public.agencies(id),
  period_start    date        not null,
  period_end      date        not null,
  amount_idr      integer     not null check (amount_idr >= 0),
  jobs_count      integer     not null,
  status          text        not null default 'pending'
                                check (status in ('pending', 'paid')),
  payout_date     date,
  paid_at         timestamptz,
  -- Owner user who marked this payout as paid. References profiles, whose id = auth.users.id.
  paid_by         uuid        references public.profiles(id),
  -- DEMO: no payment gateway is involved. Format: DEMO-<first 8 chars of payout id>.
  paid_reference  text,
  created_at      timestamptz not null default now(),
  unique (agency_id, period_start, period_end)
);

comment on table public.payouts is
  'Weekly fee payouts to agencies. Written only by generate_payouts() and mark_payout_paid(). '
  'DEMO: marking a payout as paid stores a reference string only; no external service is called.';

-- ─── 3. Create order_fees table ──────────────────────────────────────────────────────────────────
-- Separate from orders so customers reading their own order row never see fee data.

create table public.order_fees (
  order_id    uuid          primary key references public.orders(id),
  agency_id   uuid          not null references public.agencies(id),
  -- Snapshot of orders.price_idr at the moment of completion (immutable after insert).
  price_idr   integer       not null,
  -- Snapshot of agencies.payout_percent at the moment of completion (immutable after insert).
  percent     numeric(5,2)  not null,
  fee_idr     integer       not null check (fee_idr >= 0),
  -- Null until included in a payout by generate_payouts().
  payout_id   uuid          references public.payouts(id),
  created_at  timestamptz   not null default now()
);

comment on table public.order_fees is
  'Fee owed to an agency for each completed order. Created inside check_out() at job completion. '
  'Never exposed to customers, cleaners or admins.';

-- ─── 4. RLS: enable and revoke all direct access ─────────────────────────────────────────────────

alter table public.payouts    enable row level security;
alter table public.order_fees enable row level security;

revoke all on table public.payouts    from anon;
revoke all on table public.payouts    from authenticated;
revoke all on table public.order_fees from anon;
revoke all on table public.order_fees from authenticated;

-- payouts: agency reads its own; owner reads all. No insert/update/delete from client.
create policy "Agency reads own payouts"
  on public.payouts
  for select
  to authenticated
  using (
    agency_id in (
      select a.id from public.agencies as a
      where a.user_id = (select auth.uid())
    )
  );

create policy "Owner reads all payouts"
  on public.payouts
  for select
  to authenticated
  using (public.current_role_is('owner'));

-- order_fees: agency reads its own; owner reads all.
create policy "Agency reads own order_fees"
  on public.order_fees
  for select
  to authenticated
  using (
    agency_id in (
      select a.id from public.agencies as a
      where a.user_id = (select auth.uid())
    )
  );

create policy "Owner reads all order_fees"
  on public.order_fees
  for select
  to authenticated
  using (public.current_role_is('owner'));

-- ─── 5. check_out: add fee insert at completion ───────────────────────────────────────────────────
-- Uses CREATE OR REPLACE so the stream session end (added in 20261104140000_streams.sql) is kept.
-- The INSERT … ON CONFLICT DO NOTHING makes this idempotent: a second call to check_out
-- returns the already-recorded completed_at and never creates a second fee row.

create or replace function public.check_out(p_order uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job record;
begin
  if not public.current_role_is('cleaner') then
    raise exception 'not_cleaner' using errcode = '42501';
  end if;

  select o.checked_in_at, o.completed_at, o.agency_id, o.price_idr into v_job
  from public.orders as o
  where o.id = p_order and o.cleaner_id = (select auth.uid()) and o.status = 'paid'
  for update;

  if not found then
    raise exception 'job_not_found';
  end if;
  if v_job.completed_at is not null then
    return v_job.completed_at;
  end if;
  if v_job.checked_in_at is null then
    raise exception 'not_checked_in';
  end if;

  update public.orders set completed_at = now() where id = p_order;

  update public.stream_sessions
  set status = 'ended', ended_at = now(), updated_at = now()
  where order_id = p_order and status <> 'ended';

  -- Fee snapshot: round(price * percent / 100.0), half-up for positive integers.
  -- ON CONFLICT makes this idempotent: a retry never creates two rows for the same order.
  insert into public.order_fees (order_id, agency_id, price_idr, percent, fee_idr)
  select
    p_order,
    v_job.agency_id,
    v_job.price_idr,
    a.payout_percent,
    round(v_job.price_idr * a.payout_percent / 100.0)::integer
  from public.agencies as a
  where a.id = v_job.agency_id
  on conflict (order_id) do nothing;

  return now();
end;
$$;

-- ─── 6. generate_payouts ─────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER: needs to write payouts and update order_fees directly.
-- Allowed for the owner role (manual trigger from the owner dashboard) and service_role (cron).
-- Idempotent: a second call for the same period_end creates nothing new and never double-counts.
-- period_start is derived as the Monday of the ISO week containing period_end.

create function public.generate_payouts(p_period_end date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agency      record;
  v_payout_id   uuid;
  v_total       integer;
  v_count       integer;
  v_created     integer := 0;
  v_period_start date;
begin
  if not (public.current_role_is('owner') or (select auth.role()) = 'service_role') then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  -- period_start: Monday of the ISO week that ends on p_period_end (Sunday).
  -- extract(isodow …) returns 1 (Monday) through 7 (Sunday).
  v_period_start := p_period_end - (extract(isodow from p_period_end)::int - 1);

  for v_agency in
    select a.id as agency_id
    from public.agencies as a
    where a.user_id is not null  -- active agencies only (those with a sign-in account)
  loop
    -- Sum unassigned fees for orders completed on or before period_end.
    select
      coalesce(sum(f.fee_idr), 0)::integer,
      count(*)::integer
    into v_total, v_count
    from public.order_fees as f
    join public.orders as o on o.id = f.order_id
    where f.agency_id  = v_agency.agency_id
      and f.payout_id  is null
      and o.completed_at::date <= p_period_end;

    if v_count = 0 then
      continue;
    end if;

    -- ON CONFLICT skips if a payout for this period already exists.
    -- RETURNING id is null when the row was not inserted (conflict).
    insert into public.payouts (agency_id, period_start, period_end, amount_idr, jobs_count, payout_date)
    values (v_agency.agency_id, v_period_start, p_period_end, v_total, v_count, p_period_end + 1)
    on conflict (agency_id, period_start, period_end) do nothing
    returning id into v_payout_id;

    if v_payout_id is null then
      -- Payout already existed; skip fee re-assignment to prevent double-counting.
      continue;
    end if;

    update public.order_fees as f
    set payout_id = v_payout_id
    from public.orders as o
    where f.order_id    = o.id
      and f.agency_id   = v_agency.agency_id
      and f.payout_id   is null
      and o.completed_at::date <= p_period_end;

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

-- ─── 7. mark_payout_paid ─────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER: owner-only. Marks pending → paid and stores a demo reference.
-- DEMO: no external payment service is called.

create function public.mark_payout_paid(p_payout_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.current_role_is('owner') then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  select status into v_status
  from public.payouts
  where id = p_payout_id;

  if not found then
    raise exception 'payout_not_found';
  end if;
  if v_status = 'paid' then
    raise exception 'already_paid';
  end if;

  -- DEMO: paid_reference is a local identifier only; no money moves in this system.
  update public.payouts
  set
    status         = 'paid',
    paid_at        = now(),
    paid_by        = (select auth.uid()),
    paid_reference = 'DEMO-' || upper(substring(p_payout_id::text, 1, 8))
  where id = p_payout_id;
end;
$$;

-- ─── 8. Summary functions (SECURITY INVOKER) ─────────────────────────────────────────────────────
-- RLS on order_fees and payouts limits these to the caller's own agency automatically.
-- p_days must be one of 7, 30, 90.

create function public.agency_summary(p_days int)
returns table (
  total_fee_idr bigint,
  jobs_count    bigint,
  avg_fee_idr   numeric,
  pending_idr   bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_days not in (7, 30, 90) then
    raise exception 'invalid_days' using detail = 'p_days must be 7, 30 or 90';
  end if;

  return query
  select
    coalesce(sum(f.fee_idr), 0)::bigint as total_fee_idr,
    count(*)::bigint as jobs_count,
    case when count(*) > 0
      then round(sum(f.fee_idr)::numeric / count(*), 2)
      else 0::numeric
    end as avg_fee_idr,
    -- "Menunggu dibayarkan": fees not yet in a paid payout.
    coalesce(
      sum(f.fee_idr) filter (
        where f.payout_id is null
           or not exists (
             select 1 from public.payouts p
             where p.id = f.payout_id and p.status = 'paid'
           )
      ), 0
    )::bigint as pending_idr
  from public.order_fees as f
  join public.orders as o on o.id = f.order_id
  where o.completed_at >= now() - (p_days || ' days')::interval;
end;
$$;

create function public.agency_fees_daily(p_days int)
returns table (
  day     date,
  fee_idr bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_days not in (7, 30, 90) then
    raise exception 'invalid_days' using detail = 'p_days must be 7, 30 or 90';
  end if;

  return query
  select
    o.completed_at::date as day,
    sum(f.fee_idr)::bigint as fee_idr
  from public.order_fees as f
  join public.orders as o on o.id = f.order_id
  where o.completed_at >= now() - (p_days || ' days')::interval
  group by o.completed_at::date
  order by day;
end;
$$;

create function public.agency_fees_by_cleaner(p_days int)
returns table (
  cleaner_id    uuid,
  full_name     text,
  fee_idr       bigint,
  share_percent numeric
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total bigint;
begin
  if p_days not in (7, 30, 90) then
    raise exception 'invalid_days' using detail = 'p_days must be 7, 30 or 90';
  end if;

  select coalesce(sum(f.fee_idr), 0) into v_total
  from public.order_fees as f
  join public.orders as o on o.id = f.order_id
  where o.completed_at >= now() - (p_days || ' days')::interval;

  return query
  select
    o.cleaner_id,
    pr.full_name,
    sum(f.fee_idr)::bigint as fee_idr,
    case when v_total > 0
      then round(sum(f.fee_idr)::numeric * 100 / v_total, 1)
      else 0::numeric
    end as share_percent
  from public.order_fees as f
  join public.orders     as o  on o.id  = f.order_id
  join public.profiles   as pr on pr.id = o.cleaner_id
  where o.completed_at >= now() - (p_days || ' days')::interval
  group by o.cleaner_id, pr.full_name
  order by fee_idr desc;
end;
$$;

create function public.agency_fees_by_service(p_days int)
returns table (
  service_id    text,
  service_name  text,
  fee_idr       bigint,
  share_percent numeric
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total bigint;
begin
  if p_days not in (7, 30, 90) then
    raise exception 'invalid_days' using detail = 'p_days must be 7, 30 or 90';
  end if;

  select coalesce(sum(f.fee_idr), 0) into v_total
  from public.order_fees as f
  join public.orders as o on o.id = f.order_id
  where o.completed_at >= now() - (p_days || ' days')::interval;

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
  where o.completed_at >= now() - (p_days || ' days')::interval
  group by o.service_id, s.name_id
  order by fee_idr desc;
end;
$$;

create function public.agency_payouts_list(p_limit int)
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
security invoker
set search_path = ''
as $$
begin
  return query
  select
    p.id,
    p.period_start,
    p.period_end,
    p.amount_idr,
    p.jobs_count,
    p.status,
    p.payout_date,
    p.paid_at,
    p.paid_reference
  from public.payouts as p
  order by p.period_end desc
  limit p_limit;
end;
$$;

-- ─── 9. owner_payouts_overview ────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER: reads across all agencies. Owner only.

create function public.owner_payouts_overview()
returns table (
  agency_id         uuid,
  agency_name       text,
  total_paid_idr    bigint,
  total_pending_idr bigint,
  last_payout_date  date
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.current_role_is('owner') then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  return query
  select
    a.id,
    a.name,
    coalesce(sum(p.amount_idr) filter (where p.status = 'paid'),    0)::bigint,
    coalesce(sum(p.amount_idr) filter (where p.status = 'pending'), 0)::bigint,
    max(p.payout_date) filter (where p.status = 'paid')
  from public.agencies as a
  left join public.payouts as p on p.agency_id = a.id
  group by a.id, a.name
  order by a.name;
end;
$$;

-- ─── 10. GRANT execute permissions ───────────────────────────────────────────────────────────────

revoke all on function public.agency_summary(int)         from public, anon;
revoke all on function public.agency_fees_daily(int)      from public, anon;
revoke all on function public.agency_fees_by_cleaner(int) from public, anon;
revoke all on function public.agency_fees_by_service(int) from public, anon;
revoke all on function public.agency_payouts_list(int)    from public, anon;
revoke all on function public.generate_payouts(date)      from public, anon;
revoke all on function public.mark_payout_paid(uuid)      from public, anon;
revoke all on function public.owner_payouts_overview()    from public, anon;

grant execute on function public.agency_summary(int)         to authenticated;
grant execute on function public.agency_fees_daily(int)      to authenticated;
grant execute on function public.agency_fees_by_cleaner(int) to authenticated;
grant execute on function public.agency_fees_by_service(int) to authenticated;
grant execute on function public.agency_payouts_list(int)    to authenticated;
-- generate_payouts: both authenticated (owner manual trigger) and service_role (cron)
grant execute on function public.generate_payouts(date)      to authenticated;
grant execute on function public.generate_payouts(date)      to service_role;
grant execute on function public.mark_payout_paid(uuid)      to authenticated;
grant execute on function public.owner_payouts_overview()    to authenticated;
