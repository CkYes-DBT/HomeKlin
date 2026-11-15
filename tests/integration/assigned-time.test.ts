import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listMyOrders } from "@/lib/booking/orders";
import { listAgencyJobs } from "@/lib/jobs/jobs";
import { createWorld, hours, type World } from "./world";

// B3 (Phase 15): the time the agency gave the job to a cleaner, for the "Ditugaskan" step of every
// timeline (supabase/migrations/20261114110000_assigned_time.sql), against the real test project.

let world: World;

beforeAll(async () => {
  world = await createWorld("b3");
}, 180_000);

afterAll(async () => {
  await world.cleanup();
}, 120_000);

const assign = (order: string, cleaner = world.users.cleanerA) =>
  world.users.agencyA.client.rpc("assign_cleaner", { p_order: order, p_cleaner: cleaner.id });

describe("the assigned time", { timeout: 60_000 }, () => {
  it("is empty until the agency assigns a cleaner, then set by assign_cleaner", async () => {
    const job = await world.job({ startsAt: new Date(Date.now() + hours(5)), cleaner: null });
    const before = (await listAgencyJobs(world.users.agencyA.client)).find((row) => row.id === job);
    expect(before?.assignedAt).toBeNull();

    const start = Date.now();
    expect((await assign(job)).error).toBeNull();
    const after = (await listAgencyJobs(world.users.agencyA.client)).find((row) => row.id === job);
    expect(after?.assignedAt).not.toBeNull();
    // The database clock may differ a little from this machine's.
    expect(Math.abs(new Date(after?.assignedAt ?? 0).getTime() - start)).toBeLessThan(60_000);

    // The customer's timeline shows the same time.
    const order = (await listMyOrders(world.users.customer.client)).find((row) => row.id === job);
    expect(order?.assignedAt).toBe(after?.assignedAt);
  });

  it("moves to the time of a new assignment when the agency gives the job to another cleaner", async () => {
    const job = await world.job({ startsAt: new Date(Date.now() + hours(6)), cleaner: null });
    expect((await assign(job)).error).toBeNull();
    const first = (await listAgencyJobs(world.users.agencyA.client)).find((row) => row.id === job)?.assignedAt;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect((await assign(job, world.users.cleanerA2)).error).toBeNull();
    const second = (await listAgencyJobs(world.users.agencyA.client)).find((row) => row.id === job)?.assignedAt;
    expect(new Date(second ?? 0).getTime()).toBeGreaterThan(new Date(first ?? 0).getTime());
  });

  it("answers whether the job got a different cleaner, so the email goes only then (review L4)", async () => {
    const job = await world.job({ startsAt: new Date(Date.now() + hours(8)), cleaner: null });
    expect(await assign(job)).toMatchObject({ data: true, error: null });
    expect(await assign(job)).toMatchObject({ data: false, error: null });
    expect(await assign(job, world.users.cleanerA2)).toMatchObject({ data: true, error: null });
    expect(await assign(job, world.users.cleanerA2)).toMatchObject({ data: false, error: null });
  });

  it("is not changed by a refused assignment", async () => {
    const job = await world.job({ startsAt: new Date(Date.now() + hours(7)), cleaner: null });
    // Agency B's cleaner is not agency A's to assign.
    expect((await assign(job, world.users.cleanerB)).error?.message).toBe("cleaner_not_found");
    expect((await listAgencyJobs(world.users.agencyA.client)).find((row) => row.id === job)?.assignedAt).toBeNull();
  });
});
