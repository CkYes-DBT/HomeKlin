// Step 3 of booking, the payment and then its confirmation (the booking flow's layout, 2026-11-17):
// /orders/pay?order=<order id>. The order actions send the customer there and the confirmation email
// links to it; it sits under /orders, so the proxy and the page let only customers in
// (src/lib/auth/roles.ts). The old address, /orders?booked=<order id>, leads there
// (src/components/customer/booking-query.ts, paymentHrefFromOrders). Link and redirect add /en.

/** The payment page of an order. */
export function paymentStepHref(orderId: string): string {
  return `/orders/pay?${new URLSearchParams({ order: orderId }).toString()}`;
}
