import { describe, expect, it } from "vitest";
import { replayList } from "@/components/customer/replay-list";
import type { CustomerOrder } from "@/lib/booking/orders";

// D5 pass 5b, "Rekaman pekerjaan" (mocks Customer-Replay, Phone-Replay): the customer's own finished
// jobs that had a recording, newest first, each with whether it can still be played, and which one the
// page opens: the one in the address when it is one of them, else the newest still kept.

const now = Date.parse("2026-11-10T03:00:00.000Z");
const day = 86_400_000;
const base: CustomerOrder = {
  id: "a",
  serviceId: "regular",
  areaId: "jakarta-selatan",
  startsAt: "2026-11-05T02:00:00.000Z",
  endsAt: "2026-11-05T04:00:00.000Z",
  address: "Jl. Contoh",
  contactPhone: null,
  priceIdr: 85_000,
  status: "paid",
  createdAt: "2026-11-02T06:12:00.000Z",
  cleanerName: "W",
  cleanerPhotoUrl: null,
  checkedInAt: "2026-11-05T02:04:00.000Z",
  completedAt: "2026-11-05T04:02:00.000Z",
  recordingId: "rec-a",
  recordingExpiresAt: new Date(now + 2 * day).toISOString(),
  recordingDeleted: false,
  orderCode: "HK-1042",
  assignedAt: null,
  customerNote: "",
  paymentMethod: "qris",
};

const kept = { ...base, id: "kept" };
const older = { ...base, id: "older", completedAt: "2026-11-04T04:00:00.000Z", recordingId: "rec-b" };
const deleted = { ...base, id: "deleted", recordingDeleted: true, recordingId: "rec-c" };
const none = { ...base, id: "none", recordingId: null };
const running = { ...base, id: "running", completedAt: null };
const unpaid = { ...base, id: "unpaid", status: "pending_payment" as const };

describe("replayList", () => {
  it("lists the finished jobs with a recording, kept or deleted, and leaves out the rest", () => {
    const { items } = replayList([kept, running, deleted, none, unpaid, older], null, now);
    expect(items.map((item) => [item.order.id, item.state])).toEqual([
      ["kept", "available"],
      ["deleted", "expired"],
      ["older", "available"],
    ]);
  });

  it("opens the one in the address when it is the customer's own", () => {
    expect(replayList([kept, older], "older", now).selected?.order.id).toBe("older");
    expect(replayList([kept, older], "older", now).items.find((item) => item.selected)?.order.id).toBe("older");
  });

  it("opens the newest kept recording when the address names none, or one that is not in the list", () => {
    expect(replayList([deleted, kept, older], null, now).selected?.order.id).toBe("kept");
    expect(replayList([deleted, kept], "someone-else", now).selected?.order.id).toBe("kept");
  });

  it("opens a deleted one only when it was asked for, and nothing when there is nothing", () => {
    expect(replayList([deleted], null, now).selected?.order.id).toBe("deleted");
    expect(replayList([running, none], null, now)).toEqual({ items: [], selected: null });
  });
});
