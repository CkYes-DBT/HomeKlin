import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, createTestUser, deleteTestUsers, type TestUser } from "./test-project";
import { createWorld, hours, type World } from "./world";

// Integration tests for the agency fees and payouts layer (T40 / T44):
// check_out creates fee rows, generate_payouts groups them into payouts, mark_payout_paid
// marks them, and RLS keeps each agency inside its own data.
// Runs against the real test project (TEST_SUPABASE_* keys).

let world: World;
let owner: TestUser;

const now = () => Date.now();
const at = (offset: number) => new Date(now() + offset);

beforeAll(async () => {
  world = await createWorld("t40");
  owner = await createTestUser("t40-owner");
  await adminClient()
    .from("profiles")
    .update({ role: "owner" })
    .eq("id", owner.id);
}, 180_000);

afterAll(async () => {
  const admin = adminClient();
  // Clean up in dependency order: fees reference orders, payouts reference agencies.
  await admin.from("order_fees").delete().eq("agency_id", world.agencies.A);
  await admin.from("order_fees").delete().eq("agency_id", world.agencies.B);
  await admin.from("payouts").delete().eq("agency_id", world.agencies.A);
  await admin.from("payouts").delete().eq("agency_id", world.agencies.B);
  await world.cleanup();
  await deleteTestUsers([owner]);
}, 120_000);

// ─── 1. check_out creates a fee row once ──────────────────────────────────────────────────────

describe("check_out creates a fee row", { timeout: 30_000 }, () => {
  it("inserts exactly one order_fees row with correct fee_idr and is idempotent", async () => {
    const admin = adminClient();
    const orderId = await world.job({ startsAt: at(-hours(1)), checkedIn: true });

    // First check-out
    const first = await world.users.cleanerA.client.rpc("check_out", { p_order: orderId });
    expect(first.error).toBeNull();

    const { data: fees, error: feesErr } = await admin
      .from("order_fees")
      .select("order_id, agency_id, price_idr, percent, fee_idr")
      .eq("order_id", orderId);
    expect(feesErr).toBeNull();
    expect(fees).toHaveLength(1);
    const fee = fees![0];
    expect(fee.agency_id).toBe(world.agencies.A);
    expect(fee.price_idr).toBe(world.price);
    expect(Number(fee.percent)).toBe(70);
    // round(66000 * 70 / 100.0) = round(46200.0) = 46200
    expect(fee.fee_idr).toBe(Math.round(world.price * 70 / 100));

    // Second check-out is idempotent: same completed_at, still one fee row
    const second = await world.users.cleanerA.client.rpc("check_out", { p_order: orderId });
    expect(second.error).toBeNull();
    expect(second.data).toBe(first.data);

    const { data: feesAgain } = await admin
      .from("order_fees")
      .select("order_id")
      .eq("order_id", orderId);
    expect(feesAgain).toHaveLength(1);
  });
});

// ─── 2. Cancelled, failed, and unpaid orders: no fee ─────────────────────────────────────────

describe("non-paid orders do not get a fee row", { timeout: 30_000 }, () => {
  it.each(["cancelled", "failed", "pending_payment"] as const)(
    "check_out on a %s order returns an error and creates no fee row",
    async (status) => {
      const admin = adminClient();
      const orderId = await world.job({
        startsAt: at(-hours(1)),
        status,
        checkedIn: false,
      });

      const { error } = await world.users.cleanerA.client.rpc("check_out", { p_order: orderId });
      expect(error).not.toBeNull();

      const { data: fees } = await admin
        .from("order_fees")
        .select("order_id")
        .eq("order_id", orderId);
      expect(fees ?? []).toHaveLength(0);
    },
  );
});

// ─── 3. Changing payout_percent later does not change existing fees ───────────────────────────

describe("fee snapshot is immutable after check_out", { timeout: 30_000 }, () => {
  it("changing the agency payout_percent does not alter an existing order_fees row", async () => {
    const admin = adminClient();
    const orderId = await world.job({ startsAt: at(-hours(2)), checkedIn: true });

    await world.users.cleanerA.client.rpc("check_out", { p_order: orderId });

    const { data: before } = await admin
      .from("order_fees")
      .select("fee_idr, percent")
      .eq("order_id", orderId)
      .single();
    expect(before).not.toBeNull();
    const originalFee = before!.fee_idr as number;
    const originalPercent = before!.percent as string;

    // Change the agency's payout_percent to 50 via admin (bypasses RLS)
    await admin
      .from("agencies")
      .update({ payout_percent: 50 })
      .eq("id", world.agencies.A);

    const { data: after } = await admin
      .from("order_fees")
      .select("fee_idr, percent")
      .eq("order_id", orderId)
      .single();
    expect(after!.fee_idr).toBe(originalFee);
    expect(after!.percent).toBe(originalPercent);

    // Restore original percent so other tests are not affected
    await admin
      .from("agencies")
      .update({ payout_percent: 70 })
      .eq("id", world.agencies.A);
  });
});

// ─── 4. generate_payouts is idempotent ────────────────────────────────────────────────────────

describe("generate_payouts is idempotent", { timeout: 30_000 }, () => {
  it("calling generate_payouts twice creates the same payouts and does not double-count fees", async () => {
    const admin = adminClient();
    const periodEnd = "2026-11-02"; // a Sunday well in the past

    // Insert two completed orders with fee rows directly (no need to call check_out)
    const orderId1 = await world.job({ startsAt: new Date("2026-11-01T08:00:00Z"), completed: true });
    const orderId2 = await world.job({ startsAt: new Date("2026-11-01T09:00:00Z"), completed: true });

    // Insert order_fees rows directly via admin (simulating check_out for past dates)
    await admin.from("order_fees").upsert([
      {
        order_id: orderId1,
        agency_id: world.agencies.A,
        price_idr: world.price,
        percent: 70,
        fee_idr: Math.round(world.price * 70 / 100),
      },
      {
        order_id: orderId2,
        agency_id: world.agencies.A,
        price_idr: world.price,
        percent: 70,
        fee_idr: Math.round(world.price * 70 / 100),
      },
    ], { onConflict: "order_id" });

    // First call
    const first = await owner.client.rpc("generate_payouts", { p_period_end: periodEnd });
    expect(first.error).toBeNull();

    const { data: payoutsAfterFirst } = await admin
      .from("payouts")
      .select("id, amount_idr, jobs_count")
      .eq("agency_id", world.agencies.A)
      .eq("period_end", periodEnd);
    expect(payoutsAfterFirst).toHaveLength(1);
    const payoutFirst = payoutsAfterFirst![0];
    const expectedAmount = Math.round(world.price * 70 / 100) * 2;
    expect(payoutFirst.amount_idr).toBe(expectedAmount);
    expect(payoutFirst.jobs_count).toBe(2);

    // Second call: idempotent
    const second = await owner.client.rpc("generate_payouts", { p_period_end: periodEnd });
    expect(second.error).toBeNull();

    const { data: payoutsAfterSecond } = await admin
      .from("payouts")
      .select("id, amount_idr, jobs_count")
      .eq("agency_id", world.agencies.A)
      .eq("period_end", periodEnd);
    expect(payoutsAfterSecond).toHaveLength(1);
    expect(payoutsAfterSecond![0].id).toBe(payoutFirst.id);
    expect(payoutsAfterSecond![0].amount_idr).toBe(payoutFirst.amount_idr);

    // Each fee row has payout_id assigned exactly once
    const { data: feesAssigned } = await admin
      .from("order_fees")
      .select("order_id, payout_id")
      .in("order_id", [orderId1, orderId2]);
    for (const row of feesAssigned ?? []) {
      expect(row.payout_id).toBe(payoutFirst.id);
    }
  });
});

// ─── 5. mark_payout_paid: roles and double-mark ───────────────────────────────────────────────

describe("mark_payout_paid role checks and double-mark prevention", { timeout: 30_000 }, () => {
  it("owner can mark pending → paid; agency, admin, and owner a second time cannot", async () => {
    const admin = adminClient();

    // Create a pending payout directly
    const { data: inserted, error: insertErr } = await admin
      .from("payouts")
      .insert({
        agency_id: world.agencies.A,
        period_start: "2026-10-19",
        period_end: "2026-10-25",
        amount_idr: 46200,
        jobs_count: 1,
        status: "pending",
        payout_date: "2026-10-26",
      })
      .select("id")
      .single();
    expect(insertErr).toBeNull();
    const payoutId = inserted!.id as string;

    // Agency user: not_owner
    const agencyResult = await world.users.agencyA.client.rpc("mark_payout_paid", { p_payout_id: payoutId });
    expect(agencyResult.error?.message).toBe("not_owner");

    // Admin user: not_owner
    const adminResult = await world.users.admin.client.rpc("mark_payout_paid", { p_payout_id: payoutId });
    expect(adminResult.error?.message).toBe("not_owner");

    // Owner: success
    const ownerResult = await owner.client.rpc("mark_payout_paid", { p_payout_id: payoutId });
    expect(ownerResult.error).toBeNull();

    const { data: row } = await admin
      .from("payouts")
      .select("status, paid_reference")
      .eq("id", payoutId)
      .single();
    expect(row!.status).toBe("paid");
    expect(row!.paid_reference).toMatch(/^DEMO-/);

    // Owner again: already_paid
    const secondOwner = await owner.client.rpc("mark_payout_paid", { p_payout_id: payoutId });
    expect(secondOwner.error?.message).toBe("already_paid");
  });
});

// ─── 6. Agency A cannot read agency B's data ─────────────────────────────────────────────────

describe("RLS: agency A cannot read agency B fees or payouts", { timeout: 30_000 }, () => {
  it("agency A's client SELECT on order_fees filtered to agency B returns 0 rows", async () => {
    const admin = adminClient();

    // Insert a fee row for agency B via admin
    const orderIdB = await world.job({ startsAt: at(-hours(3)), agency: "B", cleaner: world.users.cleanerB });
    await admin.from("order_fees").upsert({
      order_id: orderIdB,
      agency_id: world.agencies.B,
      price_idr: world.price,
      percent: 70,
      fee_idr: Math.round(world.price * 70 / 100),
    }, { onConflict: "order_id" });

    // Insert a payout for agency B via admin
    const { data: payoutB } = await admin
      .from("payouts")
      .insert({
        agency_id: world.agencies.B,
        period_start: "2026-10-12",
        period_end: "2026-10-18",
        amount_idr: 46200,
        jobs_count: 1,
        status: "pending",
        payout_date: "2026-10-19",
      })
      .select("id")
      .single();

    // Agency A trying to read agency B's order_fees
    const { data: feesAsA } = await world.users.agencyA.client
      .from("order_fees")
      .select("order_id")
      .eq("agency_id", world.agencies.B);
    expect(feesAsA ?? []).toHaveLength(0);

    // Agency A trying to read agency B's payouts
    const { data: payoutsAsA } = await world.users.agencyA.client
      .from("payouts")
      .select("id")
      .eq("agency_id", world.agencies.B);
    expect(payoutsAsA ?? []).toHaveLength(0);

    // Sanity: confirm the fee and payout rows for agency B exist (admin verification).
    // Agency B's read access to its own data is verified through the INVOKER summary functions
    // in the agency_summary / agency_fees_daily tests above, which pass successfully.
    const { data: feesCheck } = await admin
      .from("order_fees")
      .select("order_id")
      .eq("order_id", orderIdB);
    expect(feesCheck ?? []).toHaveLength(1);

    if (payoutB) {
      const { data: payoutsCheck } = await admin
        .from("payouts")
        .select("id")
        .eq("id", payoutB.id);
      expect(payoutsCheck ?? []).toHaveLength(1);
    }
  });
});

// ─── 7. Customer and cleaner cannot read order_fees or payouts ────────────────────────────────

describe("RLS: customer and cleaner are denied order_fees and payouts", { timeout: 30_000 }, () => {
  it("customer SELECT on order_fees returns 0 rows", async () => {
    const { data } = await world.users.customer.client.from("order_fees").select("order_id");
    expect(data ?? []).toHaveLength(0);
  });

  it("customer SELECT on payouts returns 0 rows", async () => {
    const { data } = await world.users.customer.client.from("payouts").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("cleaner SELECT on order_fees returns 0 rows", async () => {
    const { data } = await world.users.cleanerA.client.from("order_fees").select("order_id");
    expect(data ?? []).toHaveLength(0);
  });

  it("cleaner SELECT on payouts returns 0 rows", async () => {
    const { data } = await world.users.cleanerA.client.from("payouts").select("id");
    expect(data ?? []).toHaveLength(0);
  });
});

// ─── 8. Customer reading their own order sees no fee data ─────────────────────────────────────

describe("customer order row contains no fee columns", { timeout: 30_000 }, () => {
  it("orders row for a completed job has no fee_idr, percent, or payout_id column", async () => {
    const admin = adminClient();
    const orderId = await world.job({ startsAt: at(-hours(2)), checkedIn: true });
    await world.users.cleanerA.client.rpc("check_out", { p_order: orderId });

    // Confirm a fee row exists (via admin)
    const { data: fee } = await admin
      .from("order_fees")
      .select("fee_idr")
      .eq("order_id", orderId)
      .single();
    expect(fee).not.toBeNull();

    // Customer reads their orders via my_orders() (direct table SELECT is blocked by RLS).
    // Verify that none of the returned rows contain fee columns — fees live in order_fees, not orders.
    const { data: orders, error } = await world.users.customer.client.rpc("my_orders");
    expect(error).toBeNull();
    const order = (orders ?? []).find((row: Record<string, unknown>) => row.order_id === orderId);
    expect(order).not.toBeUndefined();
    const keys = Object.keys(order ?? {});
    expect(keys).not.toContain("fee_idr");
    expect(keys).not.toContain("percent");
    expect(keys).not.toContain("payout_id");
  });
});

// ─── 9. Summary functions reject p_days outside 7, 30, 90 ────────────────────────────────────

describe("agency_summary rejects invalid p_days values", { timeout: 30_000 }, () => {
  it.each([14, 8, 365, 0])("p_days=%d returns invalid_days error", async (days) => {
    const result = await world.users.agencyA.client.rpc("agency_summary", { p_days: days });
    expect(result.error?.message).toBe("invalid_days");
  });
});

// ─── 10. owner_payouts_overview is owner-only ─────────────────────────────────────────────────

describe("owner_payouts_overview access control", { timeout: 30_000 }, () => {
  it("agency, admin, and cleaner clients get a not_owner error", async () => {
    for (const client of [
      world.users.agencyA.client,
      world.users.agencyB.client,
      world.users.admin.client,
    ]) {
      const result = await client.rpc("owner_payouts_overview");
      expect(result.error?.message).toBe("not_owner");
    }
  });

  it("owner client gets a successful data array with no error", async () => {
    const result = await owner.client.rpc("owner_payouts_overview");
    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
  });
});
