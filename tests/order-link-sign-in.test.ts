import { beforeEach, describe, expect, it, vi } from "vitest";

// The private order link signs the order's customer in (src/lib/orders/order-link-sign-in.ts, user
// decision 2026-11-16), with stand-in clients. A link that getOrderByLink refuses signs no one in; a
// link to a non-customer account signs no one in; a visitor already signed in as that customer keeps
// their session; anyone else gets the customer's session through a server-made one-time code.

const orderId = "0b8f3c1e-1111-4222-8333-944455556666";
const customerId = "5a1d2c3b-aaaa-4bbb-8ccc-1234567890ab";

const state = vi.hoisted(() => ({
  order: null as { id: string } | null,
  role: "customer" as string | null,
  signedInAs: null as string | null,
  email: "pelanggan.uji@contoh.test" as string | null,
}));
const calls = vi.hoisted(() => ({ generateLink: vi.fn(), verifyOtp: vi.fn() }));

vi.mock("@/lib/orders/order-link", () => ({ getOrderByLink: async () => state.order }));

function table(name: string) {
  const row = name === "orders" ? { customer_id: customerId } : state.role ? { role: state.role } : null;
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: row, error: null }) };
  return query;
}

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    from: table,
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: state.email ? { email: state.email } : null }, error: null }),
        generateLink: async (input: unknown) => {
          calls.generateLink(input);
          return { data: { properties: { email_otp: "123456" } }, error: null };
        },
      },
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: async () => ({ data: state.signedInAs ? { claims: { sub: state.signedInAs } } : null }),
      verifyOtp: async (input: unknown) => {
        calls.verifyOtp(input);
        return { data: {}, error: null };
      },
    },
  }),
}));

const { signInWithOrderLink } = await import("@/lib/orders/order-link-sign-in");

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { order: { id: orderId }, role: "customer", signedInAs: null, email: "pelanggan.uji@contoh.test" });
});

describe("signInWithOrderLink", () => {
  it("signs a signed-out visitor in as the order's customer and answers the order", async () => {
    expect(await signInWithOrderLink("token")).toBe(orderId);
    expect(calls.generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "pelanggan.uji@contoh.test" });
    expect(calls.verifyOtp).toHaveBeenCalledWith({ email: "pelanggan.uji@contoh.test", token: "123456", type: "email" });
  });

  it("replaces another account's session with the customer's", async () => {
    state.signedInAs = "someone-else";
    expect(await signInWithOrderLink("token")).toBe(orderId);
    expect(calls.verifyOtp).toHaveBeenCalledOnce();
  });

  it("leaves the customer's own session as it is", async () => {
    state.signedInAs = customerId;
    expect(await signInWithOrderLink("token")).toBe(orderId);
    expect(calls.generateLink).not.toHaveBeenCalled();
  });

  it("signs no one in for a link the database refuses", async () => {
    state.order = null;
    expect(await signInWithOrderLink("token")).toBeNull();
    expect(calls.generateLink).not.toHaveBeenCalled();
  });

  it("never signs in an account that is not a customer's", async () => {
    for (const role of ["admin", "owner", "agency", "cleaner", null]) {
      state.role = role;
      expect(await signInWithOrderLink("token")).toBeNull();
    }
    expect(calls.generateLink).not.toHaveBeenCalled();
  });

  it("signs no one in when the account has no email", async () => {
    state.email = null;
    expect(await signInWithOrderLink("token")).toBeNull();
    expect(calls.verifyOtp).not.toHaveBeenCalled();
  });
});
