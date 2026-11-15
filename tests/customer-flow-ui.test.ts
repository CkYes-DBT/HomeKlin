import { describe, expect, it } from "vitest";
import { bookingSteps } from "@/components/customer/booking-steps";
import { orderTimeline } from "@/components/customer/order-timeline";
import { splitOrders } from "@/components/customer/orders-overview-data";
import { paymentMethodKey } from "@/components/customer/payment-method";
import { windowDays } from "@/components/customer/service-step-data";
import type { CustomerOrder } from "@/lib/booking/orders";

// D5 (pass 5a), the customer's booking flow and orders after the Main, Customer-* and Phone-* mocks:
// the pure rules behind the three steps (Layanan, Pesan, Bayar), the order page's status steps, the
// payment method as the customer reads it, the home's split into "Sedang berlangsung" and history,
// and the days of step 1's time chips (full windows included, marked as such).

const base: CustomerOrder = {
  id: "00000000-0000-4000-8000-000000000001",
  serviceId: "regular",
  areaId: "jakarta-selatan",
  startsAt: "2026-11-05T02:00:00.000Z",
  endsAt: "2026-11-05T04:00:00.000Z",
  address: "Jl. Contoh No. 12",
  contactPhone: "+6281234567890",
  priceIdr: 85_000,
  status: "paid",
  createdAt: "2026-11-02T06:12:00.000Z",
  cleanerName: null,
  cleanerPhotoUrl: null,
  checkedInAt: null,
  completedAt: null,
  recordingId: null,
  recordingExpiresAt: null,
  recordingDeleted: false,
  orderCode: "HK-1042",
  assignedAt: null,
  customerNote: "",
  paymentMethod: "qris",
};

describe("bookingSteps", () => {
  it("marks the steps before the current one done, the current one current and the rest upcoming", () => {
    expect(bookingSteps(1).map((step) => step.state)).toEqual(["current", "upcoming", "upcoming"]);
    expect(bookingSteps(2).map((step) => step.state)).toEqual(["done", "current", "upcoming"]);
    expect(bookingSteps(3).map((step) => step.state)).toEqual(["done", "done", "current"]);
  });

  it("marks every step done once the order is paid", () => {
    expect(bookingSteps("done").map((step) => step.state)).toEqual(["done", "done", "done"]);
  });

  it("keeps the three steps in order, numbered 1 to 3", () => {
    expect(bookingSteps(1).map((step) => [step.key, step.number])).toEqual([
      ["service", 1],
      ["details", 2],
      ["payment", 3],
    ]);
  });
});

describe("orderTimeline", () => {
  const keys = (order: CustomerOrder) => orderTimeline(order).map((step) => `${step.key}:${step.state}`);

  it("a paid order waiting for its Petugas: ordered and paid done, assigning current", () => {
    expect(keys(base)).toEqual([
      "ordered:done",
      "paid:done",
      "assigned:current",
      "checkedIn:upcoming",
      "inProgress:upcoming",
      "completed:upcoming",
    ]);
  });

  it("an order waiting for payment: the payment is the current step", () => {
    expect(keys({ ...base, status: "pending_payment", paymentMethod: null })).toEqual([
      "ordered:done",
      "paid:current",
      "assigned:upcoming",
      "checkedIn:upcoming",
      "inProgress:upcoming",
      "completed:upcoming",
    ]);
  });

  it("a job in progress: checked in done with its time, in progress current", () => {
    const order = {
      ...base,
      cleanerName: "Wulan Anggraeni",
      assignedAt: "2026-11-03T01:00:00.000Z",
      checkedInAt: "2026-11-05T02:04:00.000Z",
    };
    const steps = orderTimeline(order);
    expect(steps.map((step) => `${step.key}:${step.state}`)).toEqual([
      "ordered:done",
      "paid:done",
      "assigned:done",
      "checkedIn:done",
      "inProgress:current",
      "completed:upcoming",
    ]);
    expect(steps.find((step) => step.key === "checkedIn")?.at).toBe("2026-11-05T02:04:00.000Z");
    expect(steps.find((step) => step.key === "assigned")?.at).toBe("2026-11-03T01:00:00.000Z");
    expect(steps.find((step) => step.key === "ordered")?.at).toBe(base.createdAt);
  });

  it("an unfinished job's last step carries the window's end as an estimate", () => {
    const last = orderTimeline(base).at(-1);
    expect(last).toMatchObject({ key: "completed", state: "upcoming", at: base.endsAt, estimate: true });
  });

  it("a finished job: every step done, finished at its real time", () => {
    const order = {
      ...base,
      cleanerName: "Wulan Anggraeni",
      checkedInAt: "2026-11-05T02:04:00.000Z",
      completedAt: "2026-11-05T03:58:00.000Z",
    };
    const steps = orderTimeline(order);
    expect(steps.every((step) => step.state === "done")).toBe(true);
    expect(steps.at(-1)).toMatchObject({ at: "2026-11-05T03:58:00.000Z", estimate: false });
  });

  it("an assigned order from before B3 (no assigned time) is still assigned", () => {
    const step = orderTimeline({ ...base, cleanerName: "Wulan Anggraeni" }).find((candidate) => candidate.key === "assigned");
    expect(step).toMatchObject({ state: "done", at: null });
  });

  it("a failed or cancelled order has no steps to follow", () => {
    expect(orderTimeline({ ...base, status: "failed" })).toEqual([]);
    expect(orderTimeline({ ...base, status: "cancelled" })).toEqual([]);
  });
});

describe("paymentMethodKey", () => {
  it("names the Midtrans payment types the customer chooses from", () => {
    expect(paymentMethodKey("qris")).toBe("qris");
    expect(paymentMethodKey("bank_transfer")).toBe("bankTransfer");
    expect(paymentMethodKey("echannel")).toBe("bankTransfer");
    expect(paymentMethodKey("permata")).toBe("bankTransfer");
    expect(paymentMethodKey("credit_card")).toBe("card");
    expect(paymentMethodKey("gopay")).toBe("ewallet");
    expect(paymentMethodKey("shopeepay")).toBe("ewallet");
    expect(paymentMethodKey("cstore")).toBe("store");
  });

  it("has a plain word for any other type, and nothing before the payment", () => {
    expect(paymentMethodKey("akulaku")).toBe("other");
    expect(paymentMethodKey(null)).toBeNull();
    expect(paymentMethodKey("")).toBeNull();
  });
});

describe("splitOrders", () => {
  it("puts jobs in progress under Sedang berlangsung and keeps the rest in order", () => {
    const live = { ...base, id: "live", cleanerName: "W", checkedInAt: "2026-11-05T02:04:00.000Z" };
    const waiting = { ...base, id: "waiting", status: "pending_payment" as const };
    const done = { ...base, id: "done", cleanerName: "W", checkedInAt: base.startsAt, completedAt: base.endsAt };
    const { ongoing, history } = splitOrders([waiting, live, done]);
    expect(ongoing.map((order) => order.id)).toEqual(["live"]);
    expect(history.map((order) => order.id)).toEqual(["waiting", "done"]);
  });

  it("a customer without a job in progress has only history", () => {
    expect(splitOrders([base]).ongoing).toEqual([]);
  });
});

describe("windowDays (step 1's time chips)", () => {
  // Jakarta is UTC+7: 01:00Z is 08.00 WIB.
  const now = new Date("2026-11-04T03:00:00.000Z");
  const windows = [
    { startsAt: "2026-11-05T06:00:00.000Z", endsAt: "2026-11-05T08:00:00.000Z", isFull: false },
    { startsAt: "2026-11-05T01:00:00.000Z", endsAt: "2026-11-05T03:00:00.000Z", isFull: true },
    { startsAt: "2026-11-06T01:00:00.000Z", endsAt: "2026-11-06T03:00:00.000Z", isFull: true },
  ];

  it("groups the windows by their Jakarta day, in time order, keeping whether each is full", () => {
    const days = windowDays(windows, now);
    expect(days.map((day) => day.date)).toEqual(["2026-11-05", "2026-11-06"]);
    expect(days[0].windows.map((window) => [window.startsAt, window.isFull])).toEqual([
      ["2026-11-05T01:00:00.000Z", true],
      ["2026-11-05T06:00:00.000Z", false],
    ]);
  });

  it("says whether a day has any free window left", () => {
    const days = windowDays(windows, now);
    expect(days.map((day) => day.hasFree)).toEqual([true, false]);
  });
});
