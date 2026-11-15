import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { cleanerAssignedEmail, recordingReadyEmail } from "../../src/lib/email/order-templates";
import { adminClient } from "../../tests/integration/test-project";
import { createJobWorld, seededAgencyId, sessionOf, type JobWorld } from "../job-test-data";
import { createReplayWorld, type ReplayWorld } from "../recording-test-data";
import type { StorageState } from "../setup/auth-state";

// D5 pass 5b review screenshots, after the mocks Customer-Live and Phone-Live (a job in progress,
// before the stream starts), Customer-Replay and Phone-Replay (the recordings page), Customer-Support
// and Phone-Support (help for a visitor), Customer-Chat and Phone-Chat (a guest's chat with a reply,
// read), the order-link page (B14a, and a link that does not work), the account page, the landing page
// (Landing, Phone-Landing) and the two emails (Customer-Email-Order, Customer-Email-Replay, rendered
// from the real templates). Two phone widths and two desktop widths, both languages. Saved to
// docs/screenshots/d5b/ as <surface>-<lang>-<width>.png (whole page) and, on phones,
// <surface>-<lang>-<width>-fold.png. Fictional data in the Supabase test project, deleted at the end.
// Run with:
//   npx playwright test --config playwright.screenshots.config.ts "screenshots[\\/]d5b\.screenshots"

const dir = "docs/screenshots/d5b";
type Device = "phone" | "desktop";
const widths: Record<Device, number[]> = { phone: [360, 390], desktop: [1280, 1440] };
const heights: Record<number, number> = { 360: 780, 390: 844, 1280: 800, 1440: 900 };
const languages = [
  ["id", ""],
  ["en", "/en"],
] as const;
const guest: StorageState = { cookies: [], origins: [] };
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

test.describe.configure({ mode: "serial" });

let world: JobWorld;
let replay: ReplayWorld;
let customer: StorageState;
let replayCustomer: StorageState;
let guestChat: StorageState;
let liveId = "";
let ticketId = "";
const linkToken = randomBytes(32).toString("base64url");

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const admin = adminClient();
  world = await createJobWorld("d5b");
  await admin.from("profiles").update({ full_name: "Nadia Contoh Putri" }).eq("id", world.customer.id);
  const seeded = await seededAgencyId();
  const cleaner = await world.cleaner(seeded, "Wulan Contoh Anggraeni");
  const live = await world.job({ agencyId: seeded, cleaner, startsIn: -10, address: "Jl. Kemang Contoh No. 12, Cakung, Jakarta Timur", checkedInMinutesAgo: 6 });
  liveId = live.id;
  const upcoming = await world.job({ agencyId: seeded, cleaner, startsIn: 26 * 60, address: "Jl. Kenanga Contoh No. 7, Jatinegara, Jakarta Timur" });
  await admin.from("orders").update({ payment_type: "qris", assigned_at: new Date(Date.now() - 3_600_000).toISOString() }).in("id", [live.id, upcoming.id]);
  const stored = await admin.from("order_links").insert({ order_id: upcoming.id, token_hash: sha256(linkToken) });
  if (stored.error) throw new Error(`Could not store the link: ${stored.error.message}`);
  customer = await sessionOf(browser, baseURL, world.customer);

  replay = await createReplayWorld("d5b");
  replayCustomer = await sessionOf(browser, baseURL, replay.customer);

  // A guest's chat (B13), opened the way openGuestTicket does, with admin's reply, read.
  const token = randomBytes(32).toString("base64url");
  const opened = await admin.rpc("guest_open_ticket", {
    p_name: "Nadia",
    p_email: "",
    p_question: "Selamat pagi, email untuk pesanan saya belum masuk ke kotak masuk saya.",
    p_token_hash: sha256(token),
    p_ip_hash: sha256(`d5b-screens-${randomUUID()}`),
  });
  if (opened.error) throw new Error(`Could not open the guest chat: ${opened.error.message}`);
  ticketId = String(opened.data);
  await admin.from("ticket_messages").insert([
    { ticket_id: ticketId, from_admin: true, body: "Selamat pagi, Ibu Nadia. Kami kirim ulang emailnya. Mohon periksa kotak masuk dan folder spam." },
  ]);
  await admin.from("support_tickets").update({ admin_read_at: new Date().toISOString(), status: "answered" }).eq("id", ticketId);
  const host = new URL(baseURL ?? "http://localhost:3000").hostname;
  guestChat = {
    cookies: [{ name: "hk_guest_ticket", value: `${ticketId}.${token}`, domain: host, path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }],
    origins: [],
  };
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  if (ticketId) await adminClient().from("support_tickets").delete().eq("id", ticketId);
  await world?.cleanup();
  await replay?.cleanup();
});

async function newContext(browser: Browser, device: Device, storageState: StorageState): Promise<BrowserContext> {
  const width = widths[device][0];
  const mobile = device === "phone";
  return browser.newContext({
    viewport: { width, height: heights[width] },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: "reduce",
    storageState,
  });
}

async function settle(page: Page) {
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByText(/^(Memuat|Loading)/)).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

async function shoot(page: Page, name: string, width: number, mobile: boolean, check = true) {
  await page.setViewportSize({ width, height: heights[width] });
  if (check) await settle(page);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, `${name} at ${width} px scrolls sideways`).toBeLessThanOrEqual(width);
  if (mobile) await page.screenshot({ path: `${dir}/${name}-${width}-fold.png` });
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height: Math.max(pageHeight, heights[width]) });
  await page.screenshot({ path: `${dir}/${name}-${width}.png` });
  await page.setViewportSize({ width, height: heights[width] });
}

async function shootAll(browser: Browser, name: string, path: string, storageState: StorageState) {
  for (const device of ["phone", "desktop"] as const) {
    const context = await newContext(browser, device, storageState);
    const page = await context.newPage();
    for (const [lang, prefix] of languages) {
      await page.goto(`${prefix}${path}`);
      for (const width of widths[device]) await shoot(page, `${name}-${lang}`, width, device === "phone");
    }
    await context.close();
  }
}

test("live, recordings, help and chat", async ({ browser }) => {
  test.setTimeout(420_000);
  await shootAll(browser, "live", `/orders/live?order=${liveId}`, customer);
  await shootAll(browser, "replay", `/orders/recording?order=${replay.orders.available}`, replayCustomer);
  await shootAll(browser, "support-guest", "/support", guest);
  await shootAll(browser, "support-customer", "/support", customer);
  await shootAll(browser, "chat-guest", `/support?ticket=${ticketId}`, guestChat);
});

test("the order link, the account, the landing page and the emails", async ({ browser }) => {
  test.setTimeout(420_000);
  await shootAll(browser, "order-link", `/o/${linkToken}`, guest);
  await shootAll(browser, "order-link-invalid", "/o/tautan-tidak-berlaku", guest);
  await shootAll(browser, "account", "/account", customer);
  await shootAll(browser, "landing", "/", guest);

  const site = "https://home-klin.vercel.app";
  for (const [lang] of languages) {
    const emails = {
      "email-order": cleanerAssignedEmail(
        {
          orderCode: "HK-1042",
          serviceName: lang === "id" ? "Pembersihan Rutin" : "Regular Cleaning",
          startsAt: "2026-11-05T02:00:00Z",
          endsAt: "2026-11-05T04:00:00Z",
          cleanerName: "Wulan Anggraeni",
          cleanerPhotoUrl: null,
          orderUrl: `${site}${lang === "en" ? "/en" : ""}/o/${"x".repeat(43)}`,
        },
        lang,
      ),
      "email-replay": recordingReadyEmail(
        { orderCode: "HK-1042", serviceName: lang === "id" ? "Pembersihan Rutin" : "Regular Cleaning", expiresAt: "2026-11-12T04:02:00Z", orderUrl: `${site}/o/${"y".repeat(43)}` },
        lang,
      ),
    };
    for (const [name, email] of Object.entries(emails)) {
      for (const device of ["phone", "desktop"] as const) {
        const context = await newContext(browser, device, guest);
        const page = await context.newPage();
        await page.setContent(email.html);
        for (const width of widths[device]) await shoot(page, `${name}-${lang}`, width, device === "phone", false);
        await context.close();
      }
    }
  }
});
