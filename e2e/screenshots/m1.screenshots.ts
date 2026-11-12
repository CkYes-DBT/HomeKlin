import { expect, test, type Browser, type Page } from "@playwright/test";
import { sessionOf } from "../job-test-data";
import { createMonitorWorld, makeTestVideo, serveTestVideo, type MonitorWorld } from "../monitor-test-data";
import type { StorageState } from "../setup/auth-state";

// M1 review screenshots: "Pemantauan langsung" after the user's mock, at 1440 and 1280 px on a desk and
// 390 and 360 px on a phone, in both languages, with three live streams (in progress, weak signal,
// disconnected) and one job of today whose cleaner has not checked in. The test project's demo clip
// is an 8-byte stand-in, so each signed link is answered with a short calm video recorded in the
// browser (e2e/monitor-test-data.ts) and the frames show a picture, as on the demo day. Saved to
// docs/screenshots/m1/ as monitor-<lang>-<width>.png (phones also -fold.png, the first screen as it
// opens). Everything is made in the Supabase test project for this run and deleted at the end; other
// runs share the project, so their cards may show too.
// Run with: npm run screenshots -- m1

const dir = "docs/screenshots/m1";
type Device = "phone" | "desktop";
const heights: Record<number, number> = { 360: 780, 390: 844, 1280: 800, 1440: 900 };
const languages = [
  ["id", ""],
  ["en", "/en"],
] as const;

test.describe.configure({ mode: "serial", timeout: 240_000 });

let data: MonitorWorld;
let session: StorageState;
let video: Buffer;

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  data = await createMonitorWorld("m1s");
  session = await sessionOf(browser, baseURL, data.admin);
  video = await makeTestVideo(browser);
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await data?.cleanup();
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
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(`[data-waiting="${data.waiting.id}"]`)).toBeVisible();
  await expect(page.getByText(/^(Memuat|Loading)/)).toHaveCount(0);
  // This run's videos play: each has a picture before the shot.
  for (const id of [data.live.active.id, data.live.weak.id]) {
    await expect
      .poll(() => page.locator(`[data-feed="${id}"] video`).evaluate((element: HTMLVideoElement) => element.readyState >= 2))
      .toBe(true);
  }
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
}

async function shoot(page: Page, name: string, width: number, mobile: boolean) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, `${name} at ${width} px scrolls sideways`).toBeLessThanOrEqual(width);
  if (mobile) await page.screenshot({ path: `${dir}/${name}-${width}-fold.png` });
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height: Math.max(pageHeight, heights[width]) });
  await page.screenshot({ path: `${dir}/${name}-${width}.png` });
  await page.setViewportSize({ width, height: heights[width] });
}

for (const [device, widths] of [
  ["desktop", [1440, 1280]],
  ["phone", [390, 360]],
] as const) {
  test(`the live monitor on a ${device}`, async ({ browser }) => {
    for (const width of widths) {
      const { context, page } = await newPage(browser, device, width);
      for (const [lang, prefix] of languages) {
        await page.goto(`${prefix}/admin/monitor`);
        await settle(page);
        await shoot(page, `monitor-${lang}`, width, device === "phone");
      }
      await context.close();
    }
  });
}
