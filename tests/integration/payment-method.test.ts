import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listMyOrders } from "@/lib/booking/orders";
import { getAdminOrderDetail } from "@/lib/jobs/admin-order";
import { adminClient } from "./test-project";
import { createWorld, hours, type World } from "./world";

// B8 (Phase 15, supabase/migrations/20261114190000_payment_method.sql): the payment method from
// Midtrans' checked notification (payment_type, e.g. "bank_transfer", "qris", "gopay") is kept with the
// order when it is paid, and shown to the customer and admin. A call without it still works.

let world: World;

beforeAll(async () => {
  world = await createWorld("b8");
}, 180_000);

afterAll(async () => {
  await world.cleanup();
}, 120_000);

const unpaid = () => world.job({ startsAt: new Date(Date.now() + hours(30)), status: "pending_payment", cleaner: null });
const apply = (order: string, status: string, paymentType?: string | null) =>
  adminClient().rpc("apply_payment_result", {
    p_order: order, p_status: status, p_amount: world.price,
    ...(paymentType === undefined ? {} : { p_payment_type: paymentType }),
  });
const methodOf = async (order: string) => (await listMyOrders(world.users.customer.client)).find((o) => o.id === order)?.paymentMethod;

describe("the payment method", { timeout: 60_000 }, () => {
  it("is kept when the order is paid, for the customer and admin", async () => {
    const order = await unpaid();
    expect((await apply(order, "paid", "bank_transfer")).data).toBe("paid");
    expect(await methodOf(order)).toBe("bank_transfer");
    expect((await getAdminOrderDetail(world.users.admin.client, order))?.paymentMethod).toBe("bank_transfer");
    // A repeated notification with another method changes nothing.
    await apply(order, "paid", "qris");
    expect(await methodOf(order)).toBe("bank_transfer");
  });

  it("is empty for an unpaid or failed order, and for a call without it", async () => {
    const waiting = await unpaid();
    expect(await methodOf(waiting)).toBeNull();
    const failed = await unpaid();
    await apply(failed, "failed", "credit_card");
    expect(await methodOf(failed)).toBeNull();
    const old = await unpaid();
    expect((await apply(old, "paid")).error).toBeNull();
    expect(await methodOf(old)).toBeNull();
  });

  it("keeps only Midtrans' own form of a method name, and never refuses the payment over it", async () => {
    const order = await unpaid();
    expect((await apply(order, "paid", "Bank Transfer; drop")).data).toBe("paid");
    expect(await methodOf(order)).toBeNull();
  });
});
