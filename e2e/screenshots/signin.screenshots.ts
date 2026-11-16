import { expect, test, type Browser, type Page } from "@playwright/test";

// The redesigned sign-in page (the SignIn and Phone-SignIn mocks), at two phone and two desktop
// widths, in both languages: the code form (the default, for customers), its code step, the password
// form (staff, cleaners, demo accounts) and the notice for an email order link that no longer works.
// Saved to docs/screenshots/signin/:
//   <surface>-<lang>-<width>.png       the whole page
//   <surface>-<lang>-<width>-fold.png  phones only: the first screen exactly as it opens
// Signed out throughout. The code step asks for a code for an address with no account, so nothing is
// made and no email is delivered.
// Run with: npx playwright test --config playwright.screenshots.config.ts "screenshots[\\/]signin\.screenshots"

const dir = "docs/screenshots/signin";
type Device = "phone" | "desktop";
const widths: Record<Device, number[]> = { phone: [360, 390], desktop: [1280, 1440] };
const heights: Record<number, number> = { 360: 780, 390: 844, 1280: 800, 1440: 900 };

test.describe.configure({ mode: "serial" });

async function newPage(browser: Browser, device: Device) {
  const width = widths[device][0];
  const mobile = device === "phone";
  const context = await browser.newContext({
    viewport: { width, height: heights[width] },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: "reduce",
  });
  return { context, page: await context.newPage() };
}

/** The first screen (phones) and the whole page at each width of the device; checks there is no sideways scroll. */
async function shootAll(page: Page, device: Device, name: string) {
  for (const width of widths[device]) {
    await page.setViewportSize({ width, height: heights[width] });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(width);
    if (device === "phone") await page.screenshot({ path: `${dir}/${name}-${width}-fold.png` });
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width, height: Math.max(pageHeight, heights[width]) });
    await page.screenshot({ path: `${dir}/${name}-${width}.png` });
  }
}

/** Opens a page in the language of its address (a remembered English choice would redirect it). */
async function open(page: Page, path: string) {
  await page.context().clearCookies({ name: "NEXT_LOCALE" });
  await page.goto(path);
}

for (const device of ["phone", "desktop"] as const) {
  test(`sign-in screens on a ${device}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await newPage(browser, device);

    for (const prefix of ["", "/en"]) {
      const en = prefix === "/en";
      const lang = en ? "en" : "id";

      await open(page, `${prefix}/login`);
      await expect(page.getByRole("button", { name: en ? "Send code" : "Kirim kode" })).toBeVisible();
      await shootAll(page, device, `code-${lang}`);

      await page.getByLabel("Email", { exact: true }).fill("nama.anda@example.com");
      await page.getByRole("button", { name: en ? "Send code" : "Kirim kode" }).click();
      await expect(page.getByLabel(en ? "6-digit code" : "Kode 6 angka")).toBeVisible({ timeout: 20_000 });
      await shootAll(page, device, `code-step-${lang}`);

      await open(page, `${prefix}/login?cara=sandi`);
      await expect(page.getByLabel(en ? "Password" : "Kata sandi", { exact: true })).toBeVisible();
      await shootAll(page, device, `password-${lang}`);

      await open(page, `${prefix}/login?tautan=tidak-berlaku`);
      await expect(page.getByRole("main").getByRole("status").filter({ hasText: en ? "no longer works" : "tidak berlaku" })).toBeVisible();
      await shootAll(page, device, `link-expired-${lang}`);
    }

    await context.close();
  });
}
