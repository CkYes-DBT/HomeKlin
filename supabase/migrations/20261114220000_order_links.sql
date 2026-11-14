-- B14a (user decision 2026-11-14): the order page opened from the link in the order's emails, without
-- signing in (Customer-Email-Order, Customer-Email-Replay).
-- * The link carries a random token (256 bits) made by the server when it writes an email; the table
--   keeps only its SHA-256, so a database read never yields a working link.
-- * A link opens one order and shows only what the order page needs: no address, no phone, no email,
--   no customer or agency id, no note, because an email can be forwarded. It never signs anyone in and
--   never opens the account or another order.
-- * A link works for 30 days, and the order's customer can revoke every link of the order
--   (revoke_order_links) from the signed-in order page.
-- * issue_order_link and order_by_link answer the server's secret key only (service_role): the page
--   reads the order on the server, never from the browser with the public key.
-- Refusals: order_not_found, token_invalid, link_not_found, not_customer.

create table public.order_links (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  revoked_at timestamptz
);

create index order_links_order on public.order_links (order_id);

comment on table public.order_links is
  'Private links to one order''s page from its emails (B14a). Only the SHA-256 of each token is kept. Closed to users.';

alter table public.order_links enable row level security;
revoke all on table public.order_links from anon, authenticated;

create function public.issue_order_link(p_order uuid, p_token_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'token_invalid';
  end if;
  if not exists (select 1 from public.orders where id = p_order) then
    raise exception 'order_not_found';
  end if;
  insert into public.order_links (order_id, token_hash) values (p_order, p_token_hash);
end;
$$;

create function public.order_by_link(p_token_hash text)
returns table (
  order_id uuid,
  order_code text,
  service_id text,
  area_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  price_idr integer,
  status public.order_status,
  created_at timestamptz,
  payment_type text,
  cleaner_name text,
  cleaner_photo_url text,
  assigned_at timestamptz,
  checked_in_at timestamptz,
  completed_at timestamptz,
  recording_expires_at timestamptz,
  recording_deleted boolean,
  link_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select o.id, o.code, o.service_id, o.area_id, o.starts_at, o.ends_at, o.price_idr, o.status, o.created_at,
      o.payment_type, c.full_name, c.photo_url, o.assigned_at, o.checked_in_at, o.completed_at,
      r.expires_at, r.deleted_at is not null, l.expires_at
    from public.order_links as l
    join public.orders as o on o.id = l.order_id
    left join public.cleaners as c on c.user_id = o.cleaner_id
    left join public.recordings as r on r.order_id = o.id
    where l.token_hash = p_token_hash and l.revoked_at is null and l.expires_at > now();
  if not found then
    raise exception 'link_not_found';
  end if;
end;
$$;

create function public.revoke_order_links(p_order uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.current_role_is('customer') then
    raise exception 'not_customer' using errcode = '42501';
  end if;
  if not exists (select 1 from public.orders where id = p_order and customer_id = (select auth.uid())) then
    raise exception 'order_not_found';
  end if;
  update public.order_links set revoked_at = now() where order_id = p_order and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.issue_order_link(uuid, text) from public, anon, authenticated;
revoke all on function public.order_by_link(text) from public, anon, authenticated;
revoke all on function public.revoke_order_links(uuid) from public, anon;
grant execute on function public.issue_order_link(uuid, text) to service_role;
grant execute on function public.order_by_link(text) to service_role;
grant execute on function public.revoke_order_links(uuid) to authenticated;
