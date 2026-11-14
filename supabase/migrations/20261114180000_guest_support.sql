-- B13 for customers (user decision 2026-11-14): support chat without an account, and read times.
--
-- 1. A visitor without an account opens a chat (Customer-Support: "tidak perlu masuk akun") and keeps
--    writing in it. Nobody signs in, so no auth setting changes and no anonymous users exist. The guest
--    is known only by a random token the server keeps in an httpOnly cookie; the table stores its
--    SHA-256 (guest_token_hash), never the token. The guest functions are granted to the server's
--    secret key (service_role) alone: a browser cannot call them with the public key, so every guest
--    request goes through the Server Actions in src/lib/support/guest.ts, which also pass a hash of the
--    visitor's address (guest_ip_hash) for the abuse limits:
--      * at most 5 new guest chats per address per hour (too_many_tickets)
--      * at most 20 guest messages per chat per 10 minutes (too_many_messages)
--    The limits are per address on purpose low enough to stop a script and high enough for UAT testers
--    on one network (the M3 note of T34). Guest chats have no order (a guest has no orders to name).
--    Admins answer them from the same inbox (admin_ticket_inbox gains is_guest and guest_email).
--    Realtime does not reach a guest (it has no session), so the guest page reloads the chat instead.
-- 2. Read times per side for "Terbaca": customer_read_at (the customer's or the guest's) and
--    admin_read_at, set by mark_ticket_read (signed in) and guest_mark_read (the server, for a guest).
--    A message is read when the other side's read time is at or after it.
-- Refusals: ticket_not_found (also a wrong token), ticket_closed, message_invalid, question_invalid,
-- name_invalid, email_invalid, token_invalid, too_many_tickets, too_many_messages, not_allowed.

alter table public.support_tickets
  alter column customer_id drop not null,
  add column guest_name text check (guest_name is null or char_length(guest_name) between 1 and 80),
  add column guest_email text check (guest_email is null or (char_length(guest_email) <= 254 and guest_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  add column guest_token_hash text check (guest_token_hash is null or guest_token_hash ~ '^[0-9a-f]{64}$'),
  add column guest_ip_hash text check (guest_ip_hash is null or char_length(guest_ip_hash) between 16 and 128),
  add column customer_read_at timestamptz,
  add column admin_read_at timestamptz,
  -- Each ticket is a signed-in customer's or a guest's, never both, never neither.
  add constraint support_tickets_owner check (
    (customer_id is not null and guest_token_hash is null and guest_name is null)
    or (customer_id is null and guest_token_hash is not null and guest_name is not null)
  );

create index support_tickets_guest_ip on public.support_tickets (guest_ip_hash, created_at) where guest_ip_hash is not null;

comment on column public.support_tickets.guest_token_hash is
  'SHA-256 (hex) of the guest''s random chat token; the token itself lives only in the guest''s httpOnly cookie.';

-- The guest's token, checked in one place: the ticket id when the hash is this guest ticket's.
create function public.guest_ticket_id(p_ticket uuid, p_token_hash text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.support_tickets as t
  where t.id = p_ticket and t.guest_token_hash is not null and t.guest_token_hash = p_token_hash;
$$;

create function public.guest_open_ticket(p_name text, p_email text, p_question text, p_token_hash text, p_ip_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_question text := btrim(coalesce(p_question, ''));
  v_ticket uuid;
begin
  if char_length(v_name) not between 1 and 80 then
    raise exception 'name_invalid';
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'email_invalid';
  end if;
  if char_length(v_question) not between 5 and 1000 then
    raise exception 'question_invalid';
  end if;
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' or char_length(coalesce(p_ip_hash, '')) not between 16 and 128 then
    raise exception 'token_invalid';
  end if;
  if (select count(*) from public.support_tickets as t
      where t.guest_ip_hash = p_ip_hash and t.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many_tickets';
  end if;

  insert into public.support_tickets (customer_id, question, guest_name, guest_email, guest_token_hash, guest_ip_hash)
  values (null, v_question, v_name, v_email, p_token_hash, p_ip_hash)
  returning id into v_ticket;

  insert into public.ticket_messages (ticket_id, author_id, from_admin, body)
  values (v_ticket, null, false, v_question);

  return v_ticket;
end;
$$;

create function public.guest_post_message(p_ticket uuid, p_token_hash text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_status public.ticket_status;
  v_message uuid;
begin
  select t.status into v_status from public.support_tickets as t
  where t.id = public.guest_ticket_id(p_ticket, p_token_hash)
  for update;
  if not found then
    raise exception 'ticket_not_found';
  end if;
  if v_status = 'closed' then
    raise exception 'ticket_closed';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'message_invalid';
  end if;
  if (select count(*) from public.ticket_messages as m
      where m.ticket_id = p_ticket and not m.from_admin and m.created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'too_many_messages';
  end if;

  insert into public.ticket_messages (ticket_id, author_id, from_admin, body)
  values (p_ticket, null, false, v_body)
  returning id into v_message;

  update public.support_tickets set status = 'open', last_message_at = now() where id = p_ticket;
  return v_message;
end;
$$;

create function public.guest_ticket(p_ticket uuid, p_token_hash text)
returns table (
  id uuid,
  question text,
  urgency public.ticket_urgency,
  status public.ticket_status,
  guest_name text,
  created_at timestamptz,
  last_message_at timestamptz,
  customer_read_at timestamptz,
  admin_read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select t.id, t.question, t.urgency, t.status, t.guest_name, t.created_at, t.last_message_at, t.customer_read_at, t.admin_read_at
    from public.support_tickets as t
    where t.id = public.guest_ticket_id(p_ticket, p_token_hash);
  if not found then
    raise exception 'ticket_not_found';
  end if;
end;
$$;

create function public.guest_ticket_messages(p_ticket uuid, p_token_hash text)
returns table (id uuid, ticket_id uuid, from_admin boolean, body text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.guest_ticket_id(p_ticket, p_token_hash) is null then
    raise exception 'ticket_not_found';
  end if;
  return query
    select m.id, m.ticket_id, m.from_admin, m.body, m.created_at
    from public.ticket_messages as m
    where m.ticket_id = p_ticket
    order by m.created_at, m.id;
end;
$$;

create function public.guest_mark_read(p_ticket uuid, p_token_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_tickets set customer_read_at = now()
  where id = public.guest_ticket_id(p_ticket, p_token_hash);
  if not found then
    raise exception 'ticket_not_found';
  end if;
end;
$$;

-- A signed-in side marks a ticket read: its own customer, or an admin.
create function public.mark_ticket_read(p_ticket uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if public.is_admin() then
    update public.support_tickets set admin_read_at = now() where id = p_ticket;
  else
    update public.support_tickets set customer_read_at = now() where id = p_ticket and customer_id = v_user;
  end if;
  if not found then
    raise exception 'ticket_not_found';
  end if;
end;
$$;

-- The inbox names a guest by the name they gave, and says it is a guest (with the email, if given, so
-- admin can follow up). The return type changes, so it is dropped and made again; the body is as in
-- 20261104120000_support.sql plus the three columns.
drop function public.admin_ticket_inbox();

create function public.admin_ticket_inbox()
returns table (
  ticket_id uuid,
  customer_name text,
  order_id uuid,
  question text,
  urgency public.ticket_urgency,
  status public.ticket_status,
  created_at timestamptz,
  last_message_at timestamptz,
  message_count bigint,
  is_guest boolean,
  guest_email text,
  customer_read_at timestamptz,
  admin_read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
    select t.id, coalesce(p.full_name, t.guest_name), t.order_id, t.question, t.urgency, t.status, t.created_at, t.last_message_at,
      (select count(*) from public.ticket_messages as m where m.ticket_id = t.id),
      t.customer_id is null, t.guest_email, t.customer_read_at, t.admin_read_at
    from public.support_tickets as t
    left join public.profiles as p on p.id = t.customer_id
    order by
      (t.status = 'open') desc,
      (t.urgency = 'urgent' and t.status = 'open') desc,
      case when t.status = 'open' then t.created_at end asc,
      t.last_message_at desc;
end;
$$;

-- Row-level security is unchanged: a customer reads only their own tickets (a guest ticket has no
-- customer, so no customer ever reads one), an admin every ticket. An admin can thus see a guest's
-- token hash, which opens nothing: the guest functions answer the secret key only, and the token
-- cannot be worked back from its SHA-256.

revoke all on function public.guest_ticket_id(uuid, text) from public, anon, authenticated;
revoke all on function public.guest_open_ticket(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.guest_post_message(uuid, text, text) from public, anon, authenticated;
revoke all on function public.guest_ticket(uuid, text) from public, anon, authenticated;
revoke all on function public.guest_ticket_messages(uuid, text) from public, anon, authenticated;
revoke all on function public.guest_mark_read(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_ticket_read(uuid) from public, anon;
revoke all on function public.admin_ticket_inbox() from public, anon;
grant execute on function public.guest_open_ticket(text, text, text, text, text) to service_role;
grant execute on function public.guest_post_message(uuid, text, text) to service_role;
grant execute on function public.guest_ticket(uuid, text) to service_role;
grant execute on function public.guest_ticket_messages(uuid, text) to service_role;
grant execute on function public.guest_mark_read(uuid, text) to service_role;
grant execute on function public.mark_ticket_read(uuid) to authenticated;
grant execute on function public.admin_ticket_inbox() to authenticated;
