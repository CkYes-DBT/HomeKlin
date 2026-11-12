import { z } from "zod";
import type { AdminJob } from "@/lib/jobs/jobs";
import type { StreamStatus } from "@/lib/stream/streams";

// The admin console's rules (T26, M1): which past jobs the recordings page shows and what it says
// about each recording, which recording ?recording= asks for, and which of today's jobs the live
// monitor shows as not checked in yet, with the counts of its summary line. Pure, tested in
// tests/admin-console.test.ts; the pages render what these return.

const day = 24 * 3_600_000;

/** How many past days of finished jobs the recordings page lists (recordings are kept for 7). */
export const pastJobDays = 30;

/** Jobs finished in the last 30 days, the most recently finished first. */
export function pastJobs(jobs: readonly AdminJob[], now: Date): AdminJob[] {
  const since = now.getTime() - pastJobDays * day;
  return jobs
    .filter((job) => job.completedAt !== null && Date.parse(job.completedAt) >= since)
    .sort((a, b) => Date.parse(b.completedAt ?? "") - Date.parse(a.completedAt ?? ""));
}

/** available: it can be played; expired: deleted after its 7 days; none: the job has no recording. */
export type AdminRecordingState = "available" | "expired" | "none";

export function adminRecordingState(
  job: Pick<AdminJob, "recordingId" | "recordingExpiresAt" | "recordingDeleted">,
  now: Date,
): AdminRecordingState {
  if (!job.recordingId) return "none";
  if (job.recordingDeleted || !job.recordingExpiresAt || Date.parse(job.recordingExpiresAt) <= now.getTime()) return "expired";
  return "available";
}

const recordingParam = z.uuid();

/** The recording to play from ?recording=, or null for none or anything that is not an id. */
export function parseRecordingParam(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  const parsed = recordingParam.safeParse(first);
  return parsed.success ? parsed.data : null;
}

const jakartaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * The live monitor's "Belum check-in" cards (M1, H1): today's jobs (the Jakarta date) that have a
 * cleaner but no check-in and are not finished, the earliest start first.
 */
export function waitingForCheckIn(jobs: readonly AdminJob[], now: Date): AdminJob[] {
  const today = jakartaDate.format(now);
  return jobs
    .filter(
      (job) =>
        job.cleanerName !== null &&
        job.checkedInAt === null &&
        job.completedAt === null &&
        jakartaDate.format(new Date(job.startsAt)) === today,
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export type MonitorCounts = { live: number; troubled: number; waiting: number };

/**
 * The live monitor's summary line: the streams in progress, those of them with trouble (a weak
 * signal or disconnected), and the jobs not checked in yet. A stream that has ended counts as neither.
 */
export function monitorCounts(streams: readonly { status: StreamStatus }[], waiting: number): MonitorCounts {
  const live = streams.filter((stream) => stream.status !== "ended");
  return {
    live: live.length,
    troubled: live.filter((stream) => stream.status === "weak" || stream.status === "disconnected").length,
    waiting,
  };
}
