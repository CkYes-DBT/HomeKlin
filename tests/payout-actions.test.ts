import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit tests for the payout server actions (T44; src/lib/payouts/actions.ts) with stand-in clients.
// Role checks, input validation, the RPC calls made, the keys returned on failure, and the date
// arithmetic inside generatePayouts are tested here without a real database.
// Integration tests against the test project live in tests/integration/payouts.test.ts.

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
let user: { role: string } | null = null;

vi.mock("@/lib/auth/dal", () => ({
  authorize: async (roles: string[]) => (user && roles.includes(user.role) ? user : null),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ rpc }),
}));
vi.mock("next/cache", () => ({ refresh }));

const { markPayoutPaid, generatePayouts } = await import("@/lib/payouts/actions");
import { PayoutDaysSchema } from "@/lib/payouts/schemas";

const payoutId = "a1b2c3d4-1111-4222-8333-e5f6a7b8c9d0";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  user = { role: "owner" };
  rpc.mockResolvedValue({ data: null, error: null });
});

// ─── markPayoutPaid ────────────────────────────────────────────────────────────────────────────

describe("markPayoutPaid", () => {
  it("refuses when the caller is not an owner", async () => {
    user = { role: "agency" };
    expect(await markPayoutPaid(null, form({ payoutId }))).toEqual({ formError: "notAllowed" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses when payoutId is missing", async () => {
    expect(await markPayoutPaid(null, form({}))).toEqual({ formError: "notFound" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses when payoutId is not a valid UUID", async () => {
    expect(await markPayoutPaid(null, form({ payoutId: "not-a-uuid" }))).toEqual({ formError: "notFound" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls mark_payout_paid with the correct p_payout_id on valid input", async () => {
    await markPayoutPaid(null, form({ payoutId }));
    expect(rpc).toHaveBeenCalledWith("mark_payout_paid", { p_payout_id: payoutId });
  });

  it("returns { ok: true } and calls refresh on success", async () => {
    expect(await markPayoutPaid(null, form({ payoutId }))).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each([
    ["payout_not_found", "notFound"],
    ["already_paid", "alreadyPaid"],
    ["some unknown error", "unavailable"],
  ])("maps DB error %s to formError %s", async (message, expected) => {
    rpc.mockResolvedValue({ data: null, error: { message } });
    expect(await markPayoutPaid(null, form({ payoutId }))).toEqual({ formError: expected });
    expect(refresh).not.toHaveBeenCalled();
  });
});

// ─── generatePayouts ──────────────────────────────────────────────────────────────────────────

describe("generatePayouts", () => {
  it("refuses when the caller is not an owner", async () => {
    user = { role: "cleaner" };
    expect(await generatePayouts(null)).toEqual({ formError: "notAllowed" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls generate_payouts with the last Sunday as YYYY-MM-DD when today is a Monday", async () => {
    // Monday 2026-11-09 UTC (getUTCDay() = 1) → daysBack = 1 → last Sunday = 2026-11-08
    vi.setSystemTime(new Date("2026-11-09T08:00:00Z"));
    rpc.mockResolvedValue({ data: 3, error: null });
    await generatePayouts(null);
    expect(rpc).toHaveBeenCalledWith("generate_payouts", { p_period_end: "2026-11-08" });
    vi.useRealTimers();
  });

  it("when today is Sunday, uses the previous Sunday not today", async () => {
    // Sunday 2026-11-08 UTC (getUTCDay() = 0) → daysBack = 7 → last Sunday = 2026-11-01
    vi.setSystemTime(new Date("2026-11-08T08:00:00Z"));
    rpc.mockResolvedValue({ data: 1, error: null });
    await generatePayouts(null);
    expect(rpc).toHaveBeenCalledWith("generate_payouts", { p_period_end: "2026-11-01" });
    vi.useRealTimers();
  });

  it("returns { ok: true, created: N } from the RPC integer result", async () => {
    rpc.mockResolvedValue({ data: 5, error: null });
    expect(await generatePayouts(null)).toEqual({ ok: true, created: 5 });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("returns { ok: true, created: 0 } when the RPC returns null", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await generatePayouts(null)).toEqual({ ok: true, created: 0 });
  });

  it("maps a DB error to the unavailable key", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "some db error" } });
    expect(await generatePayouts(null)).toEqual({ formError: "unavailable" });
  });
});

// ─── PayoutDaysSchema ─────────────────────────────────────────────────────────────────────────

describe("PayoutDaysSchema", () => {
  it.each([7, 30, 90])("accepts %d as a number", (days) => {
    expect(PayoutDaysSchema.safeParse(days).success).toBe(true);
    expect(PayoutDaysSchema.safeParse(days).data).toBe(days);
  });

  it.each(["7", "30", "90"])("coerces the string %s to the corresponding number", (days) => {
    const result = PayoutDaysSchema.safeParse(days);
    expect(result.success).toBe(true);
    expect(result.data).toBe(Number(days));
  });

  it.each([8, 14, 365, 0, -7])("rejects %d", (days) => {
    expect(PayoutDaysSchema.safeParse(days).success).toBe(false);
  });

  it("rejects the string 'abc'", () => {
    expect(PayoutDaysSchema.safeParse("abc").success).toBe(false);
  });
});
