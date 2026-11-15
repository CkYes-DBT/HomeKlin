import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The guest support chat's server side (B13; src/lib/support/guest-actions.ts and guest.ts) with
// stand-in cookies, headers and Supabase clients. The rules live in the database
// (tests/integration/guest-support.test.ts); here: the token stays in an httpOnly cookie and only its
// hash leaves the server, the address is hashed, the input is parsed, and a chat opens only with its
// own cookie.

const ticketId = "0b8f3c1e-1111-4222-8333-944455556666";
const otherTicket = "1c9f4d2f-2222-4333-8444-a55566667777";
const { serviceRpc, sessionRpc, cookieStore, headerStore, redirectMock } = vi.hoisted(() => {
  const jar = new Map<string, string>();
  return {
    serviceRpc: vi.fn(),
    sessionRpc: vi.fn(),
    redirectMock: vi.fn(),
    headerStore: new Map<string, string>(),
    cookieStore: {
      jar,
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: vi.fn((name: string, value: string) => {
        jar.set(name, value);
      }),
    },
  };
});
let user: { role: string } | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => ({ get: (name: string) => headerStore.get(name) ?? null }),
}));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: () => ({ rpc: serviceRpc }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc: sessionRpc }) }));
vi.mock("@/lib/auth/dal", () => ({ authorize: async (roles: string[]) => (user && roles.includes(user.role) ? user : null) }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", async (original) => ({ ...(await original<object>()), redirect: redirectMock }));

const { openGuestTicket, postGuestMessage, markGuestTicketRead, markTicketRead } = await import("@/lib/support/guest-actions");
const { getGuestTicket, guestCookieName } = await import("@/lib/support/guest");

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const serverSecret = "sb_secret_test_only_value";
/** The address hash as the server makes it (review M1): HMAC-SHA-256, keyed from the secret key. */
const addressHmac = (address: string, secret = serverSecret) =>
  createHmac("sha256", createHash("sha256").update(`homeklin-guest-address|${secret}`).digest()).update(address).digest("hex");

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, entry] of Object.entries(values)) data.set(key, entry);
  return data;
}

function storedToken(): string {
  const value = cookieStore.jar.get(guestCookieName) ?? "";
  const [id, token] = value.split(".");
  expect(id).toBe(ticketId);
  return token;
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore.jar.clear();
  headerStore.clear();
  headerStore.set("x-forwarded-for", "203.0.113.7, 10.0.0.1");
  user = null;
  vi.stubEnv("SUPABASE_SECRET_KEY", serverSecret);
  serviceRpc.mockResolvedValue({ data: ticketId, error: null });
  sessionRpc.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("openGuestTicket", () => {
  it("opens the chat with the token's hash and the address's hash, keeps the token in an httpOnly cookie", async () => {
    await openGuestTicket(null, form({ name: " Tamu ", email: "Tamu@Contoh.id", question: "  Apakah ada biaya tambahan?  ", locale: "en" }));

    const token = storedToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [fn, args] = serviceRpc.mock.calls[0] as [string, Record<string, string>];
    expect(fn).toBe("guest_open_ticket");
    expect(args).toMatchObject({ p_name: "Tamu", p_email: "tamu@contoh.id", p_question: "Apakah ada biaya tambahan?", p_token_hash: sha256(token) });
    expect(args.p_ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain(token);
    expect(JSON.stringify(args)).not.toContain("203.0.113.7");
    const [, , options] = cookieStore.set.mock.calls[0] as unknown as [string, string, Record<string, unknown>];
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(redirectMock).toHaveBeenCalledWith(`/en/support?ticket=${ticketId}`);
  });

  it("hashes the same address the same way, and a different one differently", async () => {
    await openGuestTicket(null, form({ name: "Tamu", question: "Pertanyaan pertama di sini." }));
    headerStore.set("x-forwarded-for", "203.0.113.7");
    await openGuestTicket(null, form({ name: "Tamu", question: "Pertanyaan kedua di sini." }));
    headerStore.set("x-forwarded-for", "198.51.100.2");
    await openGuestTicket(null, form({ name: "Tamu", question: "Pertanyaan ketiga di sini." }));
    const hashes = serviceRpc.mock.calls.map(([, args]) => (args as { p_ip_hash: string }).p_ip_hash);
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[2]).not.toBe(hashes[0]);
  });

  it("keys the address hash with the server's secret (HMAC), so it cannot be worked back from a list of addresses", async () => {
    await openGuestTicket(null, form({ name: "Tamu", question: "Pertanyaan pertama di sini." }));
    vi.stubEnv("SUPABASE_SECRET_KEY", "another-secret");
    await openGuestTicket(null, form({ name: "Tamu", question: "Pertanyaan kedua di sini." }));
    const [first, second] = serviceRpc.mock.calls.map(([, args]) => (args as { p_ip_hash: string }).p_ip_hash);
    expect(first).toBe(addressHmac("203.0.113.7"));
    expect(first).not.toBe(sha256("homeklin-guest-address:203.0.113.7"));
    expect(second).toBe(addressHmac("203.0.113.7", "another-secret"));
  });

  it("refuses to open a chat when the request carries no address, instead of sharing one bucket (review L2)", async () => {
    headerStore.clear();
    expect(await openGuestTicket(null, form({ name: "Tamu", question: "Pertanyaan yang cukup." }))).toEqual({ formError: "noAddress" });
    headerStore.set("x-forwarded-for", " , ");
    expect(await openGuestTicket(null, form({ name: "Tamu", question: "Pertanyaan yang cukup." }))).toEqual({ formError: "noAddress" });
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();

    headerStore.clear();
    headerStore.set("x-real-ip", "198.51.100.9");
    await openGuestTicket(null, form({ name: "Tamu", question: "Pertanyaan yang cukup." }));
    expect((serviceRpc.mock.calls[0] as [string, { p_ip_hash: string }])[1].p_ip_hash).toBe(addressHmac("198.51.100.9"));
  });

  it("checks the form before anything is sent, and turns refusals into keys", async () => {
    expect(await openGuestTicket(null, form({ name: "", question: "Pertanyaan yang cukup." }))).toEqual({ formError: "nameInvalid" });
    expect(await openGuestTicket(null, form({ name: "Tamu", email: "nope", question: "Pertanyaan yang cukup." }))).toEqual({ formError: "emailInvalid" });
    expect(await openGuestTicket(null, form({ name: "Tamu", question: "Hai" }))).toEqual({ formError: "questionInvalid" });
    expect(serviceRpc).not.toHaveBeenCalled();

    serviceRpc.mockResolvedValueOnce({ data: null, error: { message: "too_many_tickets" } });
    expect(await openGuestTicket(null, form({ name: "Tamu", question: "Pertanyaan yang cukup." }))).toEqual({ formError: "tooMany" });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});

describe("the guest's own chat", () => {
  async function opened() {
    await openGuestTicket(null, form({ name: "Tamu", question: "Pertanyaan yang cukup." }));
    vi.clearAllMocks();
    return storedToken();
  }

  it("posts a message with the cookie's token hash", async () => {
    const token = await opened();
    serviceRpc.mockResolvedValue({ data: "m1", error: null });
    expect(await postGuestMessage(null, form({ ticketId, body: " Halo " }))).toEqual({ ok: true });
    expect(serviceRpc).toHaveBeenCalledWith("guest_post_message", { p_ticket: ticketId, p_token_hash: sha256(token), p_body: "Halo" });
  });

  it("refuses another chat than the cookie's, or no cookie at all, without asking the database", async () => {
    await opened();
    expect(await postGuestMessage(null, form({ ticketId: otherTicket, body: "Halo" }))).toEqual({ formError: "notFound" });
    expect(await getGuestTicket(otherTicket)).toBeNull();
    cookieStore.jar.clear();
    expect(await postGuestMessage(null, form({ ticketId, body: "Halo" }))).toEqual({ formError: "notFound" });
    expect(await markGuestTicketRead(ticketId)).toEqual({ formError: "notFound" });
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("reads the chat and its messages, and marks it read", async () => {
    const token = await opened();
    serviceRpc.mockImplementation(async (fn: string) => {
      if (fn === "guest_ticket") {
        return { data: [{ id: ticketId, question: "Q?", urgency: "normal", status: "answered", guest_name: "Tamu", created_at: "2026-11-14T01:00:00Z", last_message_at: "2026-11-14T02:00:00Z", customer_read_at: null, admin_read_at: "2026-11-14T02:30:00Z" }], error: null };
      }
      if (fn === "guest_ticket_messages") {
        return { data: [{ id: "m1", ticket_id: ticketId, from_admin: true, body: "Halo", created_at: "2026-11-14T02:00:00Z" }], error: null };
      }
      return { data: null, error: null };
    });
    const chat = await getGuestTicket(ticketId);
    expect(chat?.ticket).toMatchObject({ id: ticketId, status: "answered", guestName: "Tamu", customerReadAt: null, adminReadAt: "2026-11-14T02:30:00.000Z" });
    expect(chat?.messages).toEqual([{ id: "m1", ticketId, fromAdmin: true, body: "Halo", createdAt: "2026-11-14T02:00:00.000Z" }]);
    expect(await markGuestTicketRead(ticketId)).toEqual({ ok: true });
    expect(serviceRpc).toHaveBeenCalledWith("guest_mark_read", { p_ticket: ticketId, p_token_hash: sha256(token) });
  });
});

describe("markTicketRead (signed in)", () => {
  it("marks the ticket read for its customer or an admin, nobody else", async () => {
    expect(await markTicketRead(ticketId)).toEqual({ formError: "notAllowed" });
    user = { role: "agency" };
    expect(await markTicketRead(ticketId)).toEqual({ formError: "notAllowed" });
    user = { role: "customer" };
    expect(await markTicketRead("not-a-uuid")).toEqual({ formError: "notFound" });
    expect(sessionRpc).not.toHaveBeenCalled();
    expect(await markTicketRead(ticketId)).toEqual({ ok: true });
    expect(sessionRpc).toHaveBeenCalledWith("mark_ticket_read", { p_ticket: ticketId });
  });
});
