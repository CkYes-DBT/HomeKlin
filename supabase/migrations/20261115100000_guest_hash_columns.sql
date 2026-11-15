-- Review M1 (Checkpoint D): a guest chat's two hashes are no longer readable by signed-in users.
--
-- support_tickets.guest_ip_hash (the visitor's address, for the abuse limits) and guest_token_hash (the
-- guest's chat token) are needed by the guest functions only, which run as their owner (security
-- definer) and answer the server's secret key. Until now `authenticated` had select on the whole
-- table, so an admin's session could read both. The address hash is now an HMAC keyed from the
-- server-only secret key (src/lib/support/guest.ts), and here the table-level select is replaced by a
-- column-level one on every other column. Row-level security is unchanged (a customer reads only their
-- own tickets, an admin every ticket), and Realtime still sends both their rows: it leaves out the
-- columns a role may not select.
--
-- A column added to support_tickets later is NOT readable by signed-in users until a migration grants
-- it. `select *` from a user's session is refused (42501); the app names its columns
-- (src/lib/support/support.ts).

revoke select on table public.support_tickets from authenticated;

grant select (
  id,
  customer_id,
  order_id,
  question,
  urgency,
  status,
  created_at,
  last_message_at,
  guest_name,
  guest_email,
  customer_read_at,
  admin_read_at
) on table public.support_tickets to authenticated;

-- Fails the migration if a column exists that is neither granted above nor one of the two hashes, so
-- no column is silently hidden from the inbox and the chat.
do $$
declare
  v_missing text;
begin
  select string_agg(c.column_name, ', ') into v_missing
  from information_schema.columns as c
  where c.table_schema = 'public' and c.table_name = 'support_tickets'
    and c.column_name not in ('guest_ip_hash', 'guest_token_hash')
    and not has_column_privilege('authenticated', 'public.support_tickets', c.column_name, 'SELECT');
  if v_missing is not null then
    raise exception 'support_tickets columns not granted to authenticated: %', v_missing;
  end if;
end;
$$;

comment on column public.support_tickets.guest_ip_hash is
  'HMAC-SHA-256 of the guest''s address, keyed from the server''s secret key (src/lib/support/guest.ts); for the abuse limits only. Not readable by signed-in users (review M1).';
comment on column public.support_tickets.guest_token_hash is
  'SHA-256 (hex) of the guest''s random chat token; the token itself lives only in the guest''s httpOnly cookie. Not readable by signed-in users (review M1).';
