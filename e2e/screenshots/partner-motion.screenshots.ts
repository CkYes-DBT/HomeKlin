import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminClient } from "../../tests/integration/test-project";
import { createJobWorld, sessionOf, type JobWorld } from "../job-test-data";
import type { StorageState } from "../setup/auth-state";

// Partner motion review screenshots: the partner screens whose markup the motion pass touched, in their
// opened states, at 1440 and 1280 px on a desk and 390 and 360 px on a phone: a cleaner's edit row
// open with a refusal under it, the services' edit mode, a job under way (the live badge) and the
// incoming jobs. Motion cannot be judged from a still, so the pages are taken under reduced motion,
// where every entrance has settled at once. Saved to docs/screenshots/partner-motion/ as
// <page>-<width>.png. The run makes its own fictional agency and deletes it at the end.
// Run with: npm run screenshots -- partner-motion

const dir = "docs/screenshots/partner-motion";
type Device = "phone" | "desktop";
const heights: Record<number, number> = { 360: 780, 390: 844, 1280: 800, 1440: 900 };

test.describe.configure({ mode: "serial", timeout: 600_000 });

let world: JobWorld;
let session: StorageState;
const jobs: Record<string, string> = {};

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  world = await createJobWorld("pms");
  const agency = await world.agency("Cahaya Bersih");
  const wulan = await world.cleaner(agency.id, "Wulan Anggraeni");
  await world.cleaner(agency.id, "Maya Lestari");
  const at = (address: string) => `${address}, Cakung, Jakarta Timur`;
  await world.job({ agencyId: agency.id, cleaner: null, startsIn: 180, address: at("Jl. Melati No. 12") });
  jobs.live = (await world.job({ agencyId: agency.id, cleaner: wulan, startsIn: -40, address: at("Jl. Mawar No. 3"), checkedInMinutesAgo: 35 })).id;
  const stream = await adminClient().from("stream_sessions").insert({ order_id: jobs.live, cleaner_id: wulan.id, agency_id: agency.id, source: "demo", status: "active" });
  if (stream.error) throw new Error(`Could not start the stream: ${stream.error.message}`);
  session = await sessionOf(browser, baseURL, agency.user);
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

async function settle(page: Page) {
  await expect(page.locator("main h1").first()).toBeVisible();
  await expect(page.getByText(/^(Memuat|Loading)/)).toHaveCount(0, { timeout: 20_000 });
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
}

async function shoot(page: Page, name: string, width: number) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, `${name} at ${width} px scrolls sideways`).toBeLessThanOrEqual(width);
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height: Math.max(pageHeight, heights[width]) });
  await page.screenshot({ path: `${dir}/${name}-${width}.png` });
  await page.setViewportSize({ width, height: heights[width] });
}

for (const [device, widths] of [
  ["desktop", [1440, 1280]],
  ["phone", [390, 360]],
] as const) {
  test(`the partner screens' opened states on a ${device}`, async ({ browser }) => {
    for (const width of widths) {
      const { context, page } = await newPage(browser, device, width);

      await page.goto("/agency/cleaners");
      await settle(page);
      await page.getByRole("button", { name: "Ubah nomor HP dan area Wulan Anggraeni" }).click();
      const form = page.getByRole("form", { name: "Nomor HP dan area Wulan Anggraeni" });
      await form.getByLabel("Nomor HP").fill("12345");
      await form.getByRole("button", { name: "Simpan" }).click();
      await expect(form.getByRole("alert")).not.toBeEmpty({ timeout: 20_000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await shoot(page, "cleaners-edit", width);

      await page.goto("/agency/services");
      await settle(page);
      await page.getByRole("button", { name: "Ubah pilihan" }).click();
      await expect(page.getByText("Mode ubah aktif")).toBeVisible();
      await shoot(page, "services-edit", width);

      await page.goto(`/agency/orders/job?order=${jobs.live}`);
      await settle(page);
      await shoot(page, "job-live", width);

      await page.goto("/agency/orders");
      await settle(page);
      await shoot(page, "incoming", width);

      await context.close();
    }
  });
}
