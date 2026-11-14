import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, createTestUser, deleteTestUsers, testProject, visitorClient, type TestUser } from "./test-project";

// B10: a photo per service (supabase/migrations/20261114300000_service_photos.sql) against the real test
// project. services.photo_url holds a site image or a photo in the service-photos bucket, nothing else;
// visitors read it with the rest of the catalog; only an admin may put, replace or remove a file in the
// bucket, and only a JPEG, PNG or WebP image of at most 2 MB.

const bucket = "service-photos";
const prefix = `b10-${randomUUID().slice(0, 8)}`;
const serviceId = `${prefix}-svc`;
const users: Partial<Record<"admin" | "customer" | "agency" | "cleaner", TestUser>> = {};
const uploaded: string[] = [];

function user(role: keyof typeof users): TestUser {
  const found = users[role];
  if (!found) throw new Error(`The ${role} test user was not created (see beforeAll).`);
  return found;
}

const bucketUrl = (name: string) => `${testProject.url.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${name}`;

// The smallest valid PNG (1 x 1 pixel); the bucket checks the declared type and the size.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

beforeAll(async () => {
  for (const role of ["admin", "customer", "agency", "cleaner"] as const) {
    const created = await createTestUser(`b10-${role}`);
    if (role !== "customer") {
      const { error } = await adminClient().from("profiles").update({ role }).eq("id", created.id);
      if (error) throw new Error(`Could not make the test user ${role}: ${error.message}`);
    }
    users[role] = created;
  }
  const { error } = await adminClient().from("services").insert({
    id: serviceId, category: "rooms", name_id: "Uji Foto", name_en: "Test Photo",
    description_id: "Layanan uji.", description_en: "A test service.", price_idr: 70000, duration_minutes: 60,
  });
  if (error) throw new Error(`Could not add the test service: ${error.message}`);
}, 90_000);

afterAll(async () => {
  if (uploaded.length > 0) await adminClient().storage.from(bucket).remove(uploaded);
  await adminClient().from("services").delete().eq("id", serviceId);
  await deleteTestUsers(Object.values(users));
}, 60_000);

describe("services.photo_url", { timeout: 30_000 }, () => {
  it("accepts a photo in the service-photos bucket or a site image, and clears to none", async () => {
    const admin = user("admin").client;
    for (const url of [bucketUrl(`${randomUUID()}.jpg`), bucketUrl(`${randomUUID()}.webp`), "/images/service-regular.jpg", null]) {
      const { error } = await admin.from("services").update({ photo_url: url }).eq("id", serviceId);
      expect(error, String(url)).toBeNull();
    }
  });

  it("refuses any other address, even from an admin", async () => {
    const admin = user("admin").client;
    for (const url of [
      "javascript:alert(1)",
      "http://example.com/photo.jpg",
      "https://example.com/photo.jpg",
      bucketUrl("../cleaner-photos/x.jpg"),
      bucketUrl(`${randomUUID()}.svg`),
      testProject.url.replace(/\/$/, "") + `/storage/v1/object/public/cleaner-photos/${randomUUID()}.jpg`,
      "/images/../secret",
      // The bucket's path on a site that is not a Supabase project (20261114310000_service_photo_host.sql).
      `https://example.com/storage/v1/object/public/${bucket}/${randomUUID()}.jpg`,
    ]) {
      const { error } = await admin.from("services").update({ photo_url: url }).eq("id", serviceId);
      expect(error?.code, url).toBe("23514");
    }
  });

  it("reaches visitors with the rest of the catalog", async () => {
    const url = bucketUrl(`${randomUUID()}.png`);
    await adminClient().from("services").update({ photo_url: url }).eq("id", serviceId);
    const { data, error } = await visitorClient().rpc("search_services", { p_query: "Uji Foto" });
    expect(error).toBeNull();
    expect((data ?? []).find((row: { id: string }) => row.id === serviceId)).toMatchObject({ photo_url: url });
  });

  it("cannot be changed by anyone but an admin", async () => {
    for (const role of ["customer", "agency", "cleaner"] as const) {
      const { data } = await user(role).client.from("services").update({ photo_url: null }).eq("id", serviceId).select("id");
      expect(data ?? [], role).toEqual([]);
    }
  });
});

describe("the service-photos bucket", { timeout: 30_000 }, () => {
  it("lets an admin add, replace and remove an image, which anyone can then see", async () => {
    const storage = user("admin").client.storage.from(bucket);
    const name = `${randomUUID()}.png`;
    uploaded.push(name);
    expect((await storage.upload(name, png, { contentType: "image/png" })).error).toBeNull();
    expect((await storage.upload(name, png, { contentType: "image/png", upsert: true })).error).toBeNull();

    const response = await fetch(bucketUrl(name));
    expect(response.status).toBe(200);

    const removal = await storage.remove([name]);
    expect(removal.error).toBeNull();
    expect(removal.data).toHaveLength(1);
  });

  it("refuses visitors, customers, agencies and cleaners", async () => {
    const clients = { visitor: visitorClient(), customer: user("customer").client, agency: user("agency").client, cleaner: user("cleaner").client };
    for (const [who, client] of Object.entries(clients)) {
      const name = `${randomUUID()}.png`;
      const { error } = await client.storage.from(bucket).upload(name, png, { contentType: "image/png" });
      if (!error) uploaded.push(name);
      expect(error, who).not.toBeNull();
    }
  });

  it("does not let anyone but an admin remove an admin's photo", async () => {
    const name = `${randomUUID()}.png`;
    uploaded.push(name);
    await user("admin").client.storage.from(bucket).upload(name, png, { contentType: "image/png" });
    for (const role of ["customer", "agency"] as const) {
      const { data } = await user(role).client.storage.from(bucket).remove([name]);
      expect(data ?? [], role).toEqual([]);
    }
    expect((await fetch(bucketUrl(name))).status).toBe(200);
  });

  it("takes only JPEG, PNG and WebP images of at most 2 MB", async () => {
    const storage = user("admin").client.storage.from(bucket);
    const text = `${randomUUID()}.png`;
    const textUpload = await storage.upload(text, Buffer.from("not an image"), { contentType: "text/plain" });
    if (!textUpload.error) uploaded.push(text);
    expect(textUpload.error).not.toBeNull();

    const big = `${randomUUID()}.jpg`;
    const bigUpload = await storage.upload(big, Buffer.alloc(2 * 1024 * 1024 + 1), { contentType: "image/jpeg" });
    if (!bigUpload.error) uploaded.push(big);
    expect(bigUpload.error).not.toBeNull();
  });
});
