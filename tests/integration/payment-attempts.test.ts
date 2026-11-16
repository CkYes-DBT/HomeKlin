import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, createTestUser, deleteTestUsers, visitorClient, type TestUser } from "./test-project";

// Paying on HomeKlin's own page (supabase/migrations/20261116090000_payment_on_our_page.sql), against
// the real test project. Every charge at Midtrans is an "attempt": begin_payment_attempt() opens the next
// one for the customer's own waiting order, attach_payment_details() keeps what Midtrans answered for
// the current attempt, and apply_payment_result() lets only the current attempt fail or cancel the order
// (a payment for any attempt still counts).

const prefix = `t10a-${randomUUID().slice(0, 8)}`;
const area = `${prefix}-area`;
const serviceId = `${prefix}-svc`;
const price = 99000;
let owner: TestUser | undefined;
let other: TestUser | undefined;
let slotId = "";
let startsAt = "";

function user(u: TestUser | undefined): TestUser {
  if (!u) throw new Error("The test user was not created (see beforeAll).");
  return u;
}

async function book(): Promise<string> {
  // A customer may hold only 3 unpaid orders: close the ones the earlier tests left waiting.
  await adminClient().from("orders").update({ status: "cancelled" }).eq("customer_id", user(owner).id).eq("status", "pending_payment");
  const { data, error } = await user(owner).client.rpc("book_slot", {
    p_service: serviceId, p_area: area, p_starts_at: startsAt,
    p_address: "Jl. Uji Bayar No. 3, Jakarta", p_phone: "+6281234567890", p_consent: true,
  });
  if (error) throw new Error(`Could not book the test order: ${error.message}`);
  return (data as { order_id: string }[])[0].order_id;
}

async function row(orderId: string) {
  const { data } = await adminClient().from("orders").select("status, payment_attempt, payment_details, payment_type").eq("id", orderId).single();
  return data as { status: string; payment_attempt: number; payment_details: unknown; payment_type: string | null };
}

const qris = { method: "qris", qrUrl: "https://api.sandbox.midtrans.com/v2/qris/abc/qr-code", expiresAt: "2031-01-05T02:00:00.000Z" };

beforeAll(async () => {
  const admin = adminClient();
  await admin.from("service_areas").insert({ id: area, name_id: "Uji Percobaan", name_en: "Test Attempts" });
  const { data: agency } = await admin.from("agencies").insert({ key: `${prefix}-a`, name: "Uji Agensi" }).select("id").single();
  await admin.from("agency_areas").insert({ agency_id: agency?.id, area_id: area });
  await admin.from("services").insert({
    id: serviceId, category: "rooms", name_id: "Uji Percobaan", name_en: "Test Attempts",
    description_id: "Layanan uji.", description_en: "A test service.", price_idr: price, duration_minutes: 60,
  });
  const start = new Date(Date.UTC(2031, 0, 6, 1));
  startsAt = start.toISOString();
  const slot = await admin.from("availability_slots").insert({
    agency_id: agency?.id, area_id: area, capacity: 30,
    starts_at: startsAt, ends_at: new Date(start.getTime() + 7_200_000).toISOString(),
  }).select("id").single();
  slotId = slot.data?.id;

  owner = await createTestUser("t10a-owner");
  other = await createTestUser("t10a-other");
}, 90_000);

afterAll(async () => {
  const admin = adminClient();
  await deleteTestUsers([owner, other]);
  await admin.from("agencies").delete().like("key", `${prefix}-%`);
  await admin.from("services").delete().eq("id", serviceId);
  await admin.from("service_areas").delete().eq("id", area);
}, 60_000);

describe("begin_payment_attempt", () => {
  it("opens attempt 1 on a fresh order, with nothing before it to cancel", async () => {
    const orderId = await book();
    const { data, error } = await user(owner).client.rpc("begin_payment_attempt", { p_order: orderId });
    expect(error).toBeNull();
    expect(data).toEqual([{ attempt: 1, previous_attempt: 0, previous_charge: false }]);
    expect((await row(orderId)).payment_attempt).toBe(1);
  });

  it("opens the next attempt over a charged one, forgets its details and says there is a charge to cancel", async () => {
    const orderId = await book();
    const client = user(owner).client;
    await client.rpc("begin_payment_attempt", { p_order: orderId });
    expect((await client.rpc("attach_payment_details", { p_order: orderId, p_attempt: 1, p_details: qris })).error).toBeNull();

    const next = await client.rpc("begin_payment_attempt", { p_order: orderId });
    expect(next.data).toEqual([{ attempt: 2, previous_attempt: 1, previous_charge: true }]);
    expect((await row(orderId)).payment_details).toBeNull();
  });

  it("is refused for another customer's order, an order that is not waiting, and a visitor", async () => {
    const orderId = await book();
    const theirs = await user(other).client.rpc("begin_payment_attempt", { p_order: orderId });
    expect(theirs.error?.message).toBe("order_not_payable");
    expect((await row(orderId)).payment_attempt).toBe(0);

    await adminClient().from("orders").update({ status: "paid" }).eq("id", orderId);
    expect((await user(owner).client.rpc("begin_payment_attempt", { p_order: orderId })).error?.message).toBe("order_not_payable");

    expect((await visitorClient().rpc("begin_payment_attempt", { p_order: orderId })).error).not.toBeNull();
  });

  it("stops at 10 attempts, so one order cannot make endless calls to Midtrans", async () => {
    const orderId = await book();
    await adminClient().from("orders").update({ payment_attempt: 10 }).eq("id", orderId);
    expect((await user(owner).client.rpc("begin_payment_attempt", { p_order: orderId })).error?.message).toBe("attempts_exhausted");
  });
});

describe("attach_payment_details and order_payment_state", () => {
  it("keeps the details of the current attempt once, and shows them only to the order's customer", async () => {
    const orderId = await book();
    const client = user(owner).client;
    await client.rpc("begin_payment_attempt", { p_order: orderId });

    expect((await client.rpc("attach_payment_details", { p_order: orderId, p_attempt: 1, p_details: qris })).error).toBeNull();
    expect((await client.rpc("attach_payment_details", { p_order: orderId, p_attempt: 1, p_details: qris })).error?.message).toBe("order_not_payable");

    const mine = await client.rpc("order_payment_state", { p_order: orderId });
    expect(mine.data).toEqual([{ payment_attempt: 1, payment_details: qris }]);
    expect((await user(other).client.rpc("order_payment_state", { p_order: orderId })).data).toEqual([]);
  });

  it("refuses details for an attempt that is no longer the current one, and details that are not a payment method", async () => {
    const orderId = await book();
    const client = user(owner).client;
    await client.rpc("begin_payment_attempt", { p_order: orderId });
    await client.rpc("begin_payment_attempt", { p_order: orderId });

    expect((await client.rpc("attach_payment_details", { p_order: orderId, p_attempt: 1, p_details: qris })).error?.message).toBe("order_not_payable");
    expect((await client.rpc("attach_payment_details", { p_order: orderId, p_attempt: 2, p_details: { method: "cash" } })).error?.message).toBe("details_invalid");
    expect((await row(orderId)).payment_details).toBeNull();
  });

  it("cannot be used by another customer on this order", async () => {
    const orderId = await book();
    await user(owner).client.rpc("begin_payment_attempt", { p_order: orderId });
    const theirs = await user(other).client.rpc("attach_payment_details", { p_order: orderId, p_attempt: 1, p_details: qris });
    expect(theirs.error?.message).toBe("order_not_payable");
  });
});

describe("apply_payment_result with attempts", () => {
  const apply = (orderId: string, status: string, attempt?: number) =>
    adminClient().rpc("apply_payment_result", {
      p_order: orderId, p_status: status, p_amount: price, p_payment_type: "bank_transfer",
      ...(attempt === undefined ? {} : { p_attempt: attempt }),
    });

  it("ignores a cancellation of an older attempt (the method the customer left), but not the current one's", async () => {
    const orderId = await book();
    const client = user(owner).client;
    await client.rpc("begin_payment_attempt", { p_order: orderId });
    await client.rpc("begin_payment_attempt", { p_order: orderId });

    const old = await apply(orderId, "cancelled", 1);
    expect(old.data).toBe("pending_payment");
    expect((await row(orderId)).status).toBe("pending_payment");

    const current = await apply(orderId, "cancelled", 2);
    expect(current.data).toBe("cancelled");
  });

  it("takes money for an older attempt: paid counts from any attempt", async () => {
    const orderId = await book();
    const client = user(owner).client;
    await client.rpc("begin_payment_attempt", { p_order: orderId });
    await client.rpc("begin_payment_attempt", { p_order: orderId });

    expect((await apply(orderId, "paid", 1)).data).toBe("paid");
    expect((await row(orderId)).payment_type).toBe("bank_transfer");
  });

  it("keeps the old behaviour without an attempt: a legacy notification (attempt 0) on an order never charged here", async () => {
    const orderId = await book();
    expect((await apply(orderId, "failed")).data).toBe("failed");
    const { data } = await adminClient().from("availability_slots").select("booked").eq("id", slotId).single();
    expect(data?.booked).toBeGreaterThanOrEqual(0);
  });

  it("is still closed to customers and visitors", async () => {
    const orderId = await book();
    const args = { p_order: orderId, p_status: "paid", p_amount: price, p_payment_type: null, p_attempt: 0 };
    expect((await user(owner).client.rpc("apply_payment_result", args)).error).not.toBeNull();
    expect((await visitorClient().rpc("apply_payment_result", args)).error).not.toBeNull();
    expect((await row(orderId)).status).toBe("pending_payment");
  });
});
