-- Review L4 (Checkpoint D): assigning a cleaner emailed the customer every time, also when the agency
-- picked the same cleaner again. assign_cleaner now answers whether the job got a different cleaner
-- (true) or already had this one (false); src/lib/jobs/actions.ts sends the "your cleaner" email only on
-- true. Picking the same cleaner again changes nothing, so assigned_at (the "Ditugaskan" time) stays.
-- There is no extra time limit per order: a quick A -> B -> A change is emailed each time, so the last
-- email always names the cleaner who comes.
-- The return type changes (void -> boolean), so the function is dropped and made again with its
-- grants. The body is as in 20261114110000_assigned_time.sql plus the cleaner check.

drop function public.assign_cleaner(uuid, uuid);

create function public.assign_cleaner(p_order uuid, p_cleaner uuid)
returns boolean
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

  select o.checked_in_at, o.completed_at, o.cleaner_id into v_job
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

  if v_job.cleaner_id is not distinct from p_cleaner then
    return false;
  end if;

  update public.orders set cleaner_id = p_cleaner, assigned_at = now() where id = p_order;
  return true;
end;
$$;

revoke all on function public.assign_cleaner(uuid, uuid) from public, anon;
grant execute on function public.assign_cleaner(uuid, uuid) to authenticated;
