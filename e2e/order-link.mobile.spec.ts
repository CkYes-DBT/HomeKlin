import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminClient } from "../tests/integration/test-project";
import { agencyMarks } from "./booking-test-data";
import { createJobWorld, seededAgencyId, type JobWorld } from "./job-test-data";

// B14a with its page (D5 pass 5b): the private link in the order emails, /o/<token>, opens that one
// order's page without signing in. It shows the order number, the service, the time, the area, the
// status steps and the Petugas HomeKlin, but never the address, the phone, the email or the agency, and
// nothing of any other order. A made-up, revoked or expired token gets one plain answer. The links are
// stored the way createOrderLink does (only the token's SHA-256), with the test project's secret key.

test.describe.configure({ mode: "serial", timeout: 90_000 });

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const address = "Jl. Rahasia Contoh No. 99, Cakung, Jakarta Timur";
const otherAddress = "Jl. Pesanan Lain Contoh No. 7, Cakung, Jakarta Timur";

let world: JobWorld;
const tokens = { good: newToken(), revoked: newToken(), expired: newToken() };
let code = "";
let otherCode = "";

test.beforeAll(async () => {
  world = await createJobWorld("d5b-link");
  const seeded = await seededAgencyId();
  const cleaner = await world.cleaner(seeded, "Uji Petugas Tautan");
  const order = await world.job({ agencyId: seeded, cleaner, startsIn: 26 * 60, address, note: "Catatan rahasia" });
  const other = await world.job({ agencyId: seeded, cleaner, startsIn: 27 * 60, address: otherAddress });
  code = order.code;
  otherCode = other.code;
  const admin = adminClient();
  // Every row names every column: a batch insert sends the missing ones as null.
  const later = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const { error } = await admin.from("order_links").insert([
    { order_id: order.id, token_hash: sha256(tokens.good), expires_at: later, revoked_at: null },
    { order_id: order.id, token_hash: sha256(tokens.revoked), expires_at: later, revoked_at: new Date().toISOString() },
    { order_id: other.id, token_hash: sha256(tokens.expired), expires_at: new Date(Date.now() - 60_000).toISOString(), revoked_at: null },
  ]);
  if (error) throw new Error(`Could not store the test links: ${error.message}`);
});

test.afterAll(async () => {
  await world?.cleanup();
});

test("opens that one order without signing in, with no address, phone or agency", async ({ page }) => {
  await page.goto(`/o/${tokens.good}`);
  await expect(page.getByText("Tautan ini khusus untuk Anda.")).toBeVisible();
  const details = page.getByRole("region", { name: "Detail pesanan" });
  await expect(details.getByText(code, { exact: true })).toBeVisible();
  await expect(details).toContainText("Pembersihan Rutin");
  await expect(details).toContainText("Jakarta Timur");
  await expect(page.getByRole("region", { name: "Petugas HomeKlin" })).toContainText("Uji Petugas Tautan");
  await expect(page.getByRole("region", { name: "Status pekerjaan" })).toBeVisible();
  // Still signed out: the header offers "Masuk", and watching leads to signing in.
  await expect(page.getByRole("banner").getByRole("link", { name: "Masuk", exact: true })).toBeVisible();

  const marks = await agencyMarks();
  const served = await (await page.request.get(`/o/${tokens.good}`)).text();
  for (const html of [await page.content(), served]) {
    for (const secret of [address, otherAddress, otherCode, "Catatan rahasia", "+6281234567890", "@example.com"]) {
      expect(html).not.toContain(secret);
    }
    expect(html).not.toMatch(/agensi|agency|mitra|partner/i);
    for (const mark of marks) expect(html).not.toContain(mark);
  }
});

test("works in English", async ({ page }) => {
  await page.goto(`/en/o/${tokens.good}`);
  await expect(page.getByText("This link is for you only.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Order details" }).getByText(code, { exact: true })).toBeVisible();
});

test("a made-up, revoked or expired link shows nothing of any order", async ({ page }) => {
  for (const token of [newToken(), tokens.revoked, tokens.expired, "not-a-token"]) {
    await page.goto(`/o/${token}`);
    await expect(page.getByRole("heading", { level: 1, name: "Tautan ini tidak berlaku" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Detail pesanan" })).toHaveCount(0);
    const html = await page.content();
    for (const secret of [code, otherCode, address, otherAddress, "Uji Petugas Tautan"]) expect(html).not.toContain(secret);
  }
});

test.describe("at 360 px", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("has no sideways scroll", async ({ page }) => {
    for (const path of [`/o/${tokens.good}`, `/en/o/${tokens.good}`, "/o/not-a-token"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    }
  });
});
