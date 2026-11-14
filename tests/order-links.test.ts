import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// B14a: the private order link's server side (src/lib/orders/order-link.ts) and the customer's revoke
// action (src/lib/booking/email-actions.ts), with stand-in clients. The rules live in the database
// (tests/integration/order-links.test.ts); here: only the token's hash leaves the server, a malformed
// token never reaches the database, and the revoke is the customer's.

const orderId = "0b8f3c1e-1111-4222-8333-944455556666";
const { serviceRpc, sessionRpc } = vi.hoisted(() => ({ serviceRpc: vi.fn(), sessionRpc: vi.fn() }));
let user: { role: string } | null = null;

vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: () => ({ rpc: serviceRpc }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc: sessionRpc }) }));
vi.mock("@/lib/auth/dal", () => ({ authorize: async (roles: string[]) => (user && roles.includes(user.role) ? user : null) }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const { createOrderLink, getOrderByLink } = await import("@/lib/orders/order-link");
const { revokeOrderLinks } = await import("@/lib/booking/email-actions");

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, entry] of Object.entries(values)) data.set(key, entry);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  serviceRpc.mockResolvedValue({ data: null, error: null });
  sessionRpc.mockResolvedValue({ data: 1, error: null });
  user = { role: "customer" };
});

describe("createOrderLink", () => {
  it("stores only the token's hash and gives the page address with the token", async () => {
    const url = await createOrderLink(orderId, "en");
    const token = url?.split("/o/")[1] ?? "";
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url).toMatch(/^https:\/\/[^/]+\/en\/o\/[A-Za-z0-9_-]{43}$/);
    expect(serviceRpc).toHaveBeenCalledWith("issue_order_link", { p_order: orderId, p_token_hash: sha256(token) });
    expect((await createOrderLink(orderId, "id"))?.includes("/en/")).toBe(false);
  });

  it("answers null when the link cannot be stored", async () => {
    serviceRpc.mockResolvedValue({ data: null, error: { message: "order_not_found" } });
    expect(await createOrderLink(orderId, "id")).toBeNull();
  });
});

describe("getOrderByLink", () => {
  it("reads the order with the token's hash", async () => {
    serviceRpc.mockResolvedValue({
      data: [{
        order_id: orderId, order_code: "HK-1042", service_id: "regular", area_id: "jakarta-selatan",
        starts_at: "2026-11-20T01:00:00Z", ends_at: "2026-11-20T03:00:00Z", price_idr: 85000, status: "paid",
        created_at: "2026-11-14T01:00:00Z", payment_type: "qris", cleaner_name: "Rina", cleaner_photo_url: null,
        assigned_at: null, checked_in_at: null, completed_at: null, recording_expires_at: null, recording_deleted: false,
        link_expires_at: "2026-12-14T01:00:00Z",
      }],
      error: null,
    });
    const token = "a".repeat(43);
    const order = await getOrderByLink(token);
    expect(serviceRpc).toHaveBeenCalledWith("order_by_link", { p_token_hash: sha256(token) });
    expect(order).toMatchObject({ id: orderId, orderCode: "HK-1042", status: "paid", paymentMethod: "qris", cleanerName: "Rina", linkExpiresAt: "2026-12-14T01:00:00.000Z" });
  });

  it("answers null for an unknown, revoked or malformed link, the last without asking the database", async () => {
    serviceRpc.mockResolvedValue({ data: null, error: { message: "link_not_found" } });
    expect(await getOrderByLink("b".repeat(43))).toBeNull();
    vi.clearAllMocks();
    for (const bad of ["", "short", "a".repeat(44), "../../etc/passwd", `${"a".repeat(42)}!`]) {
      expect(await getOrderByLink(bad), bad).toBeNull();
    }
    expect(serviceRpc).not.toHaveBeenCalled();
  });
});

describe("revokeOrderLinks", () => {
  it("lets the customer revoke the links of their own order", async () => {
    expect(await revokeOrderLinks(null, form({ orderId }))).toEqual({ ok: true });
    expect(sessionRpc).toHaveBeenCalledWith("revoke_order_links", { p_order: orderId });
    sessionRpc.mockResolvedValue({ data: null, error: { message: "order_not_found" } });
    expect(await revokeOrderLinks(null, form({ orderId }))).toEqual({ formError: "notFound" });
  });

  it("refuses anyone but a customer, and a malformed id, before the database", async () => {
    expect(await revokeOrderLinks(null, form({ orderId: "x" }))).toEqual({ formError: "notFound" });
    user = { role: "admin" };
    expect(await revokeOrderLinks(null, form({ orderId }))).toEqual({ formError: "notCustomer" });
    expect(sessionRpc).not.toHaveBeenCalled();
  });
});
