import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, createTestUser, deleteTestUsers, visitorClient, type TestUser } from "./test-project";

// B13 for customers (supabase/migrations/20261114180000_guest_support.sql), against the real test
// project: a visitor without an account opens a support chat and keeps writing in it; admins answer it
// from the same inbox; and each side's read time ("Terbaca"). A guest is known only by a random token
// the server keeps in an httpOnly cookie; the database stores its SHA-256 alone. The guest functions
// are granted to the server's secret key only, which also passes a hash of the visitor's address for
// the abuse limits (5 new chats per address per hour, 20 messages per chat per 10 minutes).

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const ipHash = () => hash(`test-${randomUUID()}`);
const server = () => adminClient();
const tickets: string[] = [];
let customer: TestUser | undefined;
let admin: TestUser | undefined;

function user(which: "customer" | "admin"): TestUser {
  const found = which === "customer" ? customer : admin;
  if (!found) throw new Error(`The ${which} test user was not created (see beforeAll).`);
  return found;
}

async function open(token: string, ip = ipHash(), question = "Apakah petugas membawa alat sendiri?") {
  const result = await server().rpc("guest_open_ticket", {
    p_name: "Uji Tamu", p_email: "tamu@example.com", p_question: question, p_token_hash: hash(token), p_ip_hash: ip,
  });
  if (typeof result.data === "string") tickets.push(result.data);
  return result;
}

beforeAll(async () => {
  customer = await createTestUser("b13-customer");
  admin = await createTestUser("b13-admin");
  await server().from("profiles").update({ role: "admin" }).eq("id", admin.id);
}, 90_000);

afterAll(async () => {
  if (tickets.length > 0) await server().from("support_tickets").delete().in("id", tickets);
  await deleteTestUsers([customer, admin]);
}, 60_000);

describe("a guest's support chat", { timeout: 60_000 }, () => {
  it("opens with the question as the first message, and reads back only with the right token", async () => {
    const token = newToken();
    const { data: ticketId, error } = await open(token);
    expect(error).toBeNull();

    const ticket = await server().rpc("guest_ticket", { p_ticket: ticketId, p_token_hash: hash(token) });
    expect(ticket.error).toBeNull();
    expect(ticket.data[0]).toMatchObject({ id: ticketId, status: "open", guest_name: "Uji Tamu", question: "Apakah petugas membawa alat sendiri?" });
    const messages = await server().rpc("guest_ticket_messages", { p_ticket: ticketId, p_token_hash: hash(token) });
    expect(messages.data).toMatchObject([{ from_admin: false, body: "Apakah petugas membawa alat sendiri?" }]);

    for (const wrong of [hash(newToken()), ""]) {
      expect((await server().rpc("guest_ticket", { p_ticket: ticketId, p_token_hash: wrong })).error?.message).toBe("ticket_not_found");
      expect((await server().rpc("guest_ticket_messages", { p_ticket: ticketId, p_token_hash: wrong })).error?.message).toBe("ticket_not_found");
    }
    const { data: row } = await server().from("support_tickets").select("customer_id, guest_token_hash").eq("id", ticketId).single();
    expect(row).toEqual({ customer_id: null, guest_token_hash: hash(token) });
  });

  it("is answered by admin from the inbox, and the guest writes back", async () => {
    const token = newToken();
    const { data: ticketId } = await open(token);
    const inbox = await user("admin").client.rpc("admin_ticket_inbox");
    expect(inbox.error).toBeNull();
    expect((inbox.data as { ticket_id: string }[]).find((row) => row.ticket_id === ticketId)).toMatchObject({
      customer_name: "Uji Tamu", is_guest: true, guest_email: "tamu@example.com",
    });

    expect((await user("admin").client.rpc("post_ticket_message", { p_ticket: ticketId, p_body: "Ya, petugas membawa alat." })).error).toBeNull();
    expect((await server().rpc("guest_post_message", { p_ticket: ticketId, p_token_hash: hash(token), p_body: "Terima kasih!" })).error).toBeNull();
    const messages = await server().rpc("guest_ticket_messages", { p_ticket: ticketId, p_token_hash: hash(token) });
    expect((messages.data as { from_admin: boolean; body: string }[]).map((m) => [m.from_admin, m.body])).toEqual([
      [false, "Apakah petugas membawa alat sendiri?"], [true, "Ya, petugas membawa alat."], [false, "Terima kasih!"],
    ]);
    expect((await server().rpc("guest_ticket", { p_ticket: ticketId, p_token_hash: hash(token) })).data[0].status).toBe("open");

    // Another token, a closed chat, and an empty message are refused.
    expect((await server().rpc("guest_post_message", { p_ticket: ticketId, p_token_hash: hash(newToken()), p_body: "Halo" })).error?.message).toBe("ticket_not_found");
    expect((await server().rpc("guest_post_message", { p_ticket: ticketId, p_token_hash: hash(token), p_body: "  " })).error?.message).toBe("message_invalid");
    expect((await user("admin").client.rpc("close_ticket", { p_ticket: ticketId })).error).toBeNull();
    expect((await server().rpc("guest_post_message", { p_ticket: ticketId, p_token_hash: hash(token), p_body: "Halo" })).error?.message).toBe("ticket_closed");
  });

  it("checks the guest's name, email and question", async () => {
    const base = { p_name: "Uji Tamu", p_email: "", p_question: "Pertanyaan yang cukup panjang.", p_token_hash: hash(newToken()), p_ip_hash: ipHash() };
    const ok = await server().rpc("guest_open_ticket", base);
    expect(ok.error).toBeNull();
    tickets.push(ok.data);
    for (const [change, refusal] of [
      [{ p_name: " " }, "name_invalid"],
      [{ p_email: "not-an-email" }, "email_invalid"],
      [{ p_question: "Hai" }, "question_invalid"],
      [{ p_token_hash: "short" }, "token_invalid"],
    ] as const) {
      expect((await server().rpc("guest_open_ticket", { ...base, ...change })).error?.message, refusal).toBe(refusal);
    }
  });

  it("is limited to 5 new chats per address per hour, and 20 messages per chat per 10 minutes", async () => {
    const ip = ipHash();
    for (let i = 0; i < 5; i += 1) expect((await open(newToken(), ip)).error).toBeNull();
    expect((await open(newToken(), ip)).error?.message).toBe("too_many_tickets");
    expect((await open(newToken())).error).toBeNull();

    const token = newToken();
    const { data: ticketId } = await open(token);
    // 19 more guest messages written straight into the table: with the question that makes 20.
    const rows = Array.from({ length: 19 }, (_, i) => ({ ticket_id: ticketId, from_admin: false, body: `Pesan ${i}` }));
    expect((await server().from("ticket_messages").insert(rows)).error).toBeNull();
    expect((await server().rpc("guest_post_message", { p_ticket: ticketId, p_token_hash: hash(token), p_body: "Satu lagi" })).error?.message).toBe("too_many_messages");
  });

  it("cannot be used with the public key or any user's session", async () => {
    const token = newToken();
    for (const client of [visitorClient(), user("customer").client, user("admin").client]) {
      const { error } = await client.rpc("guest_open_ticket", {
        p_name: "Uji Tamu", p_email: "", p_question: "Pertanyaan yang cukup panjang.", p_token_hash: hash(token), p_ip_hash: ipHash(),
      });
      expect(error?.code).toBe("42501");
      expect((await client.rpc("guest_ticket", { p_ticket: randomUUID(), p_token_hash: hash(token) })).error?.code).toBe("42501");
    }
    // A signed-in customer neither reads nor writes in a guest's chat.
    const { data: ticketId } = await open(token);
    expect((await user("customer").client.from("support_tickets").select("id").eq("id", ticketId)).data).toEqual([]);
    expect((await user("customer").client.rpc("post_ticket_message", { p_ticket: ticketId, p_body: "Halo" })).error?.message).toBe("ticket_not_found");
  });
});

describe("read times", { timeout: 60_000 }, () => {
  it("are kept per side: the customer's (or guest's) and admin's", async () => {
    const opened = await user("customer").client.rpc("open_ticket", { p_question: "Kapan petugas datang?" });
    expect(opened.error).toBeNull();
    const ticketId = opened.data as string;
    tickets.push(ticketId);

    expect((await user("customer").client.rpc("mark_ticket_read", { p_ticket: ticketId })).error).toBeNull();
    let row = (await server().from("support_tickets").select("customer_read_at, admin_read_at").eq("id", ticketId).single()).data;
    expect(row?.customer_read_at).not.toBeNull();
    expect(row?.admin_read_at).toBeNull();

    expect((await user("admin").client.rpc("mark_ticket_read", { p_ticket: ticketId })).error).toBeNull();
    row = (await server().from("support_tickets").select("customer_read_at, admin_read_at").eq("id", ticketId).single()).data;
    expect(row?.admin_read_at).not.toBeNull();

    // The customer reads both times on their own ticket.
    const own = await user("customer").client.from("support_tickets").select("customer_read_at, admin_read_at").eq("id", ticketId).single();
    expect(own.data?.admin_read_at).not.toBeNull();

    // Nobody marks a ticket that is not theirs.
    const token = newToken();
    const { data: guestTicket } = await open(token);
    expect((await user("customer").client.rpc("mark_ticket_read", { p_ticket: guestTicket })).error?.message).toBe("ticket_not_found");
    expect((await visitorClient().rpc("mark_ticket_read", { p_ticket: ticketId })).error).not.toBeNull();

    // The guest's side, through the server.
    expect((await server().rpc("guest_mark_read", { p_ticket: guestTicket, p_token_hash: hash(token) })).error).toBeNull();
    const guestRow = (await server().rpc("guest_ticket", { p_ticket: guestTicket, p_token_hash: hash(token) })).data[0];
    expect(guestRow.customer_read_at).not.toBeNull();
    expect(guestRow).toHaveProperty("admin_read_at");
  });
});
