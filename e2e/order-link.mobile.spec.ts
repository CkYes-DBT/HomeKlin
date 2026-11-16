import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminClient } from "../tests/integration/test-project";
import { createJobWorld, seededAgencyId, sessionOf, type JobWorld } from "./job-test-data";

// B14a, changed by the user on 2026-11-16: the private link in the order emails, /o/<token>, signs the
// order's customer in and opens their full order page (live view, recording, help), because the account
// is made when they order and the email is theirs. A made-up, revoked or expired token signs no one in
// and leads to the sign-in page with a notice. The links are stored the way createOrderLink does (only
// the token's SHA-256), with the test project's secret key. Each test starts signed out.

test.describe.configure({ mode: "serial", timeout: 90_000 });

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const address = "Jl. Rahasia Contoh No. 99, Cakung, Jakarta Timur";
const otherAddress = "Jl. Pesanan Lain Contoh No. 7, Cakung, Jakarta Timur";

let world: JobWorld;
const tokens = { good: newToken(), revoked: newToken(), expired: newToken() };
let code = "";
let orderId = "";
let otherCode = "";

test.beforeAll(async () => {
  world = await createJobWorld("d5b-link");
  const seeded = await seededAgencyId();
  const cleaner = await world.cleaner(seeded, "Uji Petugas Tautan");
  const order = await world.job({ agencyId: seeded, cleaner, startsIn: 26 * 60, address, note: "Catatan rahasia" });
  const other = await world.job({ agencyId: seeded, cleaner, startsIn: 27 * 60, address: otherAddress });
  code = order.code;
  orderId = order.id;
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

test("signs the customer in and opens their full order page", async ({ page }) => {
  await page.goto(`/o/${tokens.good}`);
  await expect(page).toHaveURL(`/orders?order=${orderId}`);
  await expect(page.getByText(code, { exact: true }).first()).toBeVisible();
  // Signed in now: the header no longer offers "Masuk".
  await expect(page.getByRole("banner").getByRole("link", { name: "Masuk", exact: true })).toHaveCount(0);
  // The session stays: the orders page opens on its own afterwards.
  await page.goto("/orders");
  await expect(page).toHaveURL("/orders");
});

test("works in English", async ({ page }) => {
  await page.goto(`/en/o/${tokens.good}`);
  await expect(page).toHaveURL(`/en/orders?order=${orderId}`);
  await expect(page.getByText(code, { exact: true }).first()).toBeVisible();
});

test("the redirect is never cached and sends no Referer", async ({ request }) => {
  const reply = await request.get(`/o/${tokens.good}`, { maxRedirects: 0 });
  expect(reply.status()).toBe(303);
  expect(reply.headers()["cache-control"]).toContain("no-store");
  expect(reply.headers()["referrer-policy"]).toBe("no-referrer");
});

test("a made-up, revoked or expired link signs no one in and shows nothing of any order", async ({ page }) => {
  for (const token of [newToken(), tokens.revoked, tokens.expired, "not-a-token"]) {
    await page.goto(`/o/${token}`);
    await expect(page).toHaveURL(/\/login\?tautan=tidak-berlaku/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const html = await page.content();
    for (const secret of [code, otherCode, address, otherAddress, "Uji Petugas Tautan"]) expect(html).not.toContain(secret);
    await page.goto("/orders");
    await expect(page).toHaveURL(/\/login\?next=/);
  }
});

// Review H1: the order's customer cancels the links in its emails from the signed-in order page, and
// the old link then opens nothing. Last in this serial file, because it revokes tokens.good.
test("the customer cancels the email links, and the old link stops working", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: await sessionOf(browser, baseURL, world.customer) });
  const page = await context.newPage();
  await page.goto(`/orders?order=${orderId}`);
  const emails = page.getByRole("region", { name: "Email pesanan" });
  await expect(emails.getByRole("button", { name: "Kirim ulang email" })).toBeVisible();
  await emails.getByRole("button", { name: "Batalkan tautan email" }).click();
  await expect(emails.getByRole("status").getByText("Tautan di email lama tidak bisa dibuka lagi.")).toBeVisible();
  await context.close();

  const visitor = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const stranger = await visitor.newPage();
  await stranger.goto(`/o/${tokens.good}`);
  await expect(stranger).toHaveURL(/\/login\?tautan=tidak-berlaku/);
  await expect(stranger.getByText(code, { exact: true })).toHaveCount(0);
  await visitor.close();
});
