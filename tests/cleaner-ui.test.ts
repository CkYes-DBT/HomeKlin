import { describe, expect, it } from "vitest";
import { localPhone, nextJobId, roundHours, streamFromStatus } from "@/components/cleaner/cleaner-views";

// The cleaner pages' small rules (D4, after the mocks Cleaner-Home, Cleaner-Jobs, Cleaner-Job and
// Cleaner-Live): how a phone number reads, the hours tile, which of today's jobs is "Berikutnya", and
// the live state the job page starts from (my_stream_status).

describe("localPhone", () => {
  it("writes an Indonesian number as people dial it, in groups of four", () => {
    expect(localPhone("+6281234567890")).toBe("0812 3456 7890");
    expect(localPhone("+628123456789")).toBe("0812 3456 789");
  });

  it("leaves another country's number as it is, and gives null for no number", () => {
    expect(localPhone("+6591234567")).toBe("+6591234567");
    expect(localPhone(null)).toBeNull();
    expect(localPhone("  ")).toBeNull();
  });
});

describe("roundHours", () => {
  it("keeps one decimal at most", () => {
    expect(roundHours(24)).toBe(24);
    expect(roundHours(1.4567)).toBe(1.5);
    expect(roundHours(0)).toBe(0);
  });

  it("never shows a negative or broken number", () => {
    expect(roundHours(-2)).toBe(0);
    expect(roundHours(Number.NaN)).toBe(0);
  });
});

describe("nextJobId", () => {
  const now = new Date("2026-11-05T02:00:00Z"); // 09.00 WIB
  const job = (id: string, startHourUtc: number, extra: Partial<{ checkedInAt: string; completedAt: string }> = {}) => ({
    id,
    startsAt: new Date(Date.UTC(2026, 10, 5, startHourUtc)).toISOString(),
    endsAt: new Date(Date.UTC(2026, 10, 5, startHourUtc + 2)).toISOString(),
    checkedInAt: extra.checkedInAt ?? null,
    completedAt: extra.completedAt ?? null,
  });

  it("is the first of today's jobs the cleaner can still do: in progress, open or later today", () => {
    expect(nextJobId([job("a", 2), job("b", 6)], now)).toBe("a");
    expect(nextJobId([job("a", 2, { checkedInAt: "2026-11-05T02:04:00Z" }), job("b", 6)], now)).toBe("a");
  });

  it("skips a job whose arrival window has closed", () => {
    // Started at 06.00 WIB and ended at 08.00 WIB, with no check-in: too late.
    expect(nextJobId([job("late", -1), job("b", 6)], now)).toBe("b");
  });

  it("is null when nothing is left to do today", () => {
    expect(nextJobId([job("late", -1)], now)).toBeNull();
    expect(nextJobId([], now)).toBeNull();
  });
});

describe("streamFromStatus", () => {
  it("starts the job page from the server's state of the stream", () => {
    expect(streamFromStatus("active")).toBe("active");
    expect(streamFromStatus("weak")).toBe("weak");
    expect(streamFromStatus("disconnected")).toBe("disconnected");
  });

  it("treats an ended stream, or none, as off", () => {
    expect(streamFromStatus("ended")).toBe("off");
    expect(streamFromStatus(null)).toBe("off");
  });
});
