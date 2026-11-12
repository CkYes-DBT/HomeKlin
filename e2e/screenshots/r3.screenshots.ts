import { expect, test, type Browser, type Page } from "@playwright/test";
import { createJobWorld, sessionOf, type JobWorld } from "../job-test-data";
import type { StorageState } from "../setup/auth-state";

// R3 review screenshots: the redesigned "Layanan dan harga" list (one white card of rows, each opening
// its panel) at 1440 and 1280 px on a desk and 390 and 360 px on a phone, in both languages, with the
// first service's row open. Saved to docs/screenshots/r3/ as services-<lang>-<width>.png (phones also
// -fold.png, the first screen as it opens). The admin is made in the Supabase test project for this
// run and deleted at the end.
// Run with: npm run screenshots -- r3

const dir = "docs/screenshots/r3";
type Device = "phone" | "desktop";
const heights: Record<number, number> = { 360: 780, 390: 844, 1280: 800, 1440: 900 };
const languages = [
  ["id", "", "Pembersihan Rutin"],
  ["en", "/en", "Regular Cleaning"],
] as const;

test.describe.configure({ mode: "serial", timeout: 240_000 });

let world: JobWorld;
let session: StorageState;

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  world = await createJobWorld("r3s");
  session = await sessionOf(browser, baseURL, await world.admin("Uji Admin"));
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await world?.cleanup();
});

async function newPage(browser: Browser, device: Device, width: number) {
  const mobile = device === "phone";
  const context = await browser.newContext({
    viewport: { width, height: heights[width] },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: "reduce",
    storageState: session,
  });
  return { context, page: await context.newPage() };
}

async function openRow(page: Page, name: string) {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/^(Memuat|Loading)/)).toHaveCount(0);
  const details = page.locator("details").filter({ hasText: name });
  await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
  // Move the pointer away so no row shows its hover fill.
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
  test(`the services list on a ${device}`, async ({ browser }) => {
    for (const width of widths) {
      const { context, page } = await newPage(browser, device, width);
      for (const [lang, prefix, name] of languages) {
        await page.goto(`${prefix}/admin/services`);
        await openRow(page, name);
        await shoot(page, `services-${lang}`, width, device === "phone");
      }
      await context.close();
    }
  });
}
