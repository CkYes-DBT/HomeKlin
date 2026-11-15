import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import { adminClient } from "../tests/integration/test-project";

// B13 with its page (D5 pass 5b, mocks Customer-Support and Customer-Chat): a visitor without an
// account asks admin from /support and chats on /support?ticket=<id>. The chat is this browser's
// alone: its token lives in an httpOnly cookie, so another visitor who opens the same address sees the
// sign-in note and nothing of the chat. The guest has no Realtime, so admin's reply and "Terbaca" arrive
// by the page asking again (every 10 seconds). The ticket is deleted at the end; the database allows 5
// new guest chats per address per hour, so this spec opens one.

test.describe.configure({ mode: "serial", timeout: 90_000 });

const question = `Apakah Petugas membawa alat sendiri? (${randomUUID().slice(0, 6)})`;
const reply = "Ya, Petugas HomeKlin membawa alat dan bahan pembersih sendiri.";
let guest: BrowserContext;
let ticketId = "";

test.beforeAll(async ({ browser, baseURL }) => {
  guest = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
});

test.afterAll(async () => {
  await guest?.close();
  if (ticketId) await adminClient().from("support_tickets").delete().eq("id", ticketId);
});

test("a visitor asks admin without an account and lands on the chat", async () => {
  const page = await guest.newPage();
  await page.goto(`/support?q=${encodeURIComponent("alat sendiri")}`);
  const panel = page.getByRole("region", { name: /Hubungi admin/ });
  await panel.getByLabel("Nama Anda").fill("Uji Tamu Bantuan");
  await panel.getByLabel("Pertanyaan Anda").fill(question);
  await panel.getByRole("button", { name: "Chat dengan admin" }).click();
  await expect(page).toHaveURL(/\/support\?ticket=[0-9a-f-]{36}$/, { timeout: 15_000 });
  ticketId = new URL(page.url()).searchParams.get("ticket") ?? "";

  const chat = page.getByRole("region", { name: "Percakapan dengan Tim HomeKlin" });
  const messages = chat.getByRole("list", { name: "Pesan" });
  await expect(messages.getByRole("listitem")).toHaveCount(1);
  await expect(messages.getByRole("listitem").first()).toContainText(question);
  await expect(messages.getByRole("listitem").first()).toContainText("Terkirim");
  await expect(chat.getByText("Diperbarui otomatis setiap 10 detik")).toBeVisible();

  // The chat's key is an httpOnly cookie: the page's scripts cannot read it.
  const cookie = (await guest.cookies()).find((entry) => entry.name === "hk_guest_ticket");
  expect(cookie?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("hk_guest_ticket");

  await chat.getByRole("textbox", { name: "Tulis pesan" }).fill("Rumah saya dua lantai.");
  await chat.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(messages.getByRole("listitem")).toHaveCount(2);
  await expect(messages.getByRole("listitem").last()).toContainText("Rumah saya dua lantai.");
});

test("another visitor opening the same address sees nothing of the chat", async ({ browser, baseURL }) => {
  const other = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const page = await other.newPage();
    await page.goto(`/support?ticket=${ticketId}`);
    await expect(page.getByRole("link", { name: "Masuk untuk bertanya" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Pesan" })).toHaveCount(0);
    const served = await (await page.request.get(`/support?ticket=${ticketId}`)).text();
    for (const html of [await page.content(), served]) {
      expect(html).not.toContain(question);
      expect(html).not.toContain("Uji Tamu Bantuan");
    }
    // And /support offers it a chat of its own, not this one.
    await page.goto("/support");
    await expect(page.getByRole("link", { name: "Lanjutkan chat Anda" })).toHaveCount(0);
    await expect(page.getByLabel("Nama Anda")).toBeVisible();
  } finally {
    await other.close();
  }
});

test("admin's reply and the read mark reach the guest without a reload", async () => {
  const page = await guest.newPage();
  await page.goto(`/support?ticket=${ticketId}`);
  const chat = page.getByRole("region", { name: "Percakapan dengan Tim HomeKlin" });
  const messages = chat.getByRole("list", { name: "Pesan" });
  await expect(messages.getByRole("listitem")).toHaveCount(2);

  const admin = adminClient();
  const sent = await admin.from("ticket_messages").insert({ ticket_id: ticketId, from_admin: true, body: reply });
  expect(sent.error).toBeNull();
  const read = await admin.from("support_tickets").update({ admin_read_at: new Date().toISOString() }).eq("id", ticketId);
  expect(read.error).toBeNull();

  await expect(messages.getByRole("listitem")).toHaveCount(3, { timeout: 25_000 });
  await expect(messages.getByRole("listitem").last()).toContainText("Tim HomeKlin");
  await expect(messages.getByRole("listitem").last()).toContainText(reply);
  await expect(messages.getByRole("listitem").first()).toContainText("Terbaca");
});

test("the visitor's /support leads back to the chat, in both languages", async () => {
  const page = await guest.newPage();
  await page.goto("/support");
  await expect(page.getByRole("link", { name: "Lanjutkan chat Anda" })).toHaveAttribute("href", `/support?ticket=${ticketId}`);
  await page.goto(`/en/support?ticket=${ticketId}`);
  await expect(page.getByRole("region", { name: "Chat with the HomeKlin team" }).getByRole("list", { name: "Messages" })).toBeVisible();
});

test.describe("at 360 px", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("the help page and the guest chat have no sideways scroll and name no agency", async () => {
    const page = await guest.newPage();
    await page.setViewportSize({ width: 360, height: 740 });
    for (const path of ["/support", `/support?ticket=${ticketId}`, `/en/support?ticket=${ticketId}`]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      expect(await page.content()).not.toMatch(/agensi|agency|mitra|partner/i);
    }
  });
});
