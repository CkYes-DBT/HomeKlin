-- B12 (user decision 2026-11-14): each partner agency chooses which services it offers
-- (Partner-Services), and customers are routed only to agencies that offer the service.
-- * An agency that has never chosen offers every service, as before (agencies.services_restricted is
--   false), so nothing changes for existing agencies until they save a choice. Once it saves one
--   (set_agency_services), it offers exactly the services in agency_services, none if the list is
--   empty. Saving null goes back to offering every service. A service admin adds later is offered by
--   the agencies that never chose, and by the others once they add it.
-- * agency_offers(agency, service) is the one rule; book_slot() routes only to such agencies (the
--   race-safe place-taking is unchanged: one guarded update with skip locked, body as in
--   20261114140000_customer_note.sql plus that condition); free_slots() and slot_windows() take an
--   optional p_service (the old three-argument calls still work and show every window); and
--   search_services() lists a service for an area only when an active agency serving the area offers
--   it (body as in 20261024100000_catalog.sql with that condition).
-- * The agency reads its choice with agency_service_choices().
-- Refusals: not_agency, service_invalid.

alter table public.agencies
  add column services_restricted boolean not null default false;

comment on column public.agencies.services_restricted is
  'False: the agency offers every service. True: only the services in agency_services (B12).';

create table public.agency_services (
  agency_id uuid not null references public.agencies (id) on delete cascade,
  service_id text not null references public.services (id) on delete cascade,
  primary key (agency_id, service_id)
);

alter table public.agency_services enable row level security;
revoke all on table public.agency_services from anon, authenticated;

create function public.agency_offers(p_agency uuid, p_service text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.agencies as a
    where a.id = p_agency
      and (not a.services_restricted
        or exists (select 1 from public.agency_services as s where s.agency_id = a.id and s.service_id = p_service))
  );
$$;

create function public.area_offers_service(p_area text, p_service text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.agency_areas as aa
    join public.agencies as a on a.id = aa.agency_id
    where aa.area_id = p_area and a.status = 'active' and public.agency_offers(a.id, p_service)
  );
$$;

create function public.agency_service_choices()
returns table (service_id text, name_id text, name_en text, offered boolean, restricted boolean)
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
    select s.id, s.name_id, s.name_en, public.agency_offers(v_agency, s.id), a.services_restricted
    from public.services as s
    cross join public.agencies as a
    where a.id = v_agency and s.is_active
    order by s.sort_order, s.id;
end;
$$;

create function public.set_agency_services(p_services text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agency uuid := public.my_agency_id();
begin
  if v_agency is null then
    raise exception 'not_agency' using errcode = '42501';
  end if;
  if p_services is not null and exists (
    select 1 from unnest(p_services) as chosen(id)
    where not exists (select 1 from public.services as s where s.id = chosen.id)
  ) then
    raise exception 'service_invalid';
  end if;

  delete from public.agency_services where agency_id = v_agency;
  if p_services is null then
    update public.agencies set services_restricted = false where id = v_agency;
  else
    insert into public.agency_services (agency_id, service_id)
    select distinct v_agency, chosen.id from unnest(p_services) as chosen(id);
    update public.agencies set services_restricted = true where id = v_agency;
  end if;
end;
$$;

-- free_slots and slot_windows gain an optional service (bodies as in 20261104160100_owner.sql and
-- 20261114150000_full_windows_cleaner_details.sql plus the condition). A new argument makes a new
-- function, so the three-argument ones are dropped and made again with their grants.
drop function public.free_slots(text, timestamptz, timestamptz);

create function public.free_slots(p_area text, p_from timestamptz, p_to timestamptz, p_service text default null)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select slot.starts_at, slot.ends_at
  from public.availability_slots as slot
  join public.agencies as agency on agency.id = slot.agency_id
  where slot.area_id = p_area
    and agency.status = 'active'
    and (p_service is null or public.agency_offers(agency.id, p_service))
    and slot.booked < slot.capacity
    and slot.starts_at >= greatest(p_from, now())
    and slot.starts_at < least(p_to, now() + interval '60 days')
  group by slot.starts_at, slot.ends_at
  order by slot.starts_at, slot.ends_at;
$$;

drop function public.slot_windows(text, timestamptz, timestamptz);

create function public.slot_windows(p_area text, p_from timestamptz, p_to timestamptz, p_service text default null)
returns table (starts_at timestamptz, ends_at timestamptz, is_full boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select slot.starts_at, slot.ends_at, bool_and(slot.booked >= slot.capacity)
  from public.availability_slots as slot
  join public.agencies as agency on agency.id = slot.agency_id
  where slot.area_id = p_area
    and agency.status = 'active'
    and (p_service is null or public.agency_offers(agency.id, p_service))
    and slot.starts_at >= greatest(p_from, now())
    and slot.starts_at < least(p_to, now() + interval '60 days')
  group by slot.starts_at, slot.ends_at
  order by slot.starts_at, slot.ends_at;
$$;

create or replace function public.search_services(
  p_query text default null,
  p_category public.service_category default null,
  p_area text default null
)
returns setof public.services
language sql
stable
security invoker
set search_path = ''
as $$
  select service.*
  from public.services as service
  where service.is_active
    and (p_category is null or service.category = p_category)
    and (p_area is null or public.area_offers_service(p_area, service.id))
    and (
      coalesce(p_query, '') = ''
      or concat_ws(' ', service.name_id, service.name_en, service.description_id, service.description_en)
        ilike '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
  order by service.sort_order, service.id;
$$;

create or replace function public.book_slot(
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
        and public.agency_offers(candidate.agency_id, p_service)
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

revoke all on function public.agency_offers(uuid, text) from public, anon, authenticated;
revoke all on function public.area_offers_service(text, text) from public;
grant execute on function public.area_offers_service(text, text) to anon, authenticated;
revoke all on function public.agency_service_choices() from public, anon;
revoke all on function public.set_agency_services(text[]) from public, anon;
grant execute on function public.agency_service_choices() to authenticated;
grant execute on function public.set_agency_services(text[]) to authenticated;
revoke all on function public.free_slots(text, timestamptz, timestamptz, text) from public;
revoke all on function public.slot_windows(text, timestamptz, timestamptz, text) from public;
grant execute on function public.free_slots(text, timestamptz, timestamptz, text) to anon, authenticated;
grant execute on function public.slot_windows(text, timestamptz, timestamptz, text) to anon, authenticated;
