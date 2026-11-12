import { expect, test, type Browser, type Page } from "@playwright/test";
import { createJobWorld, sessionOf, type JobWorld } from "../job-test-data";
import type { StorageState } from "../setup/auth-state";

// R4 and R5 review screenshots: a service's row open with its edit form in place, the same form after
// a refused save (messages per field), and the "Layanan baru" create panel at /admin/services?new,
// empty and after a refused save. At 1440 px on a desk and 360 px on a phone, in both languages. Saved
// to docs/screenshots/r4/ as <state>-<lang>-<width>.png (phones also -fold.png, the first screen).
// Nothing is saved: the refused saves are refused by the server's checks. The admin is made in the
// Supabase test project for this run and deleted at the end.
// Run with: npm run screenshots -- r4

const dir = "docs/screenshots/r4";
type Device = "phone" | "desktop";
const heights: Record<number, number> = { 360: 780, 1440: 900 };
const languages = [
  { lang: "id", prefix: "", name: "Pembersihan Rutin", nameLabel: "Nama layanan (Bahasa Indonesia)", save: "Simpan perubahan", create: "Simpan layanan" },
  { lang: "en", prefix: "/en", name: "Regular Cleaning", nameLabel: "Service name (Indonesian)", save: "Save changes", create: "Save service" },
] as const;

test.describe.configure({ mode: "serial", timeout: 300_000 });

let world: JobWorld;
let session: StorageState;

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  world = await createJobWorld("r4s");
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

async function ready(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/^(Memuat|Loading)/)).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

async function shoot(page: Page, name: string, width: number, mobile: boolean) {
  // Move the pointer away so no row shows its hover fill.
  await page.mouse.move(0, 0);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, `${name} at ${width} px scrolls sideways`).toBeLessThanOrEqual(width);
  if (mobile) await page.screenshot({ path: `${dir}/${name}-${width}-fold.png` });
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height: Math.max(pageHeight, heights[width]) });
  await page.screenshot({ path: `${dir}/${name}-${width}.png` });
  await page.setViewportSize({ width, height: heights[width] });
}

for (const [device, width] of [
  ["desktop", 1440],
  ["phone", 360],
] as const) {
  test(`the edit and create panels on a ${device}`, async ({ browser }) => {
    const mobile = device === "phone";
    const { context, page } = await newPage(browser, device, width);
    for (const { lang, prefix, name, nameLabel, save, create } of languages) {
      await page.goto(`${prefix}/admin/services`);
      await ready(page);
      const row = page.locator("details").filter({ hasText: name });
      await row.locator("summary").click();
      await expect(row).toHaveAttribute("open", "");
      await shoot(page, `edit-${lang}`, width, mobile);

      await row.getByLabel(nameLabel).fill("");
      await row.getByLabel(/^(Harga penuh|Full price)/).fill("85,5");
      await row.getByRole("button", { name: save }).click();
      await expect(row.getByLabel(nameLabel)).toHaveAttribute("aria-invalid", "true");
      await row.getByLabel(nameLabel).blur();
      await shoot(page, `edit-error-${lang}`, width, mobile);

      await page.goto(`${prefix}/admin/services?new`);
      await ready(page);
      const panel = page.getByTestId("create-panel");
      await expect(panel.getByLabel(nameLabel)).toBeFocused();
      await panel.getByLabel(nameLabel).blur();
      await shoot(page, `create-${lang}`, width, mobile);

      await panel.getByRole("button", { name: create }).click();
      await expect(panel.getByRole("alert")).not.toBeEmpty();
      await panel.getByLabel(nameLabel).blur();
      await shoot(page, `create-error-${lang}`, width, mobile);
    }
    await context.close();
  });
}
