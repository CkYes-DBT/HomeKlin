-- B9 (Phase 15): an order's emails beyond the confirmation (Customer-Email-Order, Customer-Email-Replay):
--   * the cleaner's name and photo, emailed when the agency assigns one (no cleaner is known at payment);
--   * "recording ready", emailed after check-out once the recording is attached;
--   * "Kirim ulang email": the order's own customer asks for the confirmation again.
-- The emails are written and sent by the server (src/lib/email/order-emails.ts). order_email_facts()
-- gives it what they need, the customer's email included, so it answers the secret key only
-- (service_role). claim_order_email_resend() is the customer's own request, at most once per 5 minutes
-- per order (orders.email_resent_at), so the button cannot be used to flood an inbox.
-- Refusals: order_not_found, not_customer, too_soon.

alter table public.orders add column email_resent_at timestamptz;

comment on column public.orders.email_resent_at is
  'When the customer last asked for the order email again ("Kirim ulang email"); at most once per 5 minutes (B9).';

create function public.order_email_facts(p_order uuid)
returns table (
  customer_email text,
  order_code text,
  service_name_id text,
  service_name_en text,
  starts_at timestamptz,
  ends_at timestamptz,
  address text,
  price_idr integer,
  status public.order_status,
  cleaner_name text,
  cleaner_photo_url text,
  recording_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select u.email::text, o.code, s.name_id, s.name_en, o.starts_at, o.ends_at, o.address, o.price_idr, o.status,
      c.full_name, c.photo_url, r.expires_at
    from public.orders as o
    join public.services as s on s.id = o.service_id
    left join auth.users as u on u.id = o.customer_id
    left join public.cleaners as c on c.user_id = o.cleaner_id
    left join public.recordings as r on r.order_id = o.id and r.deleted_at is null
    where o.id = p_order;
  if not found then
    raise exception 'order_not_found';
  end if;
end;
$$;

create function public.claim_order_email_resend(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last timestamptz;
begin
  if not public.current_role_is('customer') then
    raise exception 'not_customer' using errcode = '42501';
  end if;

  select o.email_resent_at into v_last
  from public.orders as o
  where o.id = p_order and o.customer_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'order_not_found';
  end if;
  if v_last is not null and v_last > now() - interval '5 minutes' then
    raise exception 'too_soon';
  end if;

  update public.orders set email_resent_at = now() where id = p_order;
end;
$$;

revoke all on function public.order_email_facts(uuid) from public, anon, authenticated;
grant execute on function public.order_email_facts(uuid) to service_role;
revoke all on function public.claim_order_email_resend(uuid) from public, anon;
grant execute on function public.claim_order_email_resend(uuid) to authenticated;
