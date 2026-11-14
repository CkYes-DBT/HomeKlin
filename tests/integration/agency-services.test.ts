import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listFreeSlots, listServices, listSlotWindows } from "@/lib/catalog/catalog";
import { listAgencyServiceChoices } from "@/lib/agency/agency";
import { adminClient, visitorClient } from "./test-project";
import { createWorld, type World } from "./world";

// B12 (supabase/migrations/20261114230000_agency_services.sql), against the real test project: each
// agency chooses which services it offers (Partner-Services). An agency that never chose offers every
// service, as before; once it saves a choice, only those. Free windows for a service, the services
// listed for an area, and book_slot's routing all follow the choice.

let world: World;
let window = 0;

beforeAll(async () => {
  world = await createWorld("b12");
}, 180_000);

afterAll(async () => {
  await world.cleanup();
}, 120_000);

/** One window at the same time for agencies A and B, far ahead, each with one place. */
async function sharedWindow(): Promise<string> {
  window += 1;
  const start = new Date(Date.now() + (5 + window) * 86_400_000);
  start.setUTCMinutes(0, 0, 0);
  const times = { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 2 * 3_600_000).toISOString() };
  const { error } = await adminClient().from("availability_slots").insert([
    { agency_id: world.agencies.A, area_id: world.area, capacity: 1, booked: 0, ...times },
    { agency_id: world.agencies.B, area_id: world.area, capacity: 1, booked: 0, ...times },
  ]);
  if (error) throw new Error(`Could not add the windows: ${error.message}`);
  return times.starts_at;
}

const choose = (agency: "A" | "B", services: string[] | null) =>
  (agency === "A" ? world.users.agencyA : world.users.agencyB).client.rpc("set_agency_services", { p_services: services });

const book = (startsAt: string) =>
  world.users.customer.client.rpc("book_slot", {
    p_service: world.serviceId, p_area: world.area, p_starts_at: startsAt,
    p_address: "Jl. Uji Layanan No. 3, Jakarta", p_phone: "+6281234567890", p_consent: true,
  });

const agencyOf = async (orderId: string) =>
  (await adminClient().from("orders").select("agency_id").eq("id", orderId).single<{ agency_id: string }>()).data?.agency_id;

describe("services per agency", { timeout: 60_000 }, () => {
  it("offers every service until the agency chooses, and lists the choice", async () => {
    const choices = await listAgencyServiceChoices(world.users.agencyA.client);
    expect(choices.find((c) => c.serviceId === world.serviceId)).toMatchObject({ offered: true, restricted: false });
    const area = await listServices(visitorClient(), { areaId: world.area });
    expect(area.some((s) => s.id === world.serviceId)).toBe(true);
  });

  it("routes a booking only to an agency that offers the service", async () => {
    expect((await choose("A", [])).error).toBeNull();
    const choices = await listAgencyServiceChoices(world.users.agencyA.client);
    expect(choices.find((c) => c.serviceId === world.serviceId)).toMatchObject({ offered: false, restricted: true });

    for (let i = 0; i < 2; i += 1) {
      const startsAt = await sharedWindow();
      const { data, error } = await book(startsAt);
      expect(error).toBeNull();
      expect(await agencyOf((data as { order_id: string }[])[0].order_id)).toBe(world.agencies.B);
    }
  });

  it("shows the free windows of a service only where an agency offers it, and refuses a booking nobody can take", async () => {
    const startsAt = await sharedWindow();
    expect((await choose("A", [])).error).toBeNull();
    expect((await choose("B", [])).error).toBeNull();
    try {
      const forService = await listFreeSlots(visitorClient(), world.area, { days: 30, serviceId: world.serviceId });
      expect(forService.some((w) => w.startsAt === startsAt)).toBe(false);
      const windows = await listSlotWindows(visitorClient(), world.area, { days: 30, serviceId: world.serviceId });
      expect(windows.some((w) => w.startsAt === startsAt)).toBe(false);
      // Without a service the windows are still there (as before B12).
      expect((await listFreeSlots(visitorClient(), world.area, { days: 30 })).some((w) => w.startsAt === startsAt)).toBe(true);
      expect((await listServices(visitorClient(), { areaId: world.area })).some((s) => s.id === world.serviceId)).toBe(false);
      expect((await book(startsAt)).error?.message).toBe("slot_unavailable");
    } finally {
      // B offers it again by name, A goes back to offering everything.
      expect((await choose("B", [world.serviceId])).error).toBeNull();
      expect((await choose("A", null)).error).toBeNull();
    }
    expect((await listFreeSlots(visitorClient(), world.area, { days: 30, serviceId: world.serviceId })).some((w) => w.startsAt === startsAt)).toBe(true);
    expect((await listAgencyServiceChoices(world.users.agencyA.client)).find((c) => c.serviceId === world.serviceId)).toMatchObject({ offered: true, restricted: false });
  });

  it("refuses an unknown service, and anyone but an agency", async () => {
    expect((await choose("A", ["no-such-service"])).error?.message).toBe("service_invalid");
    for (const user of [world.users.customer, world.users.admin, world.users.cleanerA]) {
      expect((await user.client.rpc("set_agency_services", { p_services: [] })).error?.message, user.email).toBe("not_agency");
      expect((await user.client.rpc("agency_service_choices")).error?.message, user.email).toBe("not_agency");
    }
  });
});
