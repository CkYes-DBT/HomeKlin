-- Review L1 (Checkpoint D): the guest limit of 5 new chats per address per hour could be raced. Two
-- requests from one address at the same moment both counted the chats before either had inserted, so
-- both passed. guest_open_ticket now takes a transaction-level advisory lock on the address hash before
-- it counts, so openings from one address run one after another. The body is otherwise as in
-- 20261114180000_guest_support.sql; guest_post_message already locks its ticket row (for update).
-- create or replace keeps the function's grants (service_role only).

create or replace function public.guest_open_ticket(p_name text, p_email text, p_question text, p_token_hash text, p_ip_hash text)
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
  -- One opening per address at a time, until this transaction ends: two requests at the same moment
  -- would otherwise both count 4 and both open a chat.
  perform pg_advisory_xact_lock(hashtext(p_ip_hash));
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
