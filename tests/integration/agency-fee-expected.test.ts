import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAgencyJobs } from "@/lib/jobs/jobs";
import { adminClient } from "./test-project";
import { createWorld, hours, type World } from "./world";

// B4 (Phase 15, supabase/migrations/20261114120000_agency_fee_expected.sql): the partner's jobs list
// shows the agency's fee before the job is done. Until check-out writes the real fee (order_fees), it
// is the expected one, round(price x the agency's payout_percent / 100), as check_out computes it
// (20261111090000_agency_fees.sql); after that it is the real row, whatever the percent is now.

let world: World;

beforeAll(async () => {
  world = await createWorld("b4");
}, 180_000);

afterAll(async () => {
  await world.cleanup();
}, 120_000);

const jobOf = async (id: string, agency = world.users.agencyA) =>
  (await listAgencyJobs(agency.client)).find((job) => job.id === id);

async function setPercent(agencyId: string, percent: number) {
  const { error } = await adminClient().from("agencies").update({ payout_percent: percent }).eq("id", agencyId);
  if (error) throw new Error(`Could not set the percent: ${error.message}`);
}

describe("the agency fee on the agency's jobs", { timeout: 60_000 }, () => {
  it("is the expected fee at the agency's percent before the job is done", async () => {
    const job = await world.job({ startsAt: new Date(Date.now() + hours(4)) });
    expect(await jobOf(job)).toMatchObject({ agencyFeeIdr: Math.round(world.price * 0.7), agencyFeeFinal: false });

    // Half-up rounding, as check_out: 66000 x 33.33% = 21997.8 -> 21998.
    await setPercent(world.agencies.B, 33.33);
    const theirs = await world.job({ startsAt: new Date(Date.now() + hours(4)), agency: "B", cleaner: world.users.cleanerB });
    expect(await jobOf(theirs, world.users.agencyB)).toMatchObject({ agencyFeeIdr: 21998, agencyFeeFinal: false });
  });

  it("is the real fee once check-out has written it, even if the percent changes later", async () => {
    const job = await world.job({ startsAt: new Date(Date.now() - hours(1)), checkedIn: true });
    expect((await world.users.cleanerA.client.rpc("check_out", { p_order: job })).error).toBeNull();
    await setPercent(world.agencies.A, 50);
    try {
      expect(await jobOf(job)).toMatchObject({ agencyFeeIdr: Math.round(world.price * 0.7), agencyFeeFinal: true });
      // A job not yet done follows the new percent.
      const later = await world.job({ startsAt: new Date(Date.now() + hours(8)) });
      expect(await jobOf(later)).toMatchObject({ agencyFeeIdr: world.price / 2, agencyFeeFinal: false });
    } finally {
      await setPercent(world.agencies.A, 70);
    }
  });

  it("is not shown to the customer, the cleaner or anyone outside the agency", async () => {
    const job = await world.job({ startsAt: new Date(Date.now() + hours(9)) });
    const keysOf = (rows: unknown[] | null) => Object.keys((rows ?? [])[0] ?? {});
    const orders = await world.users.customer.client.rpc("my_orders");
    expect(keysOf(orders.data)).not.toContain("agency_fee_idr");
    const cleanerJobs = await world.users.cleanerA.client.rpc("my_jobs");
    expect(keysOf(cleanerJobs.data)).not.toContain("agency_fee_idr");
    expect((await world.users.agencyB.client.rpc("agency_jobs")).data?.some((row: { order_id: string }) => row.order_id === job)).toBe(false);
  });
});
