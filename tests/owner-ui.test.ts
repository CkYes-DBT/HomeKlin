import { describe, expect, it } from "vitest";
import { growth, monthYear, payoutShares, signInDay, statusRows } from "@/components/owner/numbers";

// The owner pages' arithmetic (T29b; D3, after the mocks Owner-Overview, Owner-Partners and
// Owner-Admins): the growth against the period before, the payouts per partner agency with their
// share, orders by status with their share, the "since" month and an admin's last sign-in day. Pure
// rules; the pages render what these return.

describe("growth", () => {
  it("says how much a total rose or fell against the period before, in whole percent", () => {
    expect(growth(108, 100)).toEqual({ direction: "up", percent: 8 });
    expect(growth(97, 100)).toEqual({ direction: "down", percent: 3 });
    expect(growth(48_250_000, 44_675_926)).toEqual({ direction: "up", percent: 8 });
  });

  it("calls a change under half a percent the same", () => {
    expect(growth(1002, 1000)).toEqual({ direction: "same", percent: 0 });
    expect(growth(0, 0)).toEqual({ direction: "none", percent: 0 });
  });

  it("has nothing to compare with when the period before had nothing", () => {
    expect(growth(5000, 0)).toEqual({ direction: "none", percent: 0 });
  });
});

describe("payoutShares", () => {
  const row = (id: string, name: string, amountIdr: number) => ({ id, name, amountIdr });

  it("lists the agencies that were paid, largest first, with their share of the total", () => {
    const shares = payoutShares([row("a", "Kilap", 100_000), row("b", "Asri", 300_000), row("c", "Baru", 0)]);
    expect(shares.totalIdr).toBe(400_000);
    expect(shares.rows).toEqual([
      { id: "b", name: "Asri", amountIdr: 300_000, sharePercent: 75 },
      { id: "a", name: "Kilap", amountIdr: 100_000, sharePercent: 25 },
    ]);
  });

  it("rounds a share to one decimal and orders equal amounts by name", () => {
    const shares = payoutShares([row("z", "Zamrud", 100_000), row("a", "Asri", 100_000), row("m", "Melati", 100_000)]);
    expect(shares.rows.map((share) => [share.name, share.sharePercent])).toEqual([
      ["Asri", 33.3],
      ["Melati", 33.3],
      ["Zamrud", 33.3],
    ]);
  });

  it("has no rows when nothing was paid", () => {
    expect(payoutShares([row("a", "Asri", 0)])).toEqual({ totalIdr: 0, rows: [] });
  });
});

describe("signInDay", () => {
  // 14 Nov 2026, 10:00 in Jakarta.
  const now = new Date("2026-11-14T03:00:00.000Z");

  it("tells today and yesterday apart by the Jakarta calendar", () => {
    expect(signInDay("2026-11-14T01:02:00.000Z", now)).toBe("today");
    // 13 Nov 23:30 UTC is already 14 Nov in Jakarta.
    expect(signInDay("2026-11-13T23:30:00.000Z", now)).toBe("today");
    expect(signInDay("2026-11-13T10:40:00.000Z", now)).toBe("yesterday");
    expect(signInDay("2026-10-29T03:00:00.000Z", now)).toBe("earlier");
  });
});

describe("statusRows", () => {
  it("lists every status in a fixed order with its share of all orders", () => {
    expect(statusRows({ pending_payment: 1, paid: 2, failed: 1, cancelled: 0 })).toEqual([
      { status: "paid", count: 2, percent: 50 },
      { status: "pending_payment", count: 1, percent: 25 },
      { status: "failed", count: 1, percent: 25 },
      { status: "cancelled", count: 0, percent: 0 },
    ]);
  });

  it("shows no share when there are no orders yet", () => {
    expect(statusRows({ pending_payment: 0, paid: 0, failed: 0, cancelled: 0 }).map((row) => row.percent)).toEqual([0, 0, 0, 0]);
  });
});

describe("monthYear", () => {
  it("writes when a partner joined as a short month and year in Jakarta, in either language", () => {
    expect(monthYear("2026-03-10T05:00:00.000Z", "id")).toBe("Mar 2026");
    expect(monthYear("2026-08-01T03:00:00.000Z", "id")).toBe("Agu 2026");
    expect(monthYear("2026-08-01T03:00:00.000Z", "en")).toBe("Aug 2026");
    // 31 May 20:00 UTC is already 1 June in Jakarta.
    expect(monthYear("2026-05-31T20:00:00.000Z", "id")).toBe("Jun 2026");
  });
});
