import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, visitorClient } from "./test-project";
import { createWorld, hours, minutes, type World } from "./world";

// B9 (Phase 15, supabase/migrations/20261114210000_order_emails.sql), against the real test project:
// what the server needs to write an order's emails (order_email_facts, for the secret key only), and
// "Kirim ulang email": the order's own customer may ask for the confirmation again, at most once per 5
// minutes (claim_order_email_resend). No email is sent here.

let world: World;

beforeAll(async () => {
  world = await createWorld("b9");
}, 180_000);

afterAll(async () => {
  await world.cleanup();
}, 120_000);

describe("order_email_facts", { timeout: 60_000 }, () => {
  it("gives the server the customer's email, the order, the cleaner and the recording", async () => {
    const order = await world.job({ startsAt: new Date(Date.now() - hours(3)), completed: true });
    const expires = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await adminClient().from("recordings").insert({ order_id: order, agency_id: world.agencies.A, file_path: `jobs/${randomUUID()}.mp4`, expires_at: expires });

    const { data, error } = await adminClient().rpc("order_email_facts", { p_order: order });
    expect(error).toBeNull();
    const { data: code } = await adminClient().from("orders").select("code").eq("id", order).single<{ code: string }>();
    expect(data[0]).toMatchObject({
      customer_email: world.users.customer.email,
      order_code: code?.code,
      service_name_id: "Uji b9",
      service_name_en: "Test b9",
      address: "Jl. Uji Pekerjaan No. 18, Jakarta",
      price_idr: world.price,
      status: "paid",
      cleaner_name: "Uji Petugas A",
      cleaner_photo_url: null,
    });
    expect(new Date(data[0].recording_expires_at).toISOString()).toBe(expires);
    await adminClient().from("recordings").delete().eq("order_id", order);
  });

  it("answers order_not_found for an unknown order, and nobody but the server", async () => {
    expect((await adminClient().rpc("order_email_facts", { p_order: randomUUID() })).error?.message).toBe("order_not_found");
    const order = await world.job({ startsAt: new Date(Date.now() + hours(5)) });
    for (const client of [visitorClient(), world.users.customer.client, world.users.admin.client, world.users.agencyA.client]) {
      expect((await client.rpc("order_email_facts", { p_order: order })).error?.code).toBe("42501");
    }
  });
});

describe("claim_order_email_resend", { timeout: 60_000 }, () => {
  it("lets the order's customer ask again at most once per 5 minutes", async () => {
    const order = await world.job({ startsAt: new Date(Date.now() + hours(6)), status: "pending_payment", cleaner: null });
    const claim = () => world.users.customer.client.rpc("claim_order_email_resend", { p_order: order });
    expect((await claim()).error).toBeNull();
    expect((await claim()).error?.message).toBe("too_soon");

    await adminClient().from("orders").update({ email_resent_at: new Date(Date.now() - minutes(6)).toISOString() }).eq("id", order);
    expect((await claim()).error).toBeNull();
  });

  it("is refused for someone else's order, and to anyone but a customer", async () => {
    const order = await world.job({ startsAt: new Date(Date.now() + hours(7)) });
    expect((await world.users.otherCustomer.client.rpc("claim_order_email_resend", { p_order: order })).error?.message).toBe("order_not_found");
    for (const user of [world.users.agencyA, world.users.admin, world.users.cleanerA]) {
      expect((await user.client.rpc("claim_order_email_resend", { p_order: order })).error?.message, user.email).toBe("not_customer");
    }
    expect((await visitorClient().rpc("claim_order_email_resend", { p_order: order })).error).not.toBeNull();
  });
});
