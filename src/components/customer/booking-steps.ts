// The three steps of ordering (D5, mocks Main, Customer-Booking, Customer-Payment and Customer-Confirmed):
// 1 Layanan (/services: service, area and time), 2 Pesan (/pesan: address, contact, consent),
// 3 Bayar (/orders?booked=<id>: Midtrans). "done" is the confirmation after a successful payment.

export type BookingStepKey = "service" | "details" | "payment";
export type BookingStepState = "done" | "current" | "upcoming";
export type BookingStep = { key: BookingStepKey; number: 1 | 2 | 3; state: BookingStepState };

const order: { key: BookingStepKey; number: 1 | 2 | 3 }[] = [
  { key: "service", number: 1 },
  { key: "details", number: 2 },
  { key: "payment", number: 3 },
];

export function bookingSteps(current: 1 | 2 | 3 | "done"): BookingStep[] {
  return order.map((step) => ({
    ...step,
    state: current === "done" || step.number < current ? "done" : step.number === current ? "current" : "upcoming",
  }));
}
