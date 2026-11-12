import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedMonitorJobs } from "../../scripts/seed.mjs";
import { listLiveStreams } from "@/lib/stream/streams";
import { adminClient } from "./test-project";
import { createWorld, type World } from "./world";

// The live monitor's demo jobs (M1, scripts/seed.mjs seedMonitorJobs), against the real test project,
// in a world of their own: each job is checked in and streaming in its status, admin's monitor lists
// them, and a second run starts the same jobs over instead of adding more.

let world: World;
let jobs: Parameters<typeof seedMonitorJobs>[0]["jobs"];

beforeAll(async () => {
  world = await createWorld("monitorseed");
  const base = { serviceId: world.serviceId, areaId: world.area, hours: 3 };
  jobs = [
    { ...base, id: randomUUID(), agencyId: world.agencies.A, cleanerId: world.users.cleanerA.id, status: "active", startedMinutesAgo: 30 },
    { ...base, id: randomUUID(), agencyId: world.agencies.A, cleanerId: world.users.cleanerA2.id, status: "weak", startedMinutesAgo: 45 },
    { ...base, id: randomUUID(), agencyId: world.agencies.B, cleanerId: world.users.cleanerB.id, status: "disconnected", startedMinutesAgo: 60 },
  ];
}, 180_000);

afterAll(async () => {
  await world.cleanup();
}, 120_000);

describe("seedMonitorJobs", { timeout: 60_000 }, () => {
  it("makes checked-in jobs whose streams admin sees in their status, and starts them over on a second run", async () => {
    const customerId = world.users.customer.id;
    await seedMonitorJobs({ client: adminClient(), customerId, jobs });
    await seedMonitorJobs({ client: adminClient(), customerId, jobs });

    const streams = await listLiveStreams(world.users.admin.client);
    for (const job of jobs) {
      const own = streams.filter((stream) => stream.orderId === job.id);
      expect(own).toHaveLength(1);
      expect(own[0]?.status).toBe(job.status);
      expect(own[0]?.orderCode).toMatch(/^HK-\d{4,}$/);
    }

    const { data, error } = await adminClient().from("orders").select("checked_in_at, completed_at").in("id", jobs.map((job) => job.id));
    expect(error).toBeNull();
    expect(data).toHaveLength(jobs.length);
    for (const row of data ?? []) {
      expect(row.checked_in_at).not.toBeNull();
      expect(row.completed_at).toBeNull();
    }
    const windows = await adminClient().from("availability_slots").select("id", { count: "exact", head: true }).eq("area_id", world.area);
    expect(windows.count).toBe(jobs.length);
  });
});
