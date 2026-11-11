-- Fix: use public.my_agency_id() for the agency RLS policies on order_fees and payouts.
-- The original policies (20261111090000_agency_fees.sql) used a direct subquery on agencies,
-- but authenticated users cannot read that table (revoked in 20261024100000_catalog.sql).
-- my_agency_id() is SECURITY DEFINER and resolves the agency id for the signed-in agency user.
-- Non-agency callers (customer, cleaner, owner, admin) get NULL from my_agency_id(), so the
-- comparison agency_id = NULL is NULL (not TRUE) and they are correctly denied.

drop policy "Agency reads own order_fees" on public.order_fees;
drop policy "Agency reads own payouts" on public.payouts;

create policy "Agency reads own order_fees"
  on public.order_fees
  for select
  to authenticated
  using (agency_id = public.my_agency_id());

create policy "Agency reads own payouts"
  on public.payouts
  for select
  to authenticated
  using (agency_id = public.my_agency_id());
