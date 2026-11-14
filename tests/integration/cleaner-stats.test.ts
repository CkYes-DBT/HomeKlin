import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getMyJobStats } from "@/lib/jobs/jobs";
import { adminClient } from "./test-project";
import { createWorld, hours, type World } from "./world";

// B6 (Phase 15, supabase/migrations/20261114170000_cleaner_stats.sql): the three numbers on the
// cleaner's home page, against the real test project, all by Jakarta time (Asia/Jakarta, UTC+7):
//   active hours this week   from check-in to check-out (a job in progress counts until now) of the
//                            jobs checked in since Monday 00:00
//   jobs today               the cleaner's paid jobs whose window starts today
//   completed this month     the cleaner's jobs completed since the 1st of the month 00:00
// Only the cleaner's own jobs count. The test sets its jobs at fixed offsets from the start of the
// Jakarta day, week and month, so it holds whatever day it runs.

let world: World;
const jakartaOffset = hours(7);

/** The start of today, this week (Monday) and this month in Jakarta, as UTC instants. */
function starts(now = new Date()) {
  const local = new Date(now.getTime() + jakartaOffset);
  const day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - jakartaOffset;
  const weekday = (local.getUTCDay() + 6) % 7; // Monday 0
  const week = day - weekday * 86_400_000;
  const month = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - jakartaOffset;
  return { day, week, month, now: now.getTime() };
}

beforeAll(async () => {
  world = await createWorld("b6");
}, 180_000);

afterAll(async () => {
  await world.cleanup();
}, 120_000);

/** A job of cleaner A, checked in at `checkIn` and completed at `checkOut` (or still going). */
async function worked(checkIn: number, checkOut: number | null, extra: { cleaner?: typeof world.users.cleanerA; startsAt?: number } = {}) {
  const startsAt = new Date(extra.startsAt ?? checkIn);
  const id = await world.job({ startsAt, cleaner: extra.cleaner, checkedIn: true });
  const { error } = await adminClient()
    .from("orders")
    .update({ checked_in_at: new Date(checkIn).toISOString(), completed_at: checkOut === null ? null : new Date(checkOut).toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Could not set the job's times: ${error.message}`);
  return id;
}

describe("my_job_stats", { timeout: 60_000 }, () => {
  it("counts the cleaner's own active hours, today's jobs and this month's completed jobs", async () => {
    const { day, week, month, now } = starts();
    const before = await getMyJobStats(world.users.cleanerA.client);
    expect(before).toEqual({ activeHoursWeek: 0, jobsToday: 0, completedMonth: 0 });

    // This week: 2 hours, done (checked in at the start of the week, so it is this week and this month
    // only if the week started this month; the month count is checked by its own rule below).
    await worked(week + hours(1), week + hours(3));
    // In progress since 30 minutes ago: counts until now.
    await worked(now - hours(0.5), null);
    // Last week: does not count for the hours.
    await worked(week - hours(5), week - hours(4));
    // Another cleaner's job: never counts.
    await worked(now - hours(2), now - hours(1), { cleaner: world.users.cleanerA2 });
    // A job later today, not started.
    const later = Math.min(day + hours(23), now + hours(1));
    await world.job({ startsAt: new Date(later) });

    const stats = await getMyJobStats(world.users.cleanerA.client);
    expect(stats.activeHoursWeek).toBeCloseTo(2.5, 1);

    // Today: the job in progress (started today unless it is just after midnight) and the later one.
    const startedToday = [now - hours(0.5), later, week + hours(1), week - hours(5)].filter((t) => t >= day && t < day + 86_400_000);
    expect(stats.jobsToday).toBe(startedToday.length);

    const completedThisMonth = [week + hours(3), week - hours(4)].filter((t) => t >= month);
    expect(stats.completedMonth).toBe(completedThisMonth.length);
  });

  it("is for cleaners only", async () => {
    for (const user of [world.users.customer, world.users.agencyA, world.users.admin]) {
      expect((await user.client.rpc("my_job_stats")).error?.message, user.email).toBe("not_cleaner");
    }
  });
});
