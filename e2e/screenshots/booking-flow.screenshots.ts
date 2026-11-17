import { expect, test, type Browser, type Page } from "@playwright/test";
import { createTestUser, deleteTestUsers, type TestUser } from "../../tests/integration/test-project";
import { cancelOrder, lateWindow } from "../booking-test-data";
import { bookSignedIn } from "../order-test-data";

// The booking flow's focused layout (2026-11-17): the header with "Kembali" and no navigation on the
// three steps, at two phone widths and two desktop widths, in both languages. Step 1 (/services) and
// step 2 (/pesan) at the top, step 2 on a phone also scrolled to the middle (the booking bar on the
// bottom edge with the language switch above it), and step 3 (/orders/pay) at the top and at its end.
// Saved to docs/screenshots/booking-flow/<surface>-<lang>-<width>.png, viewport only. A fictional
// customer and one order in Jakarta Selatan (13.00) in the Supabase test project, deleted at the end.
// Run with: npm run screenshots -- booking-flow

const dir = "docs/screenshots/booking-flow";
type Device = "phone" | "desktop";
const widths: Record<Device, number[]> = { phone: [360, 390], desktop: [1280, 1440] };
const heights: Record<number, number> = { 360: 740, 390: 844, 1280: 800, 1440: 900 };
const languages = [
  ["id", ""],
  ["en", "/en"],
] as const;

test.describe.configure({ mode: "serial" });

let customer: TestUser;
let orderId = "";

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  customer = await createTestUser("flow-shots", { full_name: "Uji Pelanggan" });
  const { context, page } = await newPage(browser, "desktop");
  orderId = await bookSignedIn(page, "regular", "jakarta-selatan", await lateWindow("jakarta-selatan", "13.00"));
  await context.close();
});

test.afterAll(async () => {
  if (orderId) await cancelOrder(orderId);
  if (customer) await deleteTestUsers([customer]);
});

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
  const page = await context.newPage();
  await page.goto("/login?cara=sandi");
  await page.getByLabel("Email", { exact: true }).fill(customer.email);
  await page.getByLabel("Kata sandi", { exact: true }).fill(customer.password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
  return { context, page };
}

async function shoot(page: Page, name: string, width: number) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({ path: `${dir}/${name}-${width}.png` });
}

for (const device of ["phone", "desktop"] as const) {
  test(`the booking steps, focused, on a ${device}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const { context, page } = await newPage(browser, device);
    for (const [lang, prefix] of languages) {
      for (const width of widths[device]) {
        await page.setViewportSize({ width, height: heights[width] });

        await page.goto(`${prefix}/services?area=jakarta-selatan&layanan=regular`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        // The catalog streams in after the page's shell.
        await expect(page.getByRole("radio").first()).toBeVisible();
        await expect(page.getByText(/Memuat layanan|Loading services/)).toHaveCount(0);
        await shoot(page, `step1-${lang}`, width);

        await page.goto(`${prefix}/pesan?layanan=regular&area=jakarta-selatan`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await shoot(page, `step2-${lang}`, width);
        if (device === "phone") {
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
          await expect(page.getByTestId("booking-bar")).toHaveAttribute("data-shown", "true");
          await shoot(page, `step2-bar-${lang}`, width);
        }

        await page.goto(`${prefix}/orders/pay?order=${orderId}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await shoot(page, `step3-${lang}`, width);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await shoot(page, `step3-end-${lang}`, width);
      }
    }
    await context.close();
  });
}
