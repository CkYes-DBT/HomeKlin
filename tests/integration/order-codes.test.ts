import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAdminJobs } from "@/lib/jobs/jobs";
import { listLiveStreams } from "@/lib/stream/streams";
import { adminClient } from "./test-project";
import { createWorld, hours, type World } from "./world";

// The short order number (supabase/migrations/20261112090000_order_codes.sql), against the real test
// project: every order gets one, in the form HK-<number>, no two orders share one (also when many are
// made at the same moment), and nobody can change it afterwards, not even with the secret key.

let world: World;

beforeAll(async () => {
  world = await createWorld("ordercode");
}, 180_000);

afterAll(async () => {
  await world.cleanup();
}, 120_000);

const codeOf = async (orderId: string) => {
  const { data, error } = await adminClient().from("orders").select("code").eq("id", orderId).single();
  if (error) throw new Error(error.message);
  return data.code as string;
};

describe("order codes", { timeout: 60_000 }, () => {
  it("gives every order an HK number, and a later order a higher one", async () => {
    const first = await world.job({ startsAt: new Date(Date.now() + hours(48)) });
    const second = await world.job({ startsAt: new Date(Date.now() + hours(50)) });
    const [a, b] = [await codeOf(first), await codeOf(second)];
    expect(a).toMatch(/^HK-\d{4,}$/);
    expect(b).toMatch(/^HK-\d{4,}$/);
    expect(Number(b.slice(3))).toBeGreaterThan(Number(a.slice(3)));
  });

  it("never gives two orders the same code, even when they are made at once", async () => {
    const ids = await Promise.all(
      Array.from({ length: 8 }, (_, index) => world.job({ startsAt: new Date(Date.now() + hours(60 + index * 3)) })),
    );
    const codes = await Promise.all(ids.map(codeOf));
    expect(new Set(codes).size).toBe(codes.length);

    const { count, error } = await adminClient().from("orders").select("code", { count: "exact", head: true }).is("code", null);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it("refuses a duplicate code and any change of a code", async () => {
    const one = await world.job({ startsAt: new Date(Date.now() + hours(100)) });
    const two = await world.job({ startsAt: new Date(Date.now() + hours(103)) });
    const code = await codeOf(one);

    const changed = await adminClient().from("orders").update({ code: "HK-999999" }).eq("id", one);
    expect(changed.error?.message).toBe("order_code_fixed");
    // Taking another order's code later is refused by the same trigger.
    const copied = await adminClient().from("orders").update({ code }).eq("id", two);
    expect(copied.error?.message).toBe("order_code_fixed");
    expect(await codeOf(one)).toBe(code);

    // A new order that names a code already in use is refused by the unique constraint.
    const { data: row, error: readError } = await adminClient().from("orders").select("*").eq("id", one).single();
    expect(readError).toBeNull();
    const copy: Record<string, unknown> = { ...(row as Record<string, unknown>), code };
    delete copy.id;
    delete copy.created_at;
    const duplicate = await adminClient().from("orders").insert(copy);
    expect(duplicate.error?.code).toBe("23505");
  });

  it("is listed with each live stream for admin", async () => {
    const orderId = await world.job({ startsAt: new Date(Date.now() - hours(0.5)), checkedIn: true });
    const { error } = await world.users.cleanerA.client.rpc("start_stream", { p_order: orderId });
    expect(error).toBeNull();
    const streams = await listLiveStreams(world.users.admin.client);
    expect(streams.find((stream) => stream.orderId === orderId)?.orderCode).toBe(await codeOf(orderId));
  });

  it("is listed with each job admin sees", async () => {
    const orderId = await world.job({ startsAt: new Date(Date.now() + hours(2)) });
    const jobs = await listAdminJobs(world.users.admin.client);
    expect(jobs.find((job) => job.id === orderId)?.orderCode).toBe(await codeOf(orderId));
  });
});
