import { z } from "zod";
import type { AdminJob } from "@/lib/jobs/jobs";

// The admin console's rules (T26): which past jobs the recordings page shows and what it says about
// each recording, and which recording ?recording= asks for. Pure, tested in
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
