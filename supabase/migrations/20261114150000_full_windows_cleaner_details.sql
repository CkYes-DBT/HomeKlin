-- B11 (Phase 15): full windows, and a cleaner's phone and area.
--
-- 1. The booking page shows full windows too, greyed out ("15.00, penuh", Main mock). free_slots()
--    stays as it is (its callers and tests rely on its two columns); slot_windows() is the same read of
--    an area's windows from active agencies, now including the full ones, with is_full true when no
--    agency has a place left. Like free_slots it gives times only: never an agency, a capacity or a
--    count, and the same window from two agencies is one row.
-- 2. cleaners.phone (+628..., the same form as orders.contact_phone) and cleaners.area_id (one of the
--    cleaner's agency's areas) for Cleaner-Account, Cleaner-Home and Partner-Cleaners. The agency sets
--    both for its own cleaners (set_cleaner_details); the cleaner reads their own (my_cleaner_profile);
--    the agency reads them with its cleaners (agency_cleaners, which gains two columns). A composite
--    reference to agency_areas keeps the area one the agency serves: if the agency stops serving it,
--    the cleaner's area is emptied, not left pointing at an area the agency no longer has.
-- Refusals: not_agency, not_cleaner, cleaner_not_found, phone_invalid, area_invalid.

create function public.slot_windows(p_area text, p_from timestamptz, p_to timestamptz)
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
    and slot.starts_at >= greatest(p_from, now())
    and slot.starts_at < least(p_to, now() + interval '60 days')
  group by slot.starts_at, slot.ends_at
  order by slot.starts_at, slot.ends_at;
$$;

revoke all on function public.slot_windows(text, timestamptz, timestamptz) from public;
grant execute on function public.slot_windows(text, timestamptz, timestamptz) to anon, authenticated;

alter table public.cleaners
  add column phone text check (phone is null or phone ~ '^\+628[0-9]{7,11}$'),
  add column area_id text,
  add constraint cleaners_area_served
    foreign key (agency_id, area_id) references public.agency_areas (agency_id, area_id)
    on delete set null (area_id);

comment on column public.cleaners.phone is 'The cleaner''s mobile number (+628...), set by the agency (B11).';
comment on column public.cleaners.area_id is 'The area the cleaner mostly works in, one of the agency''s areas, set by the agency (B11).';

-- The agency sets its own cleaner's phone and area. An empty phone or area clears it.
create function public.set_cleaner_details(p_cleaner uuid, p_phone text, p_area text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agency uuid;
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_area text := nullif(btrim(coalesce(p_area, '')), '');
begin
  if not public.current_role_is('agency') then
    raise exception 'not_agency' using errcode = '42501';
  end if;

  select a.id into v_agency from public.agencies as a where a.user_id = (select auth.uid());
  if not exists (select 1 from public.cleaners where user_id = p_cleaner and agency_id = v_agency) then
    raise exception 'cleaner_not_found';
  end if;
  if v_phone is not null and v_phone !~ '^\+628[0-9]{7,11}$' then
    raise exception 'phone_invalid';
  end if;
  if v_area is not null and not exists (
    select 1 from public.agency_areas where agency_id = v_agency and area_id = v_area
  ) then
    raise exception 'area_invalid';
  end if;

  update public.cleaners set phone = v_phone, area_id = v_area where user_id = p_cleaner;
end;
$$;

-- The signed-in cleaner's own account details.
create function public.my_cleaner_profile()
returns table (cleaner_id uuid, full_name text, photo_url text, phone text, area_id text)
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
    select c.user_id, c.full_name, c.photo_url, c.phone, c.area_id
    from public.cleaners as c
    where c.user_id = (select auth.uid());
end;
$$;

-- agency_cleaners() gains the phone and the area (its return type changes, so it is dropped and made
-- again with its grants; the body is as in 20261104090000_jobs.sql plus the two columns).
drop function public.agency_cleaners();

create function public.agency_cleaners()
returns table (cleaner_id uuid, full_name text, photo_url text, phone text, area_id text)
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
    select c.user_id, c.full_name, c.photo_url, c.phone, c.area_id
    from public.cleaners as c
    join public.agencies as a on a.id = c.agency_id
    where a.user_id = (select auth.uid())
    order by c.full_name;
end;
$$;

revoke all on function public.set_cleaner_details(uuid, text, text) from public, anon;
revoke all on function public.my_cleaner_profile() from public, anon;
revoke all on function public.agency_cleaners() from public, anon;
grant execute on function public.set_cleaner_details(uuid, text, text) to authenticated;
grant execute on function public.my_cleaner_profile() to authenticated;
grant execute on function public.agency_cleaners() to authenticated;
