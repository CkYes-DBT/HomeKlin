-- A short order number for every order (user request, 2026-11-12): "HK-1001", "HK-1002", ...
-- People read it out in support chats and on the admin live monitor, where the uuid is too long.
-- * Unique: one sequence hands out the numbers (race-safe: nextval never gives the same number twice,
--   even to two bookings at the same moment), and a unique constraint backs it up.
-- * Never changes: a trigger refuses any update of the code, whoever runs it (the secret key too).
-- * Existing orders get numbers in the order they were made, oldest first.
-- Gaps are possible (a failed booking still uses a number); the code is a label, not a count.

create sequence public.order_code_seq as bigint start with 1001 minvalue 1001;

alter table public.orders add column code text;

update public.orders as o
set code = 'HK-' || numbered.n
from (
  select id, nextval('public.order_code_seq') as n
  from (select id from public.orders order by created_at, id) as oldest_first
) as numbered
where numbered.id = o.id;

alter table public.orders
  alter column code set default 'HK-' || nextval('public.order_code_seq'),
  alter column code set not null,
  add constraint orders_code_unique unique (code),
  add constraint orders_code_format check (code ~ '^HK-[0-9]{4,}$');

alter sequence public.order_code_seq owned by public.orders.code;

comment on column public.orders.code is
  'Short order number shown to people ("HK-1042"). Unique, set once from order_code_seq, never changed.';

create function public.keep_order_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.code is distinct from old.code then
    raise exception 'order_code_fixed' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.keep_order_code() from public, anon, authenticated;

create trigger orders_keep_code
before update of code on public.orders
for each row execute function public.keep_order_code();

-- The live monitor shows the order number on each card (task M1). The return type changes, so the
-- function is dropped and made again; the body is as in 20261104140000_streams.sql plus o.code.
drop function public.live_streams();

create function public.live_streams()
returns table (
  session_id uuid,
  order_id uuid,
  order_code text,
  status public.stream_status,
  source text,
  started_at timestamptz,
  updated_at timestamptz,
  service_id text,
  area_id text,
  cleaner_name text,
  agency_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
begin
  if not v_admin and not public.current_role_is('agency') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return query
    select s.id, s.order_id, o.code, s.status, s.source, s.started_at, s.updated_at, o.service_id, o.area_id, c.full_name, a.name
    from public.stream_sessions as s
    join public.orders as o on o.id = s.order_id
    join public.agencies as a on a.id = s.agency_id
    left join public.cleaners as c on c.user_id = s.cleaner_id
    where s.status <> 'ended' and (v_admin or a.user_id = (select auth.uid()))
    order by s.started_at;
end;
$$;

revoke all on function public.live_streams() from public, anon;
grant execute on function public.live_streams() to authenticated;
