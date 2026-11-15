import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { adminClient } from "../../tests/integration/test-project";
import { createJobWorld, jobArea, seededAgencyId, sessionOf, type JobWorld } from "../job-test-data";
import type { StorageState } from "../setup/auth-state";

// D4 review screenshots, the cleaner group after the mocks Cleaner-Home, Cleaner-Jobs, Cleaner-Job
// (before check-in), Cleaner-Live (checked in, the stream on) and Cleaner-Account: the home with its
// summary, the job list, a job ready to check in, a job in progress with its stream, a finished job, the
// account page, the empty list, and the check-out confirm step. Two phone widths and one desktop width
// (it stays a phone layout there), both languages. Saved to docs/screenshots/d4/:
//   <surface>-<lang>-<width>.png       the whole page, with fixed bars where they really sit
//   <surface>-<lang>-<width>-fold.png  phones only: the first screen exactly as it opens
// Fictional users and paid jobs are made for the run in the Supabase test project and deleted at the end
// (e2e/job-test-data.ts). Run with:
//   npx playwright test --config playwright.screenshots.config.ts "screenshots[\\/]d4\.screenshots"

const dir = "docs/screenshots/d4";
type Device = "phone" | "desktop";
const widths: Record<Device, number[]> = { phone: [360, 390], desktop: [1280] };
const heights: Record<number, number> = { 360: 780, 390: 844, 1280: 800 };
const languages = [
  ["id", ""],
  ["en", "/en"],
] as const;

test.describe.configure({ mode: "serial" });

let world: JobWorld;
const sessions: Record<"cleaner" | "idle", StorageState> = {} as never;
const codes: Record<"open" | "started" | "finished", string> = {} as never;

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  world = await createJobWorld("d4s");
  const seeded = await seededAgencyId();
  const cleaner = await world.cleaner(seeded, "Wulan Contoh Anggraeni");
  const idle = await world.cleaner(seeded, "Uji Petugas Kosong");
  // The phone and area the agency sets (B11).
  const details = await adminClient().from("cleaners").update({ phone: "+6281234567890", area_id: jobArea }).eq("user_id", cleaner.id);
  if (details.error) throw new Error(`Could not set the cleaner's details: ${details.error.message}`);

  codes.open = (
    await world.job({ agencyId: seeded, cleaner, startsIn: 5, address: "Jl. Kenanga Contoh No. 7, Cakung, Jakarta Timur", note: "Kunci ada di satpam. Mohon lepas alas kaki." })
  ).code;
  codes.started = (
    await world.job({ agencyId: seeded, cleaner, startsIn: -40, address: "Jl. Flamboyan Contoh No. 21, Duren Sawit, Jakarta Timur", checkedInMinutesAgo: 25 })
  ).code;
  await world.job({ agencyId: seeded, cleaner, startsIn: 100, address: "Jl. Cempaka Contoh No. 3, Matraman, Jakarta Timur" });
  await world.job({ agencyId: seeded, cleaner, startsIn: 26 * 60, address: "Jl. Anggrek Contoh No. 9, Jatinegara, Jakarta Timur" });
  codes.finished = (
    await world.job({ agencyId: seeded, cleaner, startsIn: -150, address: "Jl. Dahlia Contoh No. 30, Cipayung, Jakarta Timur", completedMinutesAgo: 20 })
  ).code;

  sessions.cleaner = await sessionOf(browser, baseURL, cleaner);
  sessions.idle = await sessionOf(browser, baseURL, idle);
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await world?.cleanup();
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
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/^(Memuat|Loading)/)).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

async function shoot(page: Page, name: string, width: number, mobile: boolean) {
  await page.setViewportSize({ width, height: heights[width] });
  await settle(page);
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

test("the home, the job list, a job ready to check in, a finished job and the account", async ({ browser }) => {
  test.setTimeout(300_000);
  await shootAll(browser, "home", "/cleaner", sessions.cleaner);
  await shootAll(browser, "jobs", "/cleaner/jobs", sessions.cleaner);
  await shootAll(browser, "job", `/cleaner/jobs/${codes.open}`, sessions.cleaner);
  await shootAll(browser, "job-done", `/cleaner/jobs/${codes.finished}`, sessions.cleaner);
  await shootAll(browser, "account", "/cleaner/account", sessions.cleaner);
  await shootAll(browser, "home-new", "/cleaner", sessions.idle);
  await shootAll(browser, "jobs-empty", "/cleaner/jobs", sessions.idle);
});

test("a job in progress before and with its stream, and the check-out confirm step", async ({ browser }) => {
  test.setTimeout(240_000);
  const path = `/cleaner/jobs/${codes.started}`;
  await shootAll(browser, "live-off", path, sessions.cleaner);

  // Start the stream once: the page then reads its state from the server in every context.
  const context = await newContext(browser, "phone", sessions.cleaner);
  const page = await context.newPage();
  await page.goto(path);
  await settle(page);
  await page.getByRole("button", { name: "Mulai siaran" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Aktif" })).toBeVisible({ timeout: 15_000 });
  await context.close();
  await shootAll(browser, "live", path, sessions.cleaner);

  const phone = await newContext(browser, "phone", sessions.cleaner);
  const confirm = await phone.newPage();
  for (const [lang, prefix] of languages) {
    await confirm.goto(`${prefix}${path}`);
    await settle(confirm);
    await confirm.getByRole("button", { name: "Check-out", exact: true }).click();
    const panel = confirm.getByRole("group").filter({ hasText: lang === "id" ? "Selesaikan pekerjaan ini?" : "Finish this job?" });
    await expect(panel).toBeVisible();
    for (const width of widths.phone) {
      await confirm.setViewportSize({ width, height: heights[width] });
      await panel.scrollIntoViewIfNeeded();
      await confirm.screenshot({ path: `${dir}/live-check-out-confirm-${lang}-${width}-fold.png` });
    }
  }
  await phone.close();
});
