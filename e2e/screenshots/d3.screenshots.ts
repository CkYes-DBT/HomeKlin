import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminClient, createTestUser, deleteTestUsers, type TestUser } from "../../tests/integration/test-project";
import { signInWithPassword } from "../order-test-data";
import { createOwnerWorld, type OwnerWorld } from "../owner-test-data";

// D3 review screenshots: the owner dashboard after the owner mocks, at 1440 and 1280 px on a desk and
// 390 and 360 px on a phone, in both languages: Ringkasan (with the 30-day table open), Mitra agensi,
// the list with a suspend question open, Tambah mitra agensi, Akun admin with one account opened and
// its remove question open, and Buat akun admin. A throw-away owner and partner agency with two paid
// jobs (e2e/owner-test-data.ts) are removed at the end; the other rows are whatever the shared test
// project holds. Saved to docs/screenshots/d3/ as <page>-<lang>-<width>.png (phones also -fold.png).
// Run with: npx playwright test --config playwright.screenshots.config.ts "screenshots[\\/]d3\.screenshots"

const dir = "docs/screenshots/d3";
type Device = "phone" | "desktop";
const heights: Record<number, number> = { 360: 780, 390: 844, 1280: 800, 1440: 900 };
const languages = [
  ["id", ""],
  ["en", "/en"],
] as const;

test.describe.configure({ mode: "serial", timeout: 600_000 });

let world: OwnerWorld;
let owner: TestUser;
let admin: TestUser;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  world = await createOwnerWorld("d3-shots");
  owner = await createTestUser("d3-shots-owner", { full_name: "Uji Pemilik" });
  admin = await createTestUser("d3-shots-admin", { full_name: "Larasati Dewi" });
  const client = adminClient();
  await client.from("profiles").update({ role: "owner", full_name: "Uji Pemilik" }).eq("id", owner.id);
  await client.from("profiles").update({ role: "admin", full_name: "Larasati Dewi" }).eq("id", admin.id);
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await deleteTestUsers([owner, admin]);
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
  });
  const page = await context.newPage();
  await signInWithPassword(page, owner);
  return { context, page };
}

async function settle(page: Page) {
  await expect(page.locator("main h1").first()).toBeVisible();
  await expect(page.getByText(/^(Memuat|Loading)/)).toHaveCount(0, { timeout: 20_000 });
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
}

async function shoot(page: Page, name: string, width: number, mobile: boolean) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const wide =
    scrollWidth > width
      ? await page.evaluate(
          (edge) =>
            [...document.querySelectorAll("main *")]
              .filter((element) => element.getBoundingClientRect().right > edge + 1)
              .slice(0, 5)
              .map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
          width,
        )
      : [];
  expect(scrollWidth, `${name} at ${width} px scrolls sideways: ${wide.join(" | ")}`).toBeLessThanOrEqual(width);
  await page.evaluate(() => window.scrollTo(0, 0));
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
  test(`the owner dashboard on a ${device}`, async ({ browser }) => {
    const mobile = device === "phone";
    for (const width of widths) {
      const { context, page } = await newPage(browser, device, width);
      for (const [lang, prefix] of languages) {
        const id = lang === "id";

        await page.goto(`${prefix}/owner`);
        await settle(page);
        await shoot(page, `overview-${lang}`, width, mobile);
        await page.getByText(id ? "Lihat angka per hari" : "See the numbers per day").click();
        await shoot(page, `overview-table-${lang}`, width, mobile);

        await page.goto(`${prefix}/owner/agencies`);
        await settle(page);
        await shoot(page, `partners-${lang}`, width, mobile);
        const row = page.getByRole("row").filter({ hasText: world.agency.name });
        await row.getByRole("button", { name: new RegExp(`^(Tangguhkan|Suspend) ${world.agency.name}`) }).click();
        await row.scrollIntoViewIfNeeded();
        await shoot(page, `partners-suspend-${lang}`, width, mobile);

        await page.goto(`${prefix}/owner/agencies/new`);
        await settle(page);
        await shoot(page, `partner-new-${lang}`, width, mobile);

        await page.goto(`${prefix}/owner/admins`);
        await settle(page);
        await shoot(page, `admins-${lang}`, width, mobile);
        const account = page.locator(`[data-admin="${admin.email}"]`);
        await account.locator("summary").click();
        await account.getByRole("button", { name: id ? "Hapus admin Larasati Dewi" : "Remove admin Larasati Dewi" }).click();
        await shoot(page, `admins-remove-${lang}`, width, mobile);

        await page.goto(`${prefix}/owner/admins/new`);
        await settle(page);
        await shoot(page, `admin-new-${lang}`, width, mobile);
      }
      await context.close();
    }
  });
}
