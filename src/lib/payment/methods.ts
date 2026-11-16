// The ways to pay on the payment step, as plain data that both the server and the browser read (no
// server code in here, so a client component can import it). The charge itself is in ./midtrans.ts.

/** The banks the payment step offers. Mandiri is a bill (biller code and bill key), the others a virtual account. */
export const banks = ["bca", "mandiri", "bni", "bri"] as const;
export type Bank = (typeof banks)[number];

/** What the customer chose on the payment step. A card is a one-time token from Midtrans, never its number. */
export type PaymentChoice =
  | { method: "qris" }
  | { method: "bank"; bank: Bank }
  | { method: "card"; tokenId: string };

/** What the customer needs to pay with the current attempt; kept on the order (orders.payment_details). */
export type PaymentDetails =
  | { method: "qris"; qrUrl: string; expiresAt: string | null }
  | { method: "bank"; bank: Bank; vaNumber?: string; billerCode?: string; billKey?: string; expiresAt: string | null }
  | { method: "card" };

const addresses = /^https:\/\/([a-z0-9-]+\.)+(midtrans\.com|veritrans\.co\.id)\//;

/**
 * The payment details of an order as the database kept them, or null when they are missing or not in the
 * shape this code makes (a column is JSON, so it is checked again before the page shows it).
 */
export function readPaymentDetails(value: unknown): PaymentDetails | null {
  if (typeof value !== "object" || value === null) return null;
  const details = value as Record<string, unknown>;
  const expiresAt = typeof details.expiresAt === "string" && !Number.isNaN(Date.parse(details.expiresAt)) ? details.expiresAt : null;
  if (details.method === "card") return { method: "card" };
  if (details.method === "qris") {
    return typeof details.qrUrl === "string" && addresses.test(details.qrUrl) ? { method: "qris", qrUrl: details.qrUrl, expiresAt } : null;
  }
  if (details.method === "bank" && banks.includes(details.bank as Bank)) {
    const text = (key: string) => (typeof details[key] === "string" && /^\d{3,30}$/.test(details[key]) ? (details[key] as string) : undefined);
    const bank = details.bank as Bank;
    if (bank === "mandiri") {
      const billerCode = text("billerCode");
      const billKey = text("billKey");
      return billerCode && billKey ? { method: "bank", bank, billerCode, billKey, expiresAt } : null;
    }
    const vaNumber = text("vaNumber");
    return vaNumber ? { method: "bank", bank, vaNumber, expiresAt } : null;
  }
  return null;
}

/** Midtrans' address rule, shared with the charge: only Midtrans' own pages are ever shown or opened. */
export function isMidtransAddress(value: string): boolean {
  return addresses.test(value);
}
