import { describe, expect, it } from "vitest";
import { adminRecordingState, monitorCounts, parseRecordingParam, pastJobs, waitingForCheckIn } from "@/components/back-office/admin-console";
import type { AdminJob } from "@/lib/jobs/jobs";

// The admin console (T26): which past jobs the recordings page shows and what it says about each
// recording. Pure rules; the pages render what these return.

// Wednesday 4 November 2026, 10.00 WIB.
const now = new Date("2026-11-04T03:00:00.000Z");
const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;
const at = (offset: number) => new Date(now.getTime() + offset).toISOString();

function job(id: string, overrides: Partial<AdminJob> = {}): AdminJob {
  return {
    id,
    serviceId: "regular",
    areaId: "jakarta-timur",
    startsAt: at(hour),
    endsAt: at(3 * hour),
    cleanerId: null,
    cleanerName: "Uji Petugas",
    checkedInAt: null,
    completedAt: null,
    recordingId: null,
    recordingExpiresAt: null,
    recordingDeleted: false,
    agencyName: "Uji Agensi",
    orderCode: "HK-1001",
    ...overrides,
  };
}

describe("pastJobs", () => {
  it("keeps the jobs finished in the last 30 days, the most recently finished first", () => {
    const jobs = [
      job("open", { checkedInAt: at(-hour) }),
      job("finished-yesterday", { completedAt: at(-day) }),
      job("finished-today", { completedAt: at(-hour) }),
      job("finished-29-days-ago", { completedAt: at(-29 * day) }),
      job("finished-31-days-ago", { completedAt: at(-31 * day) }),
    ];
    expect(pastJobs(jobs, now).map((entry) => entry.id)).toEqual(["finished-today", "finished-yesterday", "finished-29-days-ago"]);
  });
});

describe("adminRecordingState", () => {
  const finished = { completedAt: at(-day) };

  it("is available while the recording is kept", () => {
    expect(adminRecordingState(job("a", { ...finished, recordingId: "r", recordingExpiresAt: at(6 * day) }), now)).toBe("available");
  });

  it("is expired once the 7 days are over or the cleanup deleted it", () => {
    expect(adminRecordingState(job("a", { ...finished, recordingId: "r", recordingExpiresAt: at(-minute) }), now)).toBe("expired");
    expect(
      adminRecordingState(job("b", { ...finished, recordingId: "r", recordingExpiresAt: at(day), recordingDeleted: true }), now),
    ).toBe("expired");
  });

  it("is none for a job without a recording", () => {
    expect(adminRecordingState(job("a", finished), now)).toBe("none");
  });
});

describe("parseRecordingParam", () => {
  it("accepts one recording id and nothing else", () => {
    const id = "6f1c2a7e-3b4d-4c5e-9f60-718293a4b5c6";
    expect(parseRecordingParam(id)).toBe(id);
    expect(parseRecordingParam([id, "other"])).toBe(id);
    expect(parseRecordingParam("not-an-id")).toBeNull();
    expect(parseRecordingParam(undefined)).toBeNull();
  });
});

describe("waitingForCheckIn", () => {
  // Today in Jakarta is Wednesday 4 November: from 3 Nov 17.00 UTC to 4 Nov 17.00 UTC.
  it("keeps today's jobs with a cleaner and no check-in yet, the earliest start first", () => {
    const jobs = [
      job("later-today", { startsAt: at(5 * hour) }),
      job("late-this-morning", { startsAt: at(-2 * hour) }),
      job("no-cleaner", { cleanerName: null }),
      job("checked-in", { checkedInAt: at(-hour) }),
      job("finished", { completedAt: at(-hour) }),
      job("tomorrow", { startsAt: at(day) }),
      job("yesterday", { startsAt: at(-day) }),
    ];
    expect(waitingForCheckIn(jobs, now).map((entry) => entry.id)).toEqual(["late-this-morning", "later-today"]);
  });

  it("uses the Jakarta date, not the UTC one", () => {
    // 23.30 WIB on 4 November is still 4 November in Jakarta, though 16.30 UTC; 00.30 WIB on 5 November
    // is 4 November in UTC but tomorrow in Jakarta.
    const lateEvening = new Date("2026-11-04T16:30:00.000Z").toISOString();
    const pastMidnight = new Date("2026-11-04T17:30:00.000Z").toISOString();
    const jobs = [job("late-evening", { startsAt: lateEvening }), job("past-midnight", { startsAt: pastMidnight })];
    expect(waitingForCheckIn(jobs, now).map((entry) => entry.id)).toEqual(["late-evening"]);
  });
});

describe("monitorCounts", () => {
  it("counts the streams in progress, the ones with trouble (weak or disconnected) and the jobs waiting", () => {
    const streams = [{ status: "active" }, { status: "weak" }, { status: "disconnected" }, { status: "active" }] as const;
    expect(monitorCounts(streams, 3)).toEqual({ live: 4, troubled: 2, waiting: 3 });
    expect(monitorCounts([], 0)).toEqual({ live: 0, troubled: 0, waiting: 0 });
  });

  it("does not count a stream that has ended", () => {
    expect(monitorCounts([{ status: "ended" }, { status: "active" }], 0)).toEqual({ live: 1, troubled: 0, waiting: 0 });
  });
});
