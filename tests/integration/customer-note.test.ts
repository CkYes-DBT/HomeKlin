import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listMyOrders } from "@/lib/booking/orders";
import { getAdminOrderDetail } from "@/lib/jobs/admin-order";
import { listAgencyJobs, listMyJobs } from "@/lib/jobs/jobs";
import { adminClient } from "./test-project";
import { createWorld, type World } from "./world";

// B7 (Phase 15, supabase/migrations/20261114140000_customer_note.sql): the customer's note for the
// cleaner ("the key is at the guard post"), given with the booking, against the real test project.
// book_slot() takes it as an optional last argument (0 to 300 characters, empty allowed), so a call
// without it still books; the customer, the assigned cleaner, the agency and admin read it.

let world: World;
let window = 0;

beforeAll(async () => {
  world = await createWorld("b7");
}, 180_000);

afterAll(async () => {
  await world.cleanup();
}, 120_000);

/** A fresh window of agency A only, far ahead, so book_slot routes there. */
async function freeWindow(): Promise<string> {
  window += 1;
  const start = new Date(Date.UTC(2031, 2, 1 + window, 2));
  const { error } = await adminClient().from("availability_slots").insert({
    agency_id: world.agencies.A, area_id: world.area, capacity: 1, booked: 0,
    starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 2 * 3_600_000).toISOString(),
  });
  if (error) throw new Error(`Could not add the window: ${error.message}`);
  return start.toISOString();
}

const book = (startsAt: string, extra: Record<string, unknown> = {}) =>
  world.users.customer.client.rpc("book_slot", {
    p_service: world.serviceId,
    p_area: world.area,
    p_starts_at: startsAt,
    p_address: "Jl. Uji Catatan No. 7, Jakarta",
    p_phone: "+6281234567890",
    p_consent: true,
    ...extra,
  });

/** Marks the order paid, with agency A's cleaner, as the payment and the assignment would. */
async function paidWithCleaner(orderId: string) {
  const { error } = await adminClient().from("orders").update({ status: "paid", cleaner_id: world.users.cleanerA.id }).eq("id", orderId);
  if (error) throw new Error(`Could not mark the order paid: ${error.message}`);
}

describe("the customer's note", { timeout: 60_000 }, () => {
  it("is stored trimmed with the order, and read by the customer, the cleaner, the agency and admin", async () => {
    const { data, error } = await book(await freeWindow(), { p_note: "  Kunci di pos satpam, bilang dari unit 12B.  " });
    expect(error).toBeNull();
    const orderId = (data as { order_id: string }[])[0].order_id;
    const note = "Kunci di pos satpam, bilang dari unit 12B.";

    expect((await listMyOrders(world.users.customer.client)).find((o) => o.id === orderId)?.customerNote).toBe(note);
    await paidWithCleaner(orderId);
    expect((await listMyJobs(world.users.cleanerA.client)).find((j) => j.id === orderId)?.customerNote).toBe(note);
    expect((await listAgencyJobs(world.users.agencyA.client)).find((j) => j.id === orderId)?.customerNote).toBe(note);
    expect((await getAdminOrderDetail(world.users.admin.client, orderId))?.customerNote).toBe(note);

    // Nobody else: another cleaner and another agency do not get the job at all.
    expect((await listMyJobs(world.users.cleanerA2.client)).some((j) => j.id === orderId)).toBe(false);
    expect((await listAgencyJobs(world.users.agencyB.client)).some((j) => j.id === orderId)).toBe(false);
  });

  it("is empty when the booking has none, so a call without it still books", async () => {
    const { data, error } = await book(await freeWindow());
    expect(error).toBeNull();
    const orderId = (data as { order_id: string }[])[0].order_id;
    expect((await listMyOrders(world.users.customer.client)).find((o) => o.id === orderId)?.customerNote).toBe("");
    const blank = await book(await freeWindow(), { p_note: "   " });
    expect(blank.error).toBeNull();
  });

  it("refuses a note over 300 characters and books nothing", async () => {
    const startsAt = await freeWindow();
    expect((await book(startsAt, { p_note: "a".repeat(301) })).error?.message).toBe("note_invalid");
    const { data } = await adminClient().from("availability_slots").select("booked").eq("area_id", world.area).eq("starts_at", startsAt).single<{ booked: number }>();
    expect(data?.booked).toBe(0);
    expect((await book(startsAt, { p_note: "a".repeat(300) })).error).toBeNull();
  });

  it("cannot be longer than 300 characters in the table either", async () => {
    const { error } = await adminClient().from("orders").update({ customer_note: "a".repeat(301) }).eq("customer_id", world.users.customer.id);
    expect(error?.code).toBe("23514");
  });
});
