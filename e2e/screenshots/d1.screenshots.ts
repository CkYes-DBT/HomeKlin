import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminClient } from "../../tests/integration/test-project";
import { sessionOf } from "../job-test-data";
import { createMonitorWorld, makeTestVideo, serveTestVideo, type MonitorWorld } from "../monitor-test-data";
import type { StorageState } from "../setup/auth-state";

// D1 review screenshots (Phase 14, the admin group after the user's mocks): the live monitor with its
// filters (Admin-Live), the order detail page in progress and disconnected (Admin-Order,
// Admin-Order-Issue), the support chats with a chat open (Admin-Support), the FAQ list with an entry
// open and the create panel (Admin-Faq), the service panel (Admin-ServiceNew) and the recordings page.
// New pages (the order detail, the FAQ editor) at 1440, 1280, 390 and 360 px; restyled ones at 1440
// and 360. Indonesian at every width, English at 1440 and 360. Saved to docs/screenshots/d1/ as
// <screen>-<lang>-<width>.png (phones also -fold.png, the first screen). The monitor world (its agency,
// cleaners, jobs and streams) and one help chat about its live order are made in the Supabase test
// project for this run and deleted at the end; nothing else is changed (no save is sent).
// Run with: npm run screenshots -- d1

const dir = "docs/screenshots/d1";
const heights: Record<number, number> = { 360: 780, 390: 844, 1280: 800, 1440: 900 };
const allWidths = [1440, 1280, 390, 360] as const;
const someWidths = [1440, 360] as const;

test.describe.configure({ mode: "serial", timeout: 600_000 });

let data: MonitorWorld;
let session: StorageState;
let video: Buffer;
let ticketId: string;

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  data = await createMonitorWorld("d1s");
  session = await sessionOf(browser, baseURL, data.admin);
  video = await makeTestVideo(browser);
  const admin = adminClient();
  await admin.from("profiles").update({ full_name: "Uji Pelanggan Nadia" }).eq("id", data.world.customer.id);
  const { data: ticket, error } = await admin
    .from("support_tickets")
    .insert({
      customer_id: data.world.customer.id,
      order_id: data.live.active.id,
      question: "Selamat pagi, petugas belum terlihat di rumah saya. Apakah sudah tiba?",
      urgency: "urgent",
      status: "answered",
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !ticket) throw new Error(`Could not set up the help chat: ${error?.message}`);
  ticketId = ticket.id;
  const messages = [
    { from_admin: false, body: "Selamat pagi, petugas belum terlihat di rumah saya. Apakah sudah tiba?" },
    { from_admin: true, body: "Selamat pagi. Kami sudah memeriksa: petugas sudah check-in di alamat Anda. Anda dapat menonton langsung dari menu Pesanan." },
    { from_admin: false, body: "Oh, ternyata sudah masuk lewat pintu samping. Terima kasih, sudah terlihat di siaran." },
  ];
  for (const message of messages) {
    const { error: messageError } = await admin.from("ticket_messages").insert({ ticket_id: ticketId, ...message });
    if (messageError) throw new Error(`Could not set up a message: ${messageError.message}`);
  }
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await data?.cleanup();
});

async function newPage(browser: Browser, width: number) {
  const mobile = width < 768;
  const context = await browser.newContext({
    viewport: { width, height: heights[width] },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: "reduce",
    storageState: session,
  });
  const page = await context.newPage();
  await serveTestVideo(page, video);
  return { context, page };
}

async function ready(page: Page) {
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByText(/^(Memuat|Loading)/)).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

async function playing(page: Page, selector: string) {
  await expect.poll(() => page.locator(selector).first().evaluate((element: HTMLVideoElement) => element.readyState >= 2)).toBe(true);
}

async function shoot(page: Page, name: string, width: number) {
  const mobile = width < 768;
  await page.mouse.move(0, 0);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, `${name} at ${width} px scrolls sideways`).toBeLessThanOrEqual(width);
  if (mobile) await page.screenshot({ path: `${dir}/${name}-${width}-fold.png` });
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height: Math.max(pageHeight, heights[width]) });
  await page.screenshot({ path: `${dir}/${name}-${width}.png` });
  await page.setViewportSize({ width, height: heights[width] });
}

/** Indonesian at every width; English at the widest and narrowest. */
const languagesAt = (width: number) => (width === 1440 || width === 360 ? (["id", "en"] as const) : (["id"] as const));
const prefixOf = (lang: "id" | "en") => (lang === "en" ? "/en" : "");

test("the live monitor with its filters", async ({ browser }) => {
  for (const width of someWidths) {
    const { context, page } = await newPage(browser, width);
    for (const lang of languagesAt(width)) {
      await page.goto(`${prefixOf(lang)}/admin/monitor`);
      await ready(page);
      await playing(page, `[data-feed="${data.live.active.id}"] video`);
      await shoot(page, `monitor-${lang}`, width);
      await page.goto(`${prefixOf(lang)}/admin/monitor?view=troubled&area=jakarta-timur`);
      await ready(page);
      await shoot(page, `monitor-troubled-${lang}`, width);
    }
    await page.goto("/admin/monitor?view=troubled&area=jakarta-selatan");
    await ready(page);
    await shoot(page, "monitor-empty-id", width);
    await context.close();
  }
});

test("the order detail page, in progress and disconnected", async ({ browser }) => {
  for (const width of allWidths) {
    const { context, page } = await newPage(browser, width);
    for (const lang of languagesAt(width)) {
      await page.goto(`${prefixOf(lang)}/admin/orders/${data.live.active.code}`);
      await ready(page);
      await playing(page, "main video");
      await shoot(page, `order-${lang}`, width);
      await page.goto(`${prefixOf(lang)}/admin/orders/${data.live.disconnected.code}`);
      await ready(page);
      await shoot(page, `order-issue-${lang}`, width);
    }
    await page.goto(`/admin/orders/${data.waiting.code}`);
    await ready(page);
    await shoot(page, "order-waiting-id", width);
    await context.close();
  }
});

test("the support chats with a chat open", async ({ browser }) => {
  for (const width of someWidths) {
    const { context, page } = await newPage(browser, width);
    for (const lang of languagesAt(width)) {
      await page.goto(`${prefixOf(lang)}/admin/tickets?ticket=${ticketId}`);
      await ready(page);
      await expect(page.getByRole("region", { name: lang === "en" ? /Chat with the customer/ : /Percakapan dengan pelanggan/ })).toBeVisible();
      await shoot(page, `tickets-${lang}`, width);
    }
    if (width === 360) {
      await page.goto("/admin/tickets");
      await ready(page);
      await shoot(page, "tickets-list-id", width);
    }
    await context.close();
  }
});

test("the FAQ list, an entry open and the create panel", async ({ browser }) => {
  for (const width of allWidths) {
    const { context, page } = await newPage(browser, width);
    for (const lang of languagesAt(width)) {
      await page.goto(`${prefixOf(lang)}/admin/faq`);
      await ready(page);
      const first = page.locator("[data-faq] details").first();
      await first.locator("summary").click();
      await expect(first).toHaveAttribute("open", "");
      await shoot(page, `faq-${lang}`, width);
      await page.goto(`${prefixOf(lang)}/admin/faq?new`);
      await ready(page);
      await expect(page.getByTestId("faq-create-panel")).toBeVisible();
      await shoot(page, `faq-new-${lang}`, width);
    }
    await context.close();
  }
});

test("the service panel and the recordings page", async ({ browser }) => {
  for (const width of someWidths) {
    const { context, page } = await newPage(browser, width);
    for (const lang of languagesAt(width)) {
      await page.goto(`${prefixOf(lang)}/admin/services?new`);
      await ready(page);
      await expect(page.getByTestId("panel-photo").first()).toBeVisible();
      await shoot(page, `service-new-${lang}`, width);
      await page.goto(`${prefixOf(lang)}/admin/services`);
      await ready(page);
      const row = page.locator("li details").first();
      await row.locator("summary").click();
      await shoot(page, `service-edit-${lang}`, width);
      await page.goto(`${prefixOf(lang)}/admin/recordings`);
      await ready(page);
      await shoot(page, `recordings-${lang}`, width);
    }
    await context.close();
  }
});
