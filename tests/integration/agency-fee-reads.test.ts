import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, createTestUser, deleteTestUsers, type TestUser } from "./test-project";
import { createWorld, hours, type World } from "./world";

// T44 fix (supabase/migrations/20261114160000_agency_fee_reads.sql), against the real test project: an
// agency reads its own fees. The earlier tests only checked that agency A sees none of B's rows, which
// an empty or failed read also passes; here agency A gets its real numbers back from every summary
// function and from its own order_fees rows, while B, customers, cleaners and admin see none of them,
// and the owner still reads all. The daily fees are grouped by the Jakarta date.

let world: World;
let owner: TestUser | undefined;
const fee = Math.round(66000 * 0.7);
let lateEvening: Date;
let payoutId = "";
let bJob = "";

const jakartaDate = (at: Date) => new Date(at.getTime() + hours(7)).toISOString().slice(0, 10);

async function addFee(orderId: string, agencyId: string) {
  const { error } = await adminClient()
    .from("order_fees")
    .insert({ order_id: orderId, agency_id: agencyId, price_idr: world.price, percent: 70, fee_idr: fee });
  if (error) throw new Error(`Could not add the fee row: ${error.message}`);
}

function ownerUser(): TestUser {
  if (!owner) throw new Error("The owner test user was not created (see beforeAll).");
  return owner;
}

beforeAll(async () => {
  world = await createWorld("t44");
  owner = await createTestUser("t44-owner");
  await adminClient().from("profiles").update({ role: "owner" }).eq("id", owner.id);

  // One job checked out now (check_out writes its fee).
  const now = await world.job({ startsAt: new Date(Date.now() - hours(1)), checkedIn: true });
  const done = await world.users.cleanerA.client.rpc("check_out", { p_order: now });
  if (done.error) throw new Error(`Could not check out: ${done.error.message}`);

  // One finished at 18:30 UTC two days ago: 01:30 the next day in Jakarta.
  const day = new Date(Date.now() - 2 * 86_400_000);
  lateEvening = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 18, 30));
  const late = await world.job({ startsAt: new Date(lateEvening.getTime() - hours(2)), completed: true });
  await addFee(late, world.agencies.A);

  // A payout of agency A, and a fee of agency B.
  const payout = await adminClient()
    .from("payouts")
    .insert({ agency_id: world.agencies.A, period_start: "2020-01-06", period_end: "2020-01-12", amount_idr: fee, jobs_count: 1 })
    .select("id")
    .single<{ id: string }>();
  if (payout.error || !payout.data) throw new Error(`Could not add the payout: ${payout.error?.message}`);
  payoutId = payout.data.id;
  bJob = await world.job({ startsAt: new Date(Date.now() - hours(30)), agency: "B", cleaner: world.users.cleanerB, completed: true });
  await addFee(bJob, world.agencies.B);
}, 180_000);

afterAll(async () => {
  await deleteTestUsers([owner]);
  await world.cleanup();
}, 120_000);

describe("an agency's own fees", { timeout: 30_000 }, () => {
  const agencyA = () => world.users.agencyA.client;

  it("come back from every summary function with the real numbers", async () => {
    const summary = await agencyA().rpc("agency_summary", { p_days: 7 });
    expect(summary.error).toBeNull();
    expect(summary.data[0]).toMatchObject({ total_fee_idr: 2 * fee, jobs_count: 2 });

    const daily = await agencyA().rpc("agency_fees_daily", { p_days: 7 });
    expect(daily.error).toBeNull();
    const days = daily.data as { day: string; fee_idr: number }[];
    expect(days.reduce((sum, row) => sum + Number(row.fee_idr), 0)).toBe(2 * fee);
    // Grouped by the Jakarta date: the job done at 18:30 UTC counts on the next day.
    expect(days.find((row) => row.day === jakartaDate(lateEvening))?.fee_idr).toBeGreaterThanOrEqual(fee);

    const byCleaner = await agencyA().rpc("agency_fees_by_cleaner", { p_days: 7 });
    expect(byCleaner.error).toBeNull();
    expect(byCleaner.data).toEqual([{ cleaner_id: world.users.cleanerA.id, full_name: "Uji Petugas A", fee_idr: 2 * fee, share_percent: 100 }]);

    const byService = await agencyA().rpc("agency_fees_by_service", { p_days: 7 });
    expect(byService.error).toBeNull();
    expect(byService.data).toMatchObject([{ service_id: world.serviceId, fee_idr: 2 * fee, share_percent: 100 }]);

    const payouts = await agencyA().rpc("agency_payouts_list", { p_limit: 10 });
    expect(payouts.error).toBeNull();
    expect((payouts.data as { id: string }[]).map((row) => row.id)).toEqual([payoutId]);
  });

  it("can be read directly, its own rows only", async () => {
    const own = await agencyA().from("order_fees").select("agency_id, fee_idr");
    expect(own.error).toBeNull();
    expect(own.data).toHaveLength(2);
    expect(own.data?.every((row) => row.agency_id === world.agencies.A)).toBe(true);
    const ownPayouts = await agencyA().from("payouts").select("id");
    expect(ownPayouts.error).toBeNull();
    expect(ownPayouts.data?.map((row) => row.id)).toEqual([payoutId]);

    // Agency B sees its own fee and nothing of A's.
    const theirs = await world.users.agencyB.client.from("order_fees").select("order_id, agency_id");
    expect(theirs.error).toBeNull();
    expect(theirs.data).toEqual([{ order_id: bJob, agency_id: world.agencies.B }]);
    expect((await world.users.agencyB.client.from("payouts").select("id")).data).toEqual([]);
    const bDaily = await world.users.agencyB.client.rpc("agency_fees_daily", { p_days: 7 });
    expect((bDaily.data as { fee_idr: number }[]).reduce((sum, row) => sum + Number(row.fee_idr), 0)).toBe(fee);
  });
});

describe("everyone else", { timeout: 30_000 }, () => {
  it("customers, cleaners and admin read no fee or payout rows, and no agency summary", async () => {
    for (const user of [world.users.customer, world.users.cleanerA, world.users.admin]) {
      const fees = await user.client.from("order_fees").select("order_id");
      expect(fees.data ?? [], user.email).toEqual([]);
      expect((await user.client.from("payouts").select("id")).data ?? [], user.email).toEqual([]);
      for (const fn of ["agency_fees_daily", "agency_fees_by_cleaner", "agency_fees_by_service"]) {
        expect((await user.client.rpc(fn, { p_days: 7 })).error?.message, `${user.email} ${fn}`).toBe("not_agency");
      }
      expect((await user.client.rpc("agency_payouts_list", { p_limit: 5 })).error?.message, user.email).toBe("not_agency");
    }
    // No one writes them directly.
    const write = await world.users.agencyA.client.from("order_fees").update({ fee_idr: 1 }).eq("agency_id", world.agencies.A).select("order_id");
    expect(write.data ?? []).toEqual([]);
  });

  it("the owner still reads every agency's fees and the overview, and admin its order detail", async () => {
    const all = await ownerUser().client.from("order_fees").select("agency_id").in("agency_id", [world.agencies.A, world.agencies.B]);
    expect(all.error).toBeNull();
    expect(all.data).toHaveLength(3);
    expect((await ownerUser().client.rpc("owner_payouts_overview")).error).toBeNull();
    expect((await ownerUser().client.rpc("owner_numbers", { p_days: 7 })).error).toBeNull();
    expect((await world.users.admin.client.rpc("admin_order_detail", { p_order: bJob })).data?.[0]).toMatchObject({ agency_fee_final: true, agency_fee_idr: fee });
  });
});
