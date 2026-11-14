import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, visitorClient } from "./test-project";
import { createWorld, hours, type World } from "./world";

// B14a (supabase/migrations/20261114220000_order_links.sql), against the real test project: a private
// link in the order's emails opens that one order's page without signing in. The link is a random
// token; the database keeps only its SHA-256. It shows only that order (no address, phone or email, in
// case the email is forwarded), works for 30 days, and the order's customer can revoke it. The link
// functions answer the server's secret key only; the customer's revoke is their own.

let world: World;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

beforeAll(async () => {
  world = await createWorld("b14");
}, 180_000);

afterAll(async () => {
  await world.cleanup();
}, 120_000);

const issue = (order: string, token: string) => adminClient().rpc("issue_order_link", { p_order: order, p_token_hash: hash(token) });
const view = (token: string) => adminClient().rpc("order_by_link", { p_token_hash: hash(token) });

describe("an order link", { timeout: 60_000 }, () => {
  it("opens that one order, without the address, the phone or anyone's email", async () => {
    const order = await world.job({ startsAt: new Date(Date.now() - hours(3)), completed: true });
    const other = await world.job({ startsAt: new Date(Date.now() + hours(3)) });
    const token = newToken();
    expect((await issue(order, token)).error).toBeNull();

    const { data, error } = await view(token);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const { data: code } = await adminClient().from("orders").select("code").eq("id", order).single<{ code: string }>();
    expect(data[0]).toMatchObject({ order_id: order, order_code: code?.code, service_id: world.serviceId, status: "paid", cleaner_name: "Uji Petugas A" });
    expect(data[0].completed_at).not.toBeNull();
    const text = JSON.stringify(data);
    for (const secret of ["Jl. Uji", "+6281234567890", world.users.customer.email, world.users.customer.id, other]) {
      expect(text).not.toContain(secret);
    }
    for (const key of ["address", "contact_phone", "customer_id", "agency_id", "customer_note"]) expect(Object.keys(data[0])).not.toContain(key);
  });

  it("opens nothing with another token, a revoked link or an expired one", async () => {
    const order = await world.job({ startsAt: new Date(Date.now() + hours(4)) });
    const token = newToken();
    await issue(order, token);
    expect((await view(newToken())).error?.message).toBe("link_not_found");

    // An expired link.
    const old = newToken();
    await issue(order, old);
    await adminClient().from("order_links").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("token_hash", hash(old));
    expect((await view(old)).error?.message).toBe("link_not_found");

    // The customer revokes every link of the order; another customer cannot.
    expect((await world.users.otherCustomer.client.rpc("revoke_order_links", { p_order: order })).error?.message).toBe("order_not_found");
    expect((await view(token)).error).toBeNull();
    expect((await world.users.customer.client.rpc("revoke_order_links", { p_order: order })).error).toBeNull();
    expect((await view(token)).error?.message).toBe("link_not_found");
  });

  it("is refused for an unknown order and a malformed hash", async () => {
    expect((await issue(randomUUID(), newToken())).error?.message).toBe("order_not_found");
    const order = await world.job({ startsAt: new Date(Date.now() + hours(5)) });
    expect((await adminClient().rpc("issue_order_link", { p_order: order, p_token_hash: "short" })).error?.message).toBe("token_invalid");
  });

  it("cannot be issued or read with the public key or any user's session", async () => {
    const order = await world.job({ startsAt: new Date(Date.now() + hours(6)) });
    const token = newToken();
    await issue(order, token);
    for (const client of [visitorClient(), world.users.customer.client, world.users.admin.client]) {
      expect((await client.rpc("order_by_link", { p_token_hash: hash(token) })).error?.code).toBe("42501");
      expect((await client.rpc("issue_order_link", { p_order: order, p_token_hash: hash(newToken()) })).error?.code).toBe("42501");
      expect((await client.from("order_links").select("token_hash")).data ?? []).toEqual([]);
    }
    for (const user of [world.users.agencyA, world.users.admin]) {
      expect((await user.client.rpc("revoke_order_links", { p_order: order })).error?.message).toBe("not_customer");
    }
  });
});
