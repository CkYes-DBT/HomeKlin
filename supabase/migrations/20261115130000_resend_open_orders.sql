-- Review L5 (Checkpoint D): "Kirim ulang email" sent the order email for any of the customer's orders,
-- also a failed or cancelled one. claim_order_email_resend now allows it only while the order waits for
-- payment or is paid, and refuses others with not_resendable before it records the request. The body is
-- otherwise as in 20261114210000_order_emails.sql; create or replace keeps its grants (authenticated).
-- Refusals: order_not_found, not_customer, not_resendable, too_soon.

create or replace function public.claim_order_email_resend(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last timestamptz;
  v_status public.order_status;
begin
  if not public.current_role_is('customer') then
    raise exception 'not_customer' using errcode = '42501';
  end if;

  select o.email_resent_at, o.status into v_last, v_status
  from public.orders as o
  where o.id = p_order and o.customer_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'order_not_found';
  end if;
  if v_status not in ('pending_payment', 'paid') then
    raise exception 'not_resendable';
  end if;
  if v_last is not null and v_last > now() - interval '5 minutes' then
    raise exception 'too_soon';
  end if;

  update public.orders set email_resent_at = now() where id = p_order;
end;
$$;
