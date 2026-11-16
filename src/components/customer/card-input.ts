// The card fields of the payment step. The number, expiry and CVV are typed into fields that belong to
// no form and are sent nowhere but to Midtrans' tokenizer in the browser (midtrans-card.ts), which swaps
// them for a one-time token; HomeKlin's server only ever sees the token. These functions shape what is
// typed. Midtrans does the real checking (a number that is not a card comes back as a message).

/** The card number as typed: digits only, at most 19 (the longest card number), in groups of four. */
export function formatCardNumber(typed: string): string {
  const digits = typed.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** The expiry as typed ("MM/YY"): the slash comes by itself after the month. */
export function formatExpiry(typed: string): string {
  const digits = typed.replace(/\D/g, "").slice(0, 6);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

export type CardFields = { number: string; expiry: string; cvv: string };

/** What Midtrans' tokenizer takes (MidtransNew3ds.getCardToken). */
export type CardData = { card_number: string; card_exp_month: string; card_exp_year: string; card_cvv: string };

/** The tokenizer's input, or null when the fields cannot be a card yet. */
export function parseCard({ number, expiry, cvv }: CardFields): CardData | null {
  const digits = number.replace(/\D/g, "");
  const date = /^(0[1-9]|1[0-2])\/(\d{2}|\d{4})$/.exec(expiry.trim());
  if (digits.length < 12 || digits.length > 19 || !date || !/^\d{3,4}$/.test(cvv)) return null;
  // Two-digit years are this century's; a four-digit year is as typed.
  const year = date[2].length === 2 ? `20${date[2]}` : date[2];
  return { card_number: digits, card_exp_month: date[1], card_exp_year: year, card_cvv: cvv };
}
