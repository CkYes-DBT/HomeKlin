-- B6 (Phase 15): the three numbers on the cleaner's home page (Cleaner-Home: "Jam aktif minggu ini",
-- "Pekerjaan hari ini", "Selesai bulan ini"). my_jobs() keeps only the last day, so the counts need a
-- read of their own. All by Jakarta time (Asia/Jakarta), the cleaner's own paid jobs only:
--   active_hours_week  hours from check-in to check-out of the jobs checked in since Monday 00:00 this
--                      week; a job in progress counts until now. One decimal.
--   jobs_today         jobs whose window starts today
--   completed_month    jobs completed since the 1st of this month 00:00
-- Refusal: not_cleaner.

create function public.my_job_stats()
returns table (active_hours_week numeric, jobs_today bigint, completed_month bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_local timestamp := now() at time zone 'Asia/Jakarta';
  v_day timestamptz := date_trunc('day', v_local) at time zone 'Asia/Jakarta';
  v_week timestamptz := date_trunc('week', v_local) at time zone 'Asia/Jakarta';
  v_month timestamptz := date_trunc('month', v_local) at time zone 'Asia/Jakarta';
begin
  if not public.current_role_is('cleaner') then
    raise exception 'not_cleaner' using errcode = '42501';
  end if;

  return query
    select
      round(coalesce(sum(extract(epoch from (coalesce(o.completed_at, now()) - o.checked_in_at)))
        filter (where o.checked_in_at >= v_week), 0) / 3600, 1),
      count(*) filter (where o.starts_at >= v_day and o.starts_at < v_day + interval '1 day'),
      count(*) filter (where o.completed_at >= v_month)
    from public.orders as o
    where o.cleaner_id = (select auth.uid()) and o.status = 'paid';
end;
$$;

revoke all on function public.my_job_stats() from public, anon;
grant execute on function public.my_job_stats() to authenticated;
