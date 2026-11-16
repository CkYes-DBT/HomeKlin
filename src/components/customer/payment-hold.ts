// How long an unpaid order keeps its time (step 3, /orders?booked=<id>). release_unpaid_orders()
// cancels an order still waiting for payment 2 hours after it was made and gives its place back
// (supabase/migrations/20261105090000_security_fixes.sql); a Midtrans payment page, once opened, lasts
// 60 minutes (src/lib/payment/midtrans.ts, expiry).

export const unpaidHoldHours = 2;
export const paymentPageMinutes = 60;

/** The moment an unpaid order made at `createdAt` loses its time (ISO 8601, UTC). */
export function unpaidHoldUntil(createdAt: string): string {
  return new Date(Date.parse(createdAt) + unpaidHoldHours * 3_600_000).toISOString();
}
