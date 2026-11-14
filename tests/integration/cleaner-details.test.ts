import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listFreeSlots, listSlotWindows } from "@/lib/catalog/catalog";
import { getMyCleanerProfile, listAgencyCleaners } from "@/lib/jobs/jobs";
import { adminClient, visitorClient } from "./test-project";
import { createWorld, type World } from "./world";

// B11 (Phase 15, supabase/migrations/20261114150000_full_windows_cleaner_details.sql), against the real
// test project: slot_windows() lists the full windows too ("15.00, penuh"; free_slots() stays as it was),
// and a cleaner has a phone
// (+628..., as orders.contact_phone) and an area (one of the agency's areas), which the agency sets for
// its own cleaners and the cleaner reads on their own account.

let world: World;
let otherArea = "";

beforeAll(async () => {
  world = await createWorld("b11");
  otherArea = `${world.prefix}-x`;
  const { error } = await adminClient().from("service_areas").insert({ id: otherArea, name_id: "Uji Lain", name_en: "Test Other" });
  if (error) throw new Error(`Could not add the other area: ${error.message}`);
}, 180_000);

afterAll(async () => {
  await adminClient().from("service_areas").delete().eq("id", otherArea);
  await world.cleanup();
}, 120_000);

describe("full windows", { timeout: 60_000 }, () => {
  async function slot(agency: string, start: Date, capacity: number, booked: number) {
    const { error } = await adminClient().from("availability_slots").insert({
      agency_id: agency, area_id: world.area, capacity, booked,
      starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 2 * 3_600_000).toISOString(),
    });
    if (error) throw new Error(`Could not add a window: ${error.message}`);
  }

  it("are left out of free_slots, and listed as full by slot_windows", async () => {
    // Free soon: inside the 60 days free_slots looks ahead.
    const base = new Date(Date.now() + 10 * 86_400_000);
    base.setUTCMinutes(0, 0, 0);
    const free = new Date(base.getTime());
    const full = new Date(base.getTime() + 3 * 3_600_000);
    const shared = new Date(base.getTime() + 6 * 3_600_000);
    await slot(world.agencies.A, free, 2, 1);
    await slot(world.agencies.A, full, 1, 1);
    await slot(world.agencies.B, full, 2, 2);
    // Full at A but free at B: not full for the customer.
    await slot(world.agencies.A, shared, 1, 1);
    await slot(world.agencies.B, shared, 1, 0);

    const at = <T extends { startsAt: string }>(list: T[], when: Date) => list.find((w) => w.startsAt === when.toISOString());
    const options = { days: 30 };
    const plain = await listFreeSlots(visitorClient(), world.area, options);
    expect(at(plain, free)).toBeDefined();
    expect(at(plain, full)).toBeUndefined();
    expect(at(plain, shared)).toBeDefined();

    const all = await listSlotWindows(visitorClient(), world.area, options);
    expect(at(all, free)?.isFull).toBe(false);
    expect(at(all, full)?.isFull).toBe(true);
    expect(at(all, shared)?.isFull).toBe(false);
    // One row per window, however many agencies have it.
    expect(all.filter((w) => w.startsAt === full.toISOString())).toHaveLength(1);
  });

  it("returns times and the full flag only, never an agency, a capacity or a count", async () => {
    const { data, error } = await visitorClient().rpc("slot_windows", {
      p_area: world.area, p_from: new Date().toISOString(), p_to: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
    for (const row of data ?? []) expect(Object.keys(row).sort()).toEqual(["ends_at", "is_full", "starts_at"]);
  });

  it("leaves out a suspended agency's windows", async () => {
    const start = new Date(Date.now() + 20 * 86_400_000);
    start.setUTCMinutes(0, 0, 0);
    await slot(world.agencies.B, start, 1, 1);
    await adminClient().from("agencies").update({ status: "suspended" }).eq("id", world.agencies.B);
    try {
      const all = await listSlotWindows(visitorClient(), world.area, { days: 30 });
      expect(all.some((w) => w.startsAt === start.toISOString())).toBe(false);
    } finally {
      await adminClient().from("agencies").update({ status: "active" }).eq("id", world.agencies.B);
    }
  });
});

describe("a cleaner's phone and area", { timeout: 60_000 }, () => {
  const set = (cleaner: string, phone: string | null, area: string | null, agency = world.users.agencyA) =>
    agency.client.rpc("set_cleaner_details", { p_cleaner: cleaner, p_phone: phone, p_area: area });

  it("are set by the agency for its own cleaner, and read by the agency and the cleaner", async () => {
    expect((await set(world.users.cleanerA.id, " +6281299990000 ", world.area)).error).toBeNull();

    const mine = await getMyCleanerProfile(world.users.cleanerA.client);
    expect(mine).toEqual({ id: world.users.cleanerA.id, fullName: "Uji Petugas A", photoUrl: null, phone: "+6281299990000", areaId: world.area });
    const listed = (await listAgencyCleaners(world.users.agencyA.client)).find((c) => c.id === world.users.cleanerA.id);
    expect(listed).toMatchObject({ phone: "+6281299990000", areaId: world.area });

    // Empty or null clears them.
    expect((await set(world.users.cleanerA.id, "", null)).error).toBeNull();
    expect(await getMyCleanerProfile(world.users.cleanerA.client)).toMatchObject({ phone: null, areaId: null });
  });

  it("refuses a bad phone, an area the agency does not serve, and another agency's cleaner", async () => {
    expect((await set(world.users.cleanerA.id, "0812-3456", world.area)).error?.message).toBe("phone_invalid");
    expect((await set(world.users.cleanerA.id, "+6281299990000", otherArea)).error?.message).toBe("area_invalid");
    expect((await set(world.users.cleanerA.id, "+6281299990000", "no-such-area")).error?.message).toBe("area_invalid");
    expect((await set(world.users.cleanerB.id, "+6281299990000", world.area)).error?.message).toBe("cleaner_not_found");
    // Agency B does not see agency A's cleaner details.
    expect((await listAgencyCleaners(world.users.agencyB.client)).some((c) => c.id === world.users.cleanerA.id)).toBe(false);
  });

  it("are for the agency to set and the cleaner to read, nobody else", async () => {
    for (const user of [world.users.customer, world.users.cleanerA, world.users.admin]) {
      expect((await set(world.users.cleanerA.id, "+6281299990000", world.area, user)).error?.message, user.email).toBe("not_agency");
    }
    for (const user of [world.users.customer, world.users.agencyA, world.users.admin]) {
      expect((await user.client.rpc("my_cleaner_profile")).error?.message, user.email).toBe("not_cleaner");
    }
    expect((await visitorClient().rpc("my_cleaner_profile")).error).not.toBeNull();
  });

  it("cannot hold a malformed phone in the table either", async () => {
    const { error } = await adminClient().from("cleaners").update({ phone: "12345" }).eq("user_id", world.users.cleanerA.id);
    expect(error?.code).toBe("23514");
  });
});
