// How an order was paid, as the customer reads it (B8: Midtrans' payment_type, kept from the signed
// notification). The keys are message keys of "PaymentMethod"; a type HomeKlin has no word for reads
// as "other", and an order not paid yet has none.

export type PaymentMethodKey = "qris" | "bankTransfer" | "card" | "ewallet" | "store" | "other";

const methods: Record<string, PaymentMethodKey> = {
  qris: "qris",
  bank_transfer: "bankTransfer",
  echannel: "bankTransfer",
  permata: "bankTransfer",
  credit_card: "card",
  gopay: "ewallet",
  shopeepay: "ewallet",
  cstore: "store",
};

export function paymentMethodKey(type: string | null): PaymentMethodKey | null {
  if (!type) return null;
  return Object.hasOwn(methods, type) ? methods[type] : "other";
}
