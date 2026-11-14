import { expect, test, type Browser, type Page } from "@playwright/test";
import { attachRecording, recordingsBucket } from "../../src/lib/recordings/attach";
import { adminClient } from "../../tests/integration/test-project";
import { createJobWorld, jobArea, sessionOf, type JobWorld } from "../job-test-data";
import { makeTestVideo, serveTestVideo } from "../monitor-test-data";
import { standInClip } from "../recording-test-data";
import type { StorageState } from "../setup/auth-state";

// D2 review screenshots: the partner agency's back office after the partner mocks, at 1440 and 1280 px
// on a desk and 390 and 360 px on a phone, in both languages: Ringkasan, Pekerjaan masuk, an order under
// way and a finished one, Pesanan selesai, Petugas dan ketersediaan, Jadwal, Video petugas and Layanan.
// The run makes its own agency ("Cahaya Bersih", fictional) with four cleaners, open, assigned, live and
// finished jobs (recordings attached as check-out does; one deleted after 7 days), and this week's
// windows on the days already past (so no customer is ever offered them). The test project's demo clip
// is an 8-byte stand-in, so every signed link answers with a short calm video recorded in the browser.
// Saved to docs/screenshots/d2/ as <page>-<lang>-<width>.png (phones also -fold.png). Everything is
// deleted at the end. Run with: npm run screenshots -- d2

const dir = "docs/screenshots/d2";
type Device = "phone" | "desktop";
const heights: Record<number, number> = { 360: 780, 390: 844, 1280: 800, 1440: 900 };
const languages = [
  ["id", ""],
  ["en", "/en"],
] as const;

test.describe.configure({ mode: "serial", timeout: 600_000 });

let world: JobWorld;
let session: StorageState;
let video: Buffer;
const jobs: Record<string, string> = {};
const extraSlots: string[] = [];

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const admin = adminClient();
  world = await createJobWorld("d2s");
  const agency = await world.agency("Cahaya Bersih");
  const wulan = await world.cleaner(agency.id, "Wulan Anggraeni");
  const maya = await world.cleaner(agency.id, "Maya Lestari");
  const dedi = await world.cleaner(agency.id, "Dedi Pratama");
  await world.cleaner(agency.id, "Ayu Kartika");

  const at = (address: string) => `${address}, Cakung, Jakarta Timur`;
  jobs.open = (await world.job({ agencyId: agency.id, cleaner: null, startsIn: 180, address: at("Jl. Melati No. 12") })).id;
  jobs.tomorrow = (await world.job({ agencyId: agency.id, cleaner: null, startsIn: 1_500, minutes: 180, address: at("Jl. Kenanga No. 4") })).id;
  jobs.assigned = (await world.job({ agencyId: agency.id, cleaner: maya, startsIn: 1_620, address: at("Jl. Anggrek No. 7") })).id;
  jobs.live = (await world.job({ agencyId: agency.id, cleaner: wulan, startsIn: -40, address: at("Jl. Mawar No. 3"), checkedInMinutesAgo: 35 })).id;
  jobs.finished = (await world.job({ agencyId: agency.id, cleaner: wulan, startsIn: -300, minutes: 180, address: at("Jl. Dahlia No. 9"), completedMinutesAgo: 90 })).id;
  jobs.yesterday = (await world.job({ agencyId: agency.id, cleaner: dedi, startsIn: -1_700, address: at("Jl. Teratai No. 2"), completedMinutesAgo: 1_560 })).id;
  jobs.none = (await world.job({ agencyId: agency.id, cleaner: maya, startsIn: -3_100, address: at("Jl. Cempaka No. 5"), completedMinutesAgo: 2_980 })).id;
  jobs.expired = (await world.job({ agencyId: agency.id, cleaner: dedi, startsIn: -12_000, address: at("Jl. Kamboja No. 8"), completedMinutesAgo: 11_880 })).id;

  const stream = await admin.from("stream_sessions").insert({ order_id: jobs.live, cleaner_id: wulan.id, agency_id: agency.id, source: "demo", status: "active" });
  if (stream.error) throw new Error(`Could not start the stream: ${stream.error.message}`);

  const clip = await admin.storage.from(recordingsBucket).upload(standInClip.path, standInClip.bytes, { contentType: "video/mp4", upsert: true });
  if (clip.error) throw new Error(`Could not upload the stand-in clip: ${clip.error.message}`);
  await attachRecording(admin, jobs.finished);
  await attachRecording(admin, jobs.yesterday);
  const day = 86_400_000;
  const expired = await admin.from("recordings").insert({
    order_id: jobs.expired,
    agency_id: agency.id,
    file_path: `jobs/${jobs.expired}.mp4`,
    created_at: new Date(Date.now() - 9 * day).toISOString(),
    expires_at: new Date(Date.now() - 2 * day).toISOString(),
    deleted_at: new Date(Date.now() - 2 * day).toISOString(),
  });
  if (expired.error) throw new Error(`Could not add the deleted recording: ${expired.error.message}`);

  // This week's windows at the usual hours, on the days already past only: they fill the week overview
  // and, having started, are never offered to a customer.
  const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = dateKey.format(new Date());
  const [year, month, date] = today.split("-").map(Number);
  const monday = new Date(Date.UTC(year, month - 1, date - ((new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7)));
  const rows = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const dayKey = new Date(monday.getTime() + offset * day).toISOString().slice(0, 10);
    for (const [hour, capacity, booked] of [
      ["08:00", 2, 1],
      ["10:00", 3, 1],
      ["13:00", 3, 3],
      ["15:00", 2, 0],
    ] as const) {
      const startsAt = new Date(`${dayKey}T${hour}:00+07:00`);
      if (startsAt.getTime() > Date.now() - 3_600_000) continue;
      rows.push({
        agency_id: agency.id,
        area_id: jobArea,
        starts_at: startsAt.toISOString(),
        ends_at: new Date(startsAt.getTime() + 2 * 3_600_000).toISOString(),
        capacity,
        booked,
      });
    }
  }
  if (rows.length > 0) {
    const slots = await admin.from("availability_slots").insert(rows).select("id");
    if (slots.error) throw new Error(`Could not add the week's windows: ${slots.error.message}`);
    extraSlots.push(...(slots.data ?? []).map((row) => row.id as string));
  }

  session = await sessionOf(browser, baseURL, agency.user);
  video = await makeTestVideo(browser);
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  if (extraSlots.length > 0) await adminClient().from("availability_slots").delete().in("id", extraSlots);
  await world?.cleanup();
});

async function newPage(browser: Browser, device: Device, width: number) {
  const mobile = device === "phone";
  const context = await browser.newContext({
    viewport: { width, height: heights[width] },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    storageState: session,
  });
  const page = await context.newPage();
  await serveTestVideo(page, video);
  return { context, page };
}

async function settle(page: Page) {
  await expect(page.locator("main h1").first()).toBeVisible();
  await expect(page.getByText(/^(Memuat|Loading)/)).toHaveCount(0, { timeout: 20_000 });
  for (const element of await page.locator("main video").all()) {
    await expect.poll(() => element.evaluate((node: HTMLVideoElement) => node.readyState >= 2 || !!node.error), { timeout: 15_000 }).toBe(true);
  }
  // Every image in view has its picture (the service photos are lazy).
  for (const image of await page.locator("main img").all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0), { timeout: 15_000 }).toBe(true);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
}

async function shoot(page: Page, name: string, width: number, mobile: boolean) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  // On a failure, name the elements that reach past the edge, so the cause is in the message.
  const wide =
    scrollWidth > width
      ? await page.evaluate((edge) =>
          [...document.querySelectorAll("main *")]
            .filter((element) => element.getBoundingClientRect().right > edge + 1)
            .slice(0, 5)
            .map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
        width)
      : [];
  expect(scrollWidth, `${name} at ${width} px scrolls sideways: ${wide.join(" | ")}`).toBeLessThanOrEqual(width);
  if (mobile) await page.screenshot({ path: `${dir}/${name}-${width}-fold.png` });
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height: Math.max(pageHeight, heights[width]) });
  await page.screenshot({ path: `${dir}/${name}-${width}.png` });
  await page.setViewportSize({ width, height: heights[width] });
}

const pages = () => [
  ["summary", "/agency"],
  ["incoming", "/agency/orders"],
  ["job-live", `/agency/orders/job?order=${jobs.live}`],
  ["job-done", `/agency/past/job?order=${jobs.finished}`],
  ["past", "/agency/past"],
  ["cleaners", "/agency/cleaners"],
  ["schedule", "/agency/schedule"],
  ["videos", "/agency/recordings"],
  ["services", "/agency/services"],
];

for (const [device, widths] of [
  ["desktop", [1440, 1280]],
  ["phone", [390, 360]],
] as const) {
  test(`the partner back office on a ${device}`, async ({ browser }) => {
    for (const width of widths) {
      const { context, page } = await newPage(browser, device, width);
      for (const [lang, prefix] of languages) {
        for (const [name, path] of pages()) {
          await page.goto(`${prefix}${path}`);
          await settle(page);
          await shoot(page, `${name}-${lang}`, width, device === "phone");
        }
      }
      await context.close();
    }
  });
}
