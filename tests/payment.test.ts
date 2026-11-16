import { describe, expect, it, vi } from "vitest";
import {
  cancelCharge,
  chargePayload,
  createCharge,
  midtransOrderId,
  parseMidtransOrderId,
  PaymentError,
} from "@/lib/payment/midtrans";

// Paying on HomeKlin's own page with Midtrans' Core API (src/lib/payment/midtrans.ts): the charge
// request for each method the customer can choose, and what is made of Midtrans' answer. The Server
// Actions that call it are in tests/payment-actions.test.ts, the database rules against the test
// project in tests/integration/payment-attempts.test.ts.

const order = {
  orderId: "0b8f3c1e-1111-4222-8333-944455556666",
  serviceId: "regular",
  serviceName: "Pembersihan Rutin",
  priceIdr: 85000,
  email: "nadia@pelanggan-uji.id",
  phone: "+6281234567890",
};
const sandboxKey = "Mid-server-sandbox-abc123";

describe("midtransOrderId", () => {
  it("is the order's own id for the legacy attempt 0, and '<id>_<attempt>' after it", () => {
    expect(midtransOrderId(order.orderId, 0)).toBe(order.orderId);
    expect(midtransOrderId(order.orderId, 3)).toBe(`${order.orderId}_3`);
  });

  it("reads both forms back, and nothing else", () => {
    expect(parseMidtransOrderId(order.orderId)).toEqual({ orderId: order.orderId, attempt: 0 });
    expect(parseMidtransOrderId(`${order.orderId}_12`)).toEqual({ orderId: order.orderId, attempt: 12 });
    expect(parseMidtransOrderId(`${order.orderId.toUpperCase()}_2`)).toEqual({ orderId: order.orderId.toUpperCase(), attempt: 2 });
    for (const odd of ["", "payment_notif_test", `${order.orderId}_`, `${order.orderId}_x`, `${order.orderId}_1_2`, `${order.orderId}_0001`, `x${order.orderId}`]) {
      expect(parseMidtransOrderId(odd)).toBeNull();
    }
  });
});

describe("chargePayload", () => {
  const common = {
    transaction_details: { order_id: `${order.orderId}_1`, gross_amount: 85000 },
    item_details: [{ id: "regular", price: 85000, quantity: 1, name: "Pembersihan Rutin" }],
    customer_details: { email: order.email, phone: order.phone },
    custom_expiry: { expiry_duration: 60, unit: "minute" },
  };

  it("charges exactly the order's stored price, for one item, with the customer's contact and one hour to pay", () => {
    expect(chargePayload(order, { method: "qris" }, 1)).toEqual({
      ...common,
      payment_type: "qris",
      qris: { acquirer: "gopay" },
    });
  });

  it("asks for a virtual account at BCA, BNI or BRI", () => {
    for (const bank of ["bca", "bni", "bri"] as const) {
      expect(chargePayload(order, { method: "bank", bank }, 1)).toMatchObject({
        payment_type: "bank_transfer",
        bank_transfer: { bank },
      });
    }
  });

  it("asks for a Mandiri bill (Mandiri has no virtual account number, it has a biller code and a bill key)", () => {
    expect(chargePayload(order, { method: "bank", bank: "mandiri" }, 1)).toMatchObject({
      payment_type: "echannel",
      echannel: { bill_info1: "HomeKlin", bill_info2: expect.any(String) },
    });
  });

  it("charges a card from its one-time token, with 3-D Secure, and never holds the card number", () => {
    const payload = chargePayload(order, { method: "card", tokenId: "481111-1114-abc" }, 2);
    expect(payload).toMatchObject({
      payment_type: "credit_card",
      credit_card: { token_id: "481111-1114-abc", authentication: true },
      transaction_details: { order_id: `${order.orderId}_2` },
    });
    expect(JSON.stringify(payload)).not.toMatch(/card_number|cvv/);
  });

  it("keeps the item name within Midtrans' 50 characters, and leaves out contact it does not have", () => {
    const long = chargePayload({ ...order, serviceName: "x".repeat(80), email: undefined, phone: null }, { method: "qris" }, 1);
    expect(long.item_details[0].name).toHaveLength(50);
    expect(long.customer_details).toEqual({});
  });
});

describe("createCharge", () => {
  const request = (choice: Parameters<typeof chargePayload>[1]) => chargePayload(order, choice, 1);
  const respond = (body: object, status = 200) => vi.fn(async () => Response.json(body, { status }));

  it("asks Midtrans' sandbox Core API for the charge with the server key as Basic auth", async () => {
    const fetchFn = respond({
      status_code: "201", transaction_status: "pending", expiry_time: "2026-11-16 17:45:44",
      va_numbers: [{ bank: "bca", va_number: "22129765566838381184611" }],
    });

    await createCharge(request({ method: "bank", bank: "bca" }), { serverKey: sandboxKey, fetchFn });

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.sandbox.midtrans.com/v2/charge");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Basic ${Buffer.from(`${sandboxKey}:`).toString("base64")}`);
    expect(JSON.parse(String(init.body)).transaction_details.gross_amount).toBe(85000);
  });

  it("makes the virtual account number and its expiry (Midtrans tells the time in Jakarta) of a BCA, BNI or BRI charge", async () => {
    const fetchFn = respond({
      status_code: "201", transaction_status: "pending", expiry_time: "2026-11-16 17:45:44",
      va_numbers: [{ bank: "bni", va_number: "9882212948834654" }],
    });
    const { details, authenticateUrl } = await createCharge(request({ method: "bank", bank: "bni" }), { serverKey: sandboxKey, fetchFn });
    expect(details).toEqual({ method: "bank", bank: "bni", vaNumber: "9882212948834654", expiresAt: "2026-11-16T10:45:44.000Z" });
    expect(authenticateUrl).toBeUndefined();
  });

  it("makes the biller code and bill key of a Mandiri charge", async () => {
    const fetchFn = respond({ status_code: "201", transaction_status: "pending", biller_code: "70012", bill_key: "100921976939", expiry_time: "2026-11-16 17:45:48" });
    const { details } = await createCharge(request({ method: "bank", bank: "mandiri" }), { serverKey: sandboxKey, fetchFn });
    expect(details).toEqual({ method: "bank", bank: "mandiri", billerCode: "70012", billKey: "100921976939", expiresAt: "2026-11-16T10:45:48.000Z" });
  });

  it("makes the QR code's address of a QRIS charge", async () => {
    const fetchFn = respond({
      status_code: "201", transaction_status: "pending", expiry_time: "2026-11-16 17:45:48",
      actions: [
        { name: "generate-qr-code", method: "GET", url: "https://api.sandbox.midtrans.com/v2/qris/e0f28154/qr-code" },
        { name: "generate-qr-code-v2", method: "GET", url: "https://merchants-app.sbx.midtrans.com/v4/qris/gopay/A1/qr-code" },
      ],
    });
    const { details } = await createCharge(request({ method: "qris" }), { serverKey: sandboxKey, fetchFn });
    expect(details).toEqual({ method: "qris", qrUrl: "https://api.sandbox.midtrans.com/v2/qris/e0f28154/qr-code", expiresAt: "2026-11-16T10:45:48.000Z" });
  });

  it("sends a card to its 3-D Secure page, and keeps nothing but the method", async () => {
    const fetchFn = respond({ status_code: "201", transaction_status: "pending", redirect_url: "https://api.sandbox.veritrans.co.id/v2/token/rba/redirect/481111-1114-abc" });
    const result = await createCharge(request({ method: "card", tokenId: "t" }), { serverKey: sandboxKey, fetchFn });
    expect(result.details).toEqual({ method: "card" });
    expect(result.authenticateUrl).toBe("https://api.sandbox.veritrans.co.id/v2/token/rba/redirect/481111-1114-abc");
  });

  it("knows a card that went through at once, and one that was declined (the notification still decides the order)", async () => {
    const accepted = await createCharge(request({ method: "card", tokenId: "t" }), {
      serverKey: sandboxKey,
      fetchFn: respond({ status_code: "200", transaction_status: "capture", fraud_status: "accept" }),
    });
    expect(accepted).toEqual({ details: { method: "card" }, declined: false });

    const declined = await createCharge(request({ method: "card", tokenId: "t" }), {
      serverKey: sandboxKey,
      fetchFn: respond({ status_code: "202", transaction_status: "deny", fraud_status: "accept" }),
    });
    expect(declined).toEqual({ details: { method: "card" }, declined: true });
  });

  it("refuses to start without a server key, before calling anyone", async () => {
    const fetchFn = vi.fn();
    for (const serverKey of [undefined, ""]) {
      await expect(createCharge(request({ method: "qris" }), { serverKey, fetchFn })).rejects.toMatchObject({ reason: "not_configured" });
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("says why it failed: Midtrans refused (a method that is not switched on, a duplicate id), unreachable, or an answer it cannot use", async () => {
    await expect(createCharge(request({ method: "qris" }), { serverKey: sandboxKey, fetchFn: respond({ status_code: "402", status_message: "Payment channel is not activated" }) }))
      .rejects.toMatchObject({ reason: "refused" });
    await expect(createCharge(request({ method: "qris" }), { serverKey: sandboxKey, fetchFn: respond({ status_message: "Unauthorized" }, 401) }))
      .rejects.toMatchObject({ reason: "refused" });
    await expect(createCharge(request({ method: "qris" }), { serverKey: sandboxKey, fetchFn: vi.fn(async () => { throw new Error("offline"); }) }))
      .rejects.toMatchObject({ reason: "network" });
    // A virtual account without a number, a QR code of a stranger's site: nothing a customer could pay with.
    await expect(createCharge(request({ method: "bank", bank: "bca" }), { serverKey: sandboxKey, fetchFn: respond({ status_code: "201", va_numbers: [] }) }))
      .rejects.toMatchObject({ reason: "unexpected" });
    await expect(createCharge(request({ method: "qris" }), {
      serverKey: sandboxKey,
      fetchFn: respond({ status_code: "201", actions: [{ name: "generate-qr-code", url: "https://evil.example/qr" }] }),
    })).rejects.toMatchObject({ reason: "unexpected" });
    await expect(createCharge(request({ method: "card", tokenId: "t" }), {
      serverKey: sandboxKey,
      fetchFn: respond({ status_code: "201", redirect_url: "javascript:alert(1)" }),
    })).rejects.toBeInstanceOf(PaymentError);
  });
});

describe("cancelCharge", () => {
  it("cancels the old attempt's charge at Midtrans, and says whether it did", async () => {
    const fetchFn = vi.fn(async () => Response.json({ status_code: "200", transaction_status: "cancel" }));
    expect(await cancelCharge(`${order.orderId}_1`, { serverKey: sandboxKey, fetchFn })).toBe(true);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.sandbox.midtrans.com/v2/${order.orderId}_1/cancel`);
    expect(init.method).toBe("POST");
  });

  it("never throws: a charge that is gone or Midtrans being unreachable only returns false", async () => {
    expect(await cancelCharge("x_1", { serverKey: sandboxKey, fetchFn: vi.fn(async () => Response.json({ status_code: "404" }, { status: 404 })) })).toBe(false);
    expect(await cancelCharge("x_1", { serverKey: sandboxKey, fetchFn: vi.fn(async () => { throw new Error("offline"); }) })).toBe(false);
    expect(await cancelCharge("x_1", { serverKey: undefined })).toBe(false);
  });
});
