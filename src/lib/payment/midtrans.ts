// Midtrans Core API: charging one payment method chosen on HomeKlin's own payment step, here always the
// Sandbox, where payments are simulated and no money moves (markdown/SPEC.md: "Payment via Midtrans
// Sandbox"). The server key stays on the server (MIDTRANS_SERVER_KEY). Requests only ever go to the
// Sandbox address below, and the Sandbox refuses production keys, so a production key put in by mistake
// can never charge anyone. (Sandbox keys of newer Midtrans accounts no longer start with "SB-", so the
// key itself is not checked.) Plain HTTPS, no SDK. A card's number never reaches HomeKlin: the browser
// swaps it for a one-time token at Midtrans (midtrans-new-3ds.js, needs the public client key) and only
// the token comes here.
// Sources: https://docs.midtrans.com/reference/core-api-overview, the pages for "Bank Transfer",
// "Mandiri Bill Payment", "QRIS" and "Credit Card" under https://docs.midtrans.com/reference/ and
// https://docs.midtrans.com/docs/https-notification-webhooks

import { isMidtransAddress, type Bank, type PaymentChoice, type PaymentDetails } from "./methods";

export { banks, type Bank, type PaymentChoice, type PaymentDetails } from "./methods";

const apiUrl = "https://api.sandbox.midtrans.com/v2";

export type PaymentErrorReason = "not_configured" | "refused" | "unexpected" | "network";

export class PaymentError extends Error {
  constructor(readonly reason: PaymentErrorReason) {
    super(`Midtrans payment could not be started (${reason}).`);
    this.name = "PaymentError";
  }
}

/**
 * Midtrans knows every attempt to pay an order as "<order id>_<attempt>", because an order id can be used
 * only once there (changing method means a new charge). Attempt 0 is the plain id: the Snap transactions
 * made before payment moved to HomeKlin's page.
 */
export function midtransOrderId(orderId: string, attempt: number): string {
  return attempt === 0 ? orderId : `${orderId}_${attempt}`;
}

const idForm = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_([1-9]\d{0,2}))?$/i;

/** The order and attempt a Midtrans order id stands for, or null when it is not one of HomeKlin's. */
export function parseMidtransOrderId(id: string): { orderId: string; attempt: number } | null {
  const match = idForm.exec(id);
  return match ? { orderId: match[1], attempt: match[2] ? Number(match[2]) : 0 } : null;
}

export type PaymentOrder = {
  orderId: string;
  serviceId: string;
  serviceName: string;
  /** Whole rupiah, as stored on the order when it was booked. */
  priceIdr: number;
  email: string | undefined;
  phone: string | null;
};

export type ChargePayload = {
  payment_type: "qris" | "bank_transfer" | "echannel" | "credit_card";
  transaction_details: { order_id: string; gross_amount: number };
  item_details: { id: string; price: number; quantity: number; name: string }[];
  customer_details: { email?: string; phone?: string };
  custom_expiry: { expiry_duration: number; unit: "minute" };
  qris?: { acquirer: "gopay" };
  bank_transfer?: { bank: Exclude<Bank, "mandiri"> };
  echannel?: { bill_info1: string; bill_info2: string };
  credit_card?: { token_id: string; authentication: true };
};

/**
 * The charge for an order and the chosen method: one item at the order's stored price (never a price
 * from the browser), the customer's contact, one hour to pay.
 */
export function chargePayload(order: PaymentOrder, choice: PaymentChoice, attempt: number): ChargePayload {
  const customer: ChargePayload["customer_details"] = {};
  if (order.email) customer.email = order.email;
  if (order.phone) customer.phone = order.phone;
  const base = {
    transaction_details: { order_id: midtransOrderId(order.orderId, attempt), gross_amount: order.priceIdr },
    // gross_amount must equal the sum of the items; item names are at most 50 characters.
    item_details: [{ id: order.serviceId, price: order.priceIdr, quantity: 1, name: order.serviceName.slice(0, 50) }],
    customer_details: customer,
    custom_expiry: { expiry_duration: 60, unit: "minute" as const },
  };
  switch (choice.method) {
    case "qris":
      return { ...base, payment_type: "qris", qris: { acquirer: "gopay" } };
    case "bank":
      if (choice.bank === "mandiri") {
        return { ...base, payment_type: "echannel", echannel: { bill_info1: "HomeKlin", bill_info2: "Pesanan" } };
      }
      return { ...base, payment_type: "bank_transfer", bank_transfer: { bank: choice.bank } };
    case "card":
      return { ...base, payment_type: "credit_card", credit_card: { token_id: choice.tokenId, authentication: true } };
  }
}

type Options = { serverKey: string | undefined; fetchFn?: typeof fetch };

export type Charge = {
  details: PaymentDetails;
  /** A card: Midtrans' 3-D Secure page, to be shown to the customer in the page (MidtransNew3ds.authenticate). */
  authenticateUrl?: string;
  /** A card that Midtrans turned down at once. The order still changes only by the signed notification. */
  declined?: boolean;
};

type ChargeAnswer = {
  status_code?: unknown;
  transaction_status?: unknown;
  fraud_status?: unknown;
  expiry_time?: unknown;
  va_numbers?: unknown;
  biller_code?: unknown;
  bill_key?: unknown;
  redirect_url?: unknown;
  actions?: unknown;
};

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** Midtrans tells times in Jakarta time without saying so ("2026-11-16 17:45:44"). */
function expiry(value: unknown): string | null {
  const parsed = new Date(`${text(value).replace(" ", "T")}+07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function readCharge(choice: PaymentChoice, answer: ChargeAnswer): Charge {
  const expiresAt = expiry(answer.expiry_time);
  if (choice.method === "qris") {
    const actions = Array.isArray(answer.actions) ? (answer.actions as { name?: unknown; url?: unknown }[]) : [];
    const action = actions.find((a) => a.name === "generate-qr-code") ?? actions.find((a) => a.name === "generate-qr-code-v2");
    const qrUrl = text(action?.url);
    if (!isMidtransAddress(qrUrl)) throw new PaymentError("unexpected");
    return { details: { method: "qris", qrUrl, expiresAt } };
  }
  if (choice.method === "bank") {
    if (choice.bank === "mandiri") {
      const billerCode = text(answer.biller_code);
      const billKey = text(answer.bill_key);
      if (!/^\d{3,12}$/.test(billerCode) || !/^\d{6,20}$/.test(billKey)) throw new PaymentError("unexpected");
      return { details: { method: "bank", bank: "mandiri", billerCode, billKey, expiresAt } };
    }
    const accounts = Array.isArray(answer.va_numbers) ? (answer.va_numbers as { bank?: unknown; va_number?: unknown }[]) : [];
    const vaNumber = text(accounts.find((account) => account.bank === choice.bank)?.va_number);
    if (!/^\d{6,30}$/.test(vaNumber)) throw new PaymentError("unexpected");
    return { details: { method: "bank", bank: choice.bank, vaNumber, expiresAt } };
  }
  // A card.
  const status = text(answer.transaction_status);
  if (status === "deny" || status === "failure" || answer.fraud_status === "deny") {
    return { details: { method: "card" }, declined: true };
  }
  if (status === "capture" || status === "settlement") return { details: { method: "card" }, declined: false };
  const authenticateUrl = text(answer.redirect_url);
  if (!isMidtransAddress(authenticateUrl)) throw new PaymentError("unexpected");
  return { details: { method: "card" }, authenticateUrl };
}

/** Asks Midtrans to charge the chosen method, and returns what the customer needs to pay. */
export async function createCharge(payload: ChargePayload, { serverKey, fetchFn = fetch }: Options): Promise<Charge> {
  if (!serverKey) throw new PaymentError("not_configured");

  let response: Response;
  try {
    response = await fetchFn(`${apiUrl}/charge`, {
      method: "POST",
      headers: authHeaders(serverKey, true),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new PaymentError("network");
  }

  const answer = (await response.json().catch(() => null)) as ChargeAnswer | null;
  // Midtrans reports the result in the body's status_code (200 accepted, 201 pending, 202 denied card,
  // 4xx the request was wrong or the method is not switched on for this account).
  const code = text(answer?.status_code);
  if (!answer || (!response.ok && !code.startsWith("2")) || !/^20[012]$/.test(code)) throw new PaymentError("refused");
  return readCharge(payloadChoice(payload), answer);
}

/** Which choice a payload was made for, so the answer is read the way the request asked. */
function payloadChoice(payload: ChargePayload): PaymentChoice {
  switch (payload.payment_type) {
    case "qris":
      return { method: "qris" };
    case "echannel":
      return { method: "bank", bank: "mandiri" };
    case "bank_transfer":
      return { method: "bank", bank: payload.bank_transfer?.bank ?? "bca" };
    case "credit_card":
      return { method: "card", tokenId: payload.credit_card?.token_id ?? "" };
  }
}

/**
 * Cancels a charge the customer left (they changed method), so the old virtual account or QR code can
 * no longer be paid. Best effort: false when it could not be done, never an error, because the new
 * attempt must go on and an old attempt's cancellation can no longer change the order.
 */
export async function cancelCharge(midtransId: string, { serverKey, fetchFn = fetch }: Options): Promise<boolean> {
  if (!serverKey) return false;
  try {
    const response = await fetchFn(`${apiUrl}/${encodeURIComponent(midtransId)}/cancel`, {
      method: "POST",
      headers: authHeaders(serverKey, false),
      signal: AbortSignal.timeout(10_000),
    });
    // As with a charge, the answer's own status_code tells the result (412: it cannot be cancelled any more).
    const answer = (await response.json().catch(() => null)) as { status_code?: unknown } | null;
    return response.ok && text(answer?.status_code) === "200";
  } catch {
    return false;
  }
}

function authHeaders(serverKey: string, json: boolean): Record<string, string> {
  return {
    authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
    accept: "application/json",
    ...(json ? { "content-type": "application/json" } : {}),
  };
}
