import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminClient } from "../../tests/integration/test-project";
import { createJobWorld, sessionOf, type JobWorld } from "../job-test-data";
import { createMonitorWorld, makeTestVideo, serveTestVideo, type MonitorWorld } from "../monitor-test-data";
import type { StorageState } from "../setup/auth-state";

// Review screenshots of the Phase 15 wiring (the lead's step 2): the admin order page with the address,
// the customer's note and phone, the booked price split and the payment method, and the status times
// (Admin-Order, Admin-Order-Issue); the admin service panel's photo field (Admin-ServiceNew); the
// support inbox with a guest's chat and admin's read ticks (Admin-Support); and the partner pages with
// order numbers, fees ("perkiraan") and the customer's note (Partner-Jobs, Partner-Job,
// Partner-Job-Done, Partner-Past), the services choice in its edit mode (Partner-Services) and a
// cleaner's phone and area with the edit form open (Partner-Cleaners). 1440 and 360 px, both languages.
// Saved to docs/screenshots/wire/ as <screen>-<lang>-<width>.png (phones also -fold.png). Everything
// made for the run is deleted at the end; no save is sent from a page.
// Run from a worktree with:
// npx playwright test --config playwright.screenshots.config.ts "screenshots[\\/]wire\.screenshots"

const dir = "docs/screenshots/wire";
const heights: Record<number, number> = { 360: 780, 1440: 900 };
const widths = [1440, 360] as const;
const languages = [
  ["id", ""],
  ["en", "/en"],
] as const;

test.describe.configure({ mode: "serial", timeout: 600_000 });

let monitor: MonitorWorld;
let partner: JobWorld;
let adminSession: StorageState;
let agencySession: StorageState;
let video: Buffer;
let guestTicket = "";
const jobs: Record<string, string> = {};

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const admin = adminClient();

  // Admin: the monitor world, with a note, an assignment time and a payment method on the live order,
  // and a help chat about it whose admin reply the customer has read.
  monitor = await createMonitorWorld("wire");
  await admin.from("profiles").update({ full_name: "Uji Pelanggan Nadia" }).eq("id", monitor.world.customer.id);
  const assigned = await admin
    .from("orders")
    .update({ customer_note: "Mohon lepas sepatu di pintu masuk. Kunci cadangan ada di pos satpam.", assigned_at: new Date(Date.now() - 90 * 60_000).toISOString(), payment_type: "gopay" })
    .eq("id", monitor.live.active.id);
  if (assigned.error) throw new Error(`Could not set up the order: ${assigned.error.message}`);
  const { data: ticket, error } = await admin
    .from("support_tickets")
    .insert({ customer_id: monitor.world.customer.id, order_id: monitor.live.active.id, question: "Petugas belum terlihat di rumah saya. Apakah sudah tiba?", status: "answered" })
    .select("id")
    .single<{ id: string }>();
  if (error || !ticket) throw new Error(`Could not set up the help chat: ${error?.message}`);
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  for (const [fromAdmin, body, ago] of [
    [false, "Petugas belum terlihat di rumah saya. Apakah sudah tiba?", 12],
    [true, "Selamat pagi. Petugas sudah check-in di alamat Anda dan siaran langsung aktif.", 10],
    [false, "Terima kasih, sudah terlihat di siaran.", 8],
    [true, "Sama-sama. Kabari kami bila ada yang perlu dibantu.", 2],
  ] as const) {
    const message = await admin.from("ticket_messages").insert({ ticket_id: ticket.id, from_admin: fromAdmin, body, created_at: minutesAgo(ago) });
    if (message.error) throw new Error(`Could not set up a message: ${message.error.message}`);
  }
  // The customer read the chat after the first reply, not yet after the last one.
  await admin.from("support_tickets").update({ customer_read_at: minutesAgo(5) }).eq("id", ticket.id);
  const opened = await admin.rpc("guest_open_ticket", {
    p_name: "Uji Tamu Rina",
    p_email: "uji-tamu@example.com",
    p_question: "Apakah saya perlu membuat akun untuk memesan pembersihan?",
    p_token_hash: createHash("sha256").update(randomBytes(32)).digest("hex"),
    p_ip_hash: createHash("sha256").update(`wire-${randomUUID()}`).digest("hex"),
  });
  if (opened.error) throw new Error(`Could not open the guest chat: ${opened.error.message}`);
  guestTicket = opened.data as string;

  // Partner: its own agency with three cleaners and open, live and finished jobs.
  partner = await createJobWorld("wirep");
  const agency = await partner.agency("Cahaya Bersih");
  const wulan = await partner.cleaner(agency.id, "Wulan Anggraeni");
  const maya = await partner.cleaner(agency.id, "Maya Lestari");
  await partner.cleaner(agency.id, "Dedi Pratama");
  await admin.from("cleaners").update({ phone: "+6281355550142", area_id: "jakarta-timur" }).eq("user_id", wulan.id);
  const at = (address: string) => `${address}, Cakung, Jakarta Timur`;
  jobs.open = (await partner.job({ agencyId: agency.id, cleaner: null, startsIn: 180, address: at("Jl. Melati No. 12") })).id;
  jobs.assigned = (await partner.job({ agencyId: agency.id, cleaner: maya, startsIn: 1_620, address: at("Jl. Anggrek No. 7") })).id;
  jobs.live = (await partner.job({ agencyId: agency.id, cleaner: wulan, startsIn: -40, address: at("Jl. Mawar No. 3"), checkedInMinutesAgo: 35 })).id;
  jobs.finished = (await partner.job({ agencyId: agency.id, cleaner: wulan, startsIn: -300, minutes: 180, address: at("Jl. Dahlia No. 9"), completedMinutesAgo: 90 })).id;
  await admin.from("orders").update({ customer_note: "Mohon lepas sepatu di pintu masuk.", assigned_at: new Date(Date.now() - 120 * 60_000).toISOString() }).eq("id", jobs.live);
  await admin.from("orders").update({ assigned_at: new Date(Date.now() - 400 * 60_000).toISOString() }).eq("id", jobs.finished);
  // The finished job's real fee, as check-out writes it.
  const fee = await admin.from("order_fees").insert({ order_id: jobs.finished, agency_id: agency.id, price_idr: 150_000, percent: 70, fee_idr: 105_000 });
  if (fee.error) throw new Error(`Could not add the fee: ${fee.error.message}`);
  const stream = await admin.from("stream_sessions").insert({ order_id: jobs.live, cleaner_id: wulan.id, agency_id: agency.id, source: "demo", status: "active" });
  if (stream.error) throw new Error(`Could not start the stream: ${stream.error.message}`);

  adminSession = await sessionOf(browser, baseURL, monitor.admin);
  agencySession = await sessionOf(browser, baseURL, agency.user);
  video = await makeTestVideo(browser);
});

test.afterAll(async () => {
  test.setTimeout(180_000);
  if (guestTicket) await adminClient().from("support_tickets").delete().eq("id", guestTicket);
  await monitor?.cleanup();
  await partner?.cleanup();
});

async function newPage(browser: Browser, width: number, session: StorageState) {
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

async function settle(page: Page) {
  await expect(page.locator("main h1").first()).toBeVisible();
  await expect(page.getByText(/^(Memuat|Loading)/)).toHaveCount(0, { timeout: 20_000 });
  for (const image of await page.locator("main img").all()) {
    // An image inside a closed panel is never loaded, and is not in the picture either.
    if (!(await image.isVisible())) continue;
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete), { timeout: 15_000 }).toBe(true);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
}

async function shoot(page: Page, name: string, width: number) {
  const mobile = width < 768;
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  // On a failure, name the elements that reach past the edge, so the cause is in the message.
  const wide =
    scrollWidth > width
      ? await page.evaluate(
          (edge) =>
            [...document.querySelectorAll("main *")]
              .filter((element) => element.getBoundingClientRect().right > edge + 1)
              .slice(0, 6)
              .map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
          width,
        )
      : [];
  expect(scrollWidth, `${name} at ${width} px scrolls sideways: ${wide.join(" | ")}`).toBeLessThanOrEqual(width);
  if (mobile) await page.screenshot({ path: `${dir}/${name}-${width}-fold.png` });
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height: Math.max(pageHeight, heights[width]) });
  await page.screenshot({ path: `${dir}/${name}-${width}.png` });
  await page.setViewportSize({ width, height: heights[width] });
}

test("admin: order, service photo and support chats", async ({ browser }) => {
  for (const width of widths) {
    const { context, page } = await newPage(browser, width, adminSession);
    for (const [lang, prefix] of languages) {
      await page.goto(`${prefix}/admin/orders/${monitor.live.active.code}`);
      await settle(page);
      await shoot(page, `admin-order-${lang}`, width);
      await page.goto(`${prefix}/admin/orders/${monitor.live.disconnected.code}`);
      await settle(page);
      await shoot(page, `admin-order-issue-${lang}`, width);

      await page.goto(`${prefix}/admin/services`);
      await settle(page);
      const row = page.locator("main li").filter({ hasText: lang === "en" ? "Regular Cleaning" : "Pembersihan Rutin" }).first();
      await row.locator("summary").click();
      await row.getByTestId("panel-photo").scrollIntoViewIfNeeded();
      await shoot(page, `admin-service-photo-${lang}`, width);

      await page.goto(`${prefix}/admin/tickets?ticket=${guestTicket}`);
      await settle(page);
      await shoot(page, `admin-support-guest-${lang}`, width);
      const tickets = await adminClient().from("support_tickets").select("id").eq("order_id", monitor.live.active.id);
      await page.goto(`${prefix}/admin/tickets?ticket=${tickets.data?.[0]?.id}`);
      await settle(page);
      await shoot(page, `admin-support-read-${lang}`, width);
    }
    await context.close();
  }
});

test("partner: jobs, order pages, completed orders, services and cleaners", async ({ browser }) => {
  for (const width of widths) {
    const { context, page } = await newPage(browser, width, agencySession);
    for (const [lang, prefix] of languages) {
      for (const [name, path] of [
        ["partner-jobs", "/agency/orders"],
        ["partner-job", `/agency/orders/job?order=${jobs.live}`],
        ["partner-job-done", `/agency/past/job?order=${jobs.finished}`],
        ["partner-past", "/agency/past"],
        ["partner-services", "/agency/services"],
      ] as const) {
        await page.goto(`${prefix}${path}`);
        await settle(page);
        await shoot(page, `${name}-${lang}`, width);
      }
      await page.getByRole("button", { name: lang === "en" ? "Change choice" : "Ubah pilihan" }).click();
      await page.getByRole("checkbox").first().uncheck();
      await shoot(page, `partner-services-edit-${lang}`, width);

      await page.goto(`${prefix}/agency/cleaners`);
      await settle(page);
      await page.getByRole("button", { name: lang === "en" ? "Edit the phone and area of Maya Lestari" : "Ubah nomor HP dan area Maya Lestari" }).click();
      await shoot(page, `partner-cleaners-edit-${lang}`, width);
    }
    await context.close();
  }
});
