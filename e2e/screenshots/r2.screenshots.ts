import { expect, test, type Browser, type Page } from "@playwright/test";
import { createTestUser, deleteTestUsers, adminClient, type TestUser } from "../../tests/integration/test-project";
import { createJobWorld, sessionOf, type JobWorld } from "../job-test-data";
import type { StorageState } from "../setup/auth-state";

// R2 review screenshots: the admin console's dark-green sidebar (the redesign, Phase 13) on the
// dashboard, "Layanan dan harga" and the live monitor at 1280 and 1440 px, in both languages; the dark
// top bar with its menu open at 360 and 390 px; and the agency and owner consoles at 1440 px, to show
// their light T3b sidebar did not change. Saved to docs/screenshots/r2/ as <surface>-<lang>-<width>.png
// (phones also -fold.png, the first screen as it opens). The admin, the agency (with its own fictional
// partner agency) and the owner are made in the Supabase test project for this run and deleted at the end.
// Run with: npm run screenshots -- r2

const dir = "docs/screenshots/r2";
type Device = "phone" | "desktop";
const heights: Record<number, number> = { 360: 780, 390: 844, 1280: 800, 1440: 900 };
const languages = [
  ["id", ""],
  ["en", "/en"],
] as const;

test.describe.configure({ mode: "serial", timeout: 240_000 });

let world: JobWorld;
let owner: TestUser | undefined;
const sessions: Partial<Record<"admin" | "agency" | "owner", StorageState>> = {};

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  world = await createJobWorld("r2s");
  const admin = await world.admin("Uji Admin");
  const agency = await world.agency("Kilau Contoh");
  owner = await createTestUser("r2s-owner");
  const role = await adminClient().from("profiles").update({ role: "owner", full_name: "Uji Pemilik" }).eq("id", owner.id);
  if (role.error) throw new Error(`Could not make the screenshot user an owner: ${role.error.message}`);

  sessions.admin = await sessionOf(browser, baseURL, admin);
  sessions.agency = await sessionOf(browser, baseURL, agency.user);
  sessions.owner = await sessionOf(browser, baseURL, owner);
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await world?.cleanup();
  await deleteTestUsers([owner]);
});

async function newPage(browser: Browser, who: keyof typeof sessions, device: Device, width: number) {
  const mobile = device === "phone";
  const context = await browser.newContext({
    viewport: { width, height: heights[width] },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: "reduce",
    storageState: sessions[who],
  });
  return { context, page: await context.newPage() };
}

async function settle(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/^(Memuat|Loading)/)).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

async function shoot(page: Page, name: string, width: number, mobile: boolean) {
  await settle(page);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, `${name} at ${width} px scrolls sideways`).toBeLessThanOrEqual(width);
  if (mobile) await page.screenshot({ path: `${dir}/${name}-${width}-fold.png` });
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height: Math.max(pageHeight, heights[width]) });
  await page.screenshot({ path: `${dir}/${name}-${width}.png` });
  await page.setViewportSize({ width, height: heights[width] });
}

test("the admin sidebar on a desk", async ({ browser }) => {
  for (const width of [1280, 1440]) {
    const { context, page } = await newPage(browser, "admin", "desktop", width);
    for (const [lang, prefix] of languages) {
      for (const [name, path] of [
        ["admin-dashboard", "/admin"],
        ["admin-services", "/admin/services"],
        ["admin-monitor", "/admin/monitor"],
      ] as const) {
        await page.goto(`${prefix}${path}`);
        await shoot(page, `${name}-${lang}`, width, false);
      }
    }
    await context.close();
  }
});

test("the admin top bar with its menu open on a phone", async ({ browser }) => {
  for (const width of [360, 390]) {
    const { context, page } = await newPage(browser, "admin", "phone", width);
    for (const [lang, prefix] of languages) {
      await page.goto(`${prefix}/admin/services`);
      await settle(page);
      await page.screenshot({ path: `${dir}/admin-topbar-${lang}-${width}-fold.png` });
      await page.getByRole("button", { name: "Menu" }).click();
      await expect(page.getByRole("navigation", { name: lang === "id" ? "Navigasi admin" : "Admin navigation" })).toBeVisible();
      await shoot(page, `admin-menu-open-${lang}`, width, true);
    }
    await context.close();
  }
});

test("the agency and owner consoles keep their light sidebar", async ({ browser }) => {
  for (const [who, path] of [
    ["agency", "/agency"],
    ["owner", "/owner"],
  ] as const) {
    const { context, page } = await newPage(browser, who, "desktop", 1440);
    await page.goto(path);
    await shoot(page, `${who}-id`, 1440, false);
    await context.close();
  }
});
