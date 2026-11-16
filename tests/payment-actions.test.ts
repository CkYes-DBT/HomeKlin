import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentError, type ChargePayload } from "@/lib/payment/midtrans";

// Paying on the payment step (payOrder and changePaymentMethod in src/lib/payment/actions.ts), with a
// stand-in Supabase client and a stand-in Midtrans. The charge request itself is tested in
// tests/payment.test.ts, the database rules against the test project in
// tests/integration/payment-attempts.test.ts.

const order = {
  orderId: "0b8f3c1e-1111-4222-8333-944455556666",
  email: "nadia@pelanggan-uji.id",
  phone: "+6281234567890",
};
const rpc = vi.fn();
const getUser = vi.fn();
const { createCharge, cancelCharge } = vi.hoisted(() => ({ createCharge: vi.fn(), cancelCharge: vi.fn() }));
let user: { id: string; role: string; fullName: string } | null = null;

vi.mock("@/lib/auth/dal", () => ({ authorize: async (roles: string[]) => (user && roles.includes(user.role) ? user : null) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc, auth: { getUser } }) }));
vi.mock("@/lib/payment/midtrans", async (original) => ({ ...(await original<object>()), createCharge, cancelCharge }));

const { payOrder, changePaymentMethod } = await import("@/lib/payment/actions");

const row = {
  order_id: order.orderId,
  service_id: "regular",
  service_name_id: "Pembersihan Rutin",
  service_name_en: "Regular Cleaning",
  price_idr: 85000,
  contact_phone: order.phone,
  status: "pending_payment",
  payment_url: null,
};
const qrisCharge = { details: { method: "qris", qrUrl: "https://api.sandbox.midtrans.com/v2/qris/x/qr-code", expiresAt: "2026-11-16T10:45:48.000Z" } };

/** The database: a waiting order, an attempt that opens as number 1 over nothing. */
function database(overrides: Record<string, { data?: unknown; error?: { message: string } | null }> = {}) {
  rpc.mockImplementation(async (name: string) => {
    const fixed = overrides[name];
    if (fixed) return { data: fixed.data ?? null, error: fixed.error ?? null };
    if (name === "order_for_payment") return { data: [row], error: null };
    if (name === "begin_payment_attempt") return { data: [{ attempt: 1, previous_attempt: 0, previous_charge: false }], error: null };
    return { data: null, error: null };
  });
}

const input = (overrides: object = {}) => ({ orderId: order.orderId, locale: "id", choice: { method: "qris" }, ...overrides });

describe("payOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    user = { id: "customer-1", role: "customer", fullName: "Uji" };
    getUser.mockResolvedValue({ data: { user: { email: order.email } } });
    createCharge.mockResolvedValue(qrisCharge);
    cancelCharge.mockResolvedValue(true);
    database();
  });

  it("charges the stored price with the chosen method, as the attempt the database opened, and keeps what Midtrans answered", async () => {
    expect(await payOrder(input())).toEqual({ ok: true });

    const [payload] = createCharge.mock.calls[0] as [ChargePayload];
    expect(payload.transaction_details).toEqual({ order_id: `${order.orderId}_1`, gross_amount: 85000 });
    expect(payload.payment_type).toBe("qris");
    expect(payload.customer_details).toEqual({ email: order.email, phone: order.phone });
    expect(rpc).toHaveBeenCalledWith("begin_payment_attempt", { p_order: order.orderId });
    expect(rpc).toHaveBeenCalledWith("attach_payment_details", { p_order: order.orderId, p_attempt: 1, p_details: qrisCharge.details });
  });

  it("names the service in the customer's language", async () => {
    await payOrder(input({ locale: "en" }));
    expect((createCharge.mock.calls[0] as [ChargePayload])[0].item_details[0].name).toBe("Regular Cleaning");
  });

  it("charges a bank and a card the way the customer chose, and passes a card's 3-D Secure page on", async () => {
    await payOrder(input({ choice: { method: "bank", bank: "bni" } }));
    expect((createCharge.mock.calls[0] as [ChargePayload])[0]).toMatchObject({ payment_type: "bank_transfer", bank_transfer: { bank: "bni" } });

    createCharge.mockResolvedValue({ details: { method: "card" }, authenticateUrl: "https://api.sandbox.veritrans.co.id/v2/token/rba/redirect/t" });
    expect(await payOrder(input({ choice: { method: "card", tokenId: "48111111-1114-abcdef" } }))).toEqual({
      ok: true,
      authenticateUrl: "https://api.sandbox.veritrans.co.id/v2/token/rba/redirect/t",
    });
    expect((createCharge.mock.calls[1] as [ChargePayload])[0]).toMatchObject({ credit_card: { token_id: "48111111-1114-abcdef" } });
  });

  it("says when a card was turned down at once", async () => {
    createCharge.mockResolvedValue({ details: { method: "card" }, declined: true });
    expect(await payOrder(input({ choice: { method: "card", tokenId: "48111111-1114-abcdef" } }))).toEqual({ ok: true, declined: true });
  });

  it("cancels the charge of the method the customer left, once the new attempt is open", async () => {
    database({ begin_payment_attempt: { data: [{ attempt: 3, previous_attempt: 2, previous_charge: true }] } });
    await payOrder(input());
    expect(cancelCharge).toHaveBeenCalledWith(`${order.orderId}_2`, expect.anything());
  });

  it("cancels the old Snap transaction of an order charged before payment moved to this page (its id is the order's own)", async () => {
    database({ begin_payment_attempt: { data: [{ attempt: 1, previous_attempt: 0, previous_charge: true }] } });
    await payOrder(input());
    expect(cancelCharge).toHaveBeenCalledWith(order.orderId, expect.anything());
  });

  it("has nothing to cancel on the first charge", async () => {
    await payOrder(input());
    expect(cancelCharge).not.toHaveBeenCalled();
  });

  it("refuses anyone but a customer, an order id that is not an id, a choice that is not offered, and an order that is not theirs", async () => {
    user = null;
    expect(await payOrder(input())).toEqual({ ok: false, error: "notCustomer" });
    user = { id: "customer-1", role: "customer", fullName: "Uji" };
    expect(await payOrder(input({ orderId: "../x" }))).toEqual({ ok: false, error: "notFound" });
    expect(await payOrder(input({ choice: { method: "cash" } }))).toEqual({ ok: false, error: "invalidChoice" });
    expect(await payOrder(input({ choice: { method: "bank", bank: "citibank" } }))).toEqual({ ok: false, error: "invalidChoice" });
    expect(await payOrder(input({ choice: { method: "card", tokenId: "" } }))).toEqual({ ok: false, error: "invalidChoice" });
    expect(await payOrder(input({ choice: { method: "card", tokenId: "4811 1111 1111 1114" } }))).toEqual({ ok: false, error: "invalidChoice" });
    database({ order_for_payment: { data: [] } });
    expect(await payOrder(input())).toEqual({ ok: false, error: "notFound" });
    expect(createCharge).not.toHaveBeenCalled();
  });

  it("does not charge an order that is no longer waiting for payment", async () => {
    database({ order_for_payment: { data: [{ ...row, status: "paid" }] } });
    expect(await payOrder(input())).toEqual({ ok: false, error: "notPayable" });
    database({ begin_payment_attempt: { error: { message: "order_not_payable" } } });
    expect(await payOrder(input())).toEqual({ ok: false, error: "notPayable" });
    expect(createCharge).not.toHaveBeenCalled();
  });

  it("stops after too many attempts on one order", async () => {
    database({ begin_payment_attempt: { error: { message: "attempts_exhausted" } } });
    expect(await payOrder(input())).toEqual({ ok: false, error: "tooManyAttempts" });
    expect(createCharge).not.toHaveBeenCalled();
  });

  it("says payment is not available now when Midtrans cannot be reached, refuses, or is not set up", async () => {
    for (const reason of ["not_configured", "refused", "network", "unexpected"] as const) {
      createCharge.mockRejectedValue(new PaymentError(reason));
      expect(await payOrder(input())).toEqual({ ok: false, error: "paymentUnavailable" });
    }
    expect(rpc).not.toHaveBeenCalledWith("attach_payment_details", expect.anything());
  });

  it("says so when the answer cannot be kept because the order moved on in the meantime", async () => {
    database({ attach_payment_details: { error: { message: "order_not_payable" } } });
    expect(await payOrder(input())).toEqual({ ok: false, error: "notPayable" });
  });
});

describe("changePaymentMethod", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    user = { id: "customer-1", role: "customer", fullName: "Uji" };
    cancelCharge.mockResolvedValue(true);
    database({ begin_payment_attempt: { data: [{ attempt: 2, previous_attempt: 1, previous_charge: true }] } });
  });

  it("opens a new attempt without a charge, and cancels the old one at Midtrans", async () => {
    expect(await changePaymentMethod({ orderId: order.orderId })).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("begin_payment_attempt", { p_order: order.orderId });
    expect(cancelCharge).toHaveBeenCalledWith(`${order.orderId}_1`, expect.anything());
    expect(createCharge).not.toHaveBeenCalled();
  });

  it("is only for the signed-in customer's own waiting order", async () => {
    user = null;
    expect(await changePaymentMethod({ orderId: order.orderId })).toEqual({ ok: false, error: "notCustomer" });
    user = { id: "customer-1", role: "customer", fullName: "Uji" };
    expect(await changePaymentMethod({ orderId: "nope" })).toEqual({ ok: false, error: "notFound" });
    database({ begin_payment_attempt: { error: { message: "order_not_payable" } } });
    expect(await changePaymentMethod({ orderId: order.orderId })).toEqual({ ok: false, error: "notPayable" });
  });
});
