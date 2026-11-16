import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { adminClient } from "../../tests/integration/test-project";
import { fillWindow, freeWindows, type Window } from "../booking-test-data";
import { createJobWorld, seededAgencyId, sessionOf, type JobWorld } from "../job-test-data";
import type { StorageState } from "../setup/auth-state";

// D5 pass 5a review screenshots, the customer's booking flow and orders after the mocks Main and
// Phone-Services (step 1, a service and a time chosen, one time full), Customer-Booking and
// Phone-Booking (step 2), Customer-Payment and Phone-Payment (step 3), Customer-Confirmed and
// Phone-Confirmed (paid), Customer-Orders and Phone-Orders (an order in progress, one still to come),
// Customer-Home and Phone-Home (the signed-in home and the list), and the home for a visitor. Two phone
// widths and two desktop widths, both languages. Saved to docs/screenshots/d5a/:
//   <surface>-<lang>-<width>.png       the whole page, with fixed bars where they really sit
//   <surface>-<lang>-<width>-fold.png  phones only: the first screen exactly as it opens
// Fictional users and orders are made for the run in the Supabase test project and deleted at the end
// (e2e/job-test-data.ts). Run with:
//   npx playwright test --config playwright.screenshots.config.ts "screenshots[\\/]d5a\.screenshots"

const dir = "docs/screenshots/d5a";
type Device = "phone" | "desktop";
const widths: Record<Device, number[]> = { phone: [360, 390], desktop: [1280, 1440] };
const heights: Record<number, number> = { 360: 780, 390: 844, 1280: 800, 1440: 900 };
const languages = [
  ["id", ""],
  ["en", "/en"],
] as const;
const area = "jakarta-pusat";
const guest: StorageState = { cookies: [], origins: [] };

test.describe.configure({ mode: "serial" });

let world: JobWorld;
let customer: StorageState;
const ids: Record<"live" | "upcoming" | "pending" | "paid" | "done", string> = {} as never;
let window: Window;

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  world = await createJobWorld("d5a");
  const admin = adminClient();
  await admin.from("profiles").update({ full_name: "Nadia Contoh Putri" }).eq("id", world.customer.id);
  const seeded = await seededAgencyId();
  const cleaner = await world.cleaner(seeded, "Wulan Contoh Anggraeni");
  const set = async (id: string, values: Record<string, unknown>) => {
    const { error } = await admin.from("orders").update(values).eq("id", id);
    if (error) throw new Error(`Could not prepare an order: ${error.message}`);
  };
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

  ids.done = (await world.job({ agencyId: seeded, cleaner, startsIn: -3 * 24 * 60, address: "Jl. Melati Contoh No. 4, Matraman, Jakarta Timur", completedMinutesAgo: 3 * 24 * 60 - 110 })).id;
  ids.paid = (await world.job({ agencyId: seeded, cleaner: null, startsIn: 2 * 24 * 60, address: "Jl. Kemang Contoh No. 12, Cakung, Jakarta Timur" })).id;
  ids.upcoming = (
    await world.job({ agencyId: seeded, cleaner, startsIn: 26 * 60, address: "Jl. Kenanga Contoh No. 7, Jatinegara, Jakarta Timur", note: "Masuk lewat pintu samping. Kunci ada di pos satpam." })
  ).id;
  ids.live = (await world.job({ agencyId: seeded, cleaner, startsIn: -10, address: "Jl. Flamboyan Contoh No. 21, Duren Sawit, Jakarta Timur", checkedInMinutesAgo: 6 })).id;
  ids.pending = (await world.job({ agencyId: seeded, cleaner: null, startsIn: 3 * 24 * 60, address: "Jl. Anggrek Contoh No. 9, Cipayung, Jakarta Timur" })).id;

  await set(ids.done, { payment_type: "bank_transfer", assigned_at: hoursAgo(5 * 24), created_at: hoursAgo(6 * 24) });
  await set(ids.paid, { payment_type: "qris", created_at: hoursAgo(0.2) });
  await set(ids.upcoming, { payment_type: "qris", assigned_at: hoursAgo(3), created_at: hoursAgo(20) });
  await set(ids.live, { payment_type: "qris", assigned_at: hoursAgo(20), created_at: hoursAgo(26), customer_note: "Masuk lewat pintu samping. Kunci ada di pos satpam." });
  await set(ids.pending, { status: "pending_payment" });

  customer = await sessionOf(browser, baseURL, world.customer);
  window = (await freeWindows(area))[1];
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

async function shootAll(
  browser: Browser,
  name: string,
  path: string,
  storageState: StorageState,
  prepare?: (page: Page, lang: "id" | "en") => Promise<void>,
) {
  for (const device of ["phone", "desktop"] as const) {
    const context = await newContext(browser, device, storageState);
    const page = await context.newPage();
    for (const [lang, prefix] of languages) {
      await page.goto(`${prefix}${path}`);
      await settle(page);
      if (prepare) await prepare(page, lang);
      for (const width of widths[device]) await shoot(page, `${name}-${lang}`, width, device === "phone");
    }
    await context.close();
  }
}

test("step 1 with a service and a time chosen (one time full), and step 2", async ({ browser }) => {
  test.setTimeout(600_000);
  const windows = await freeWindows(area);
  const day = new Date(windows[0].startsAt).toISOString().slice(0, 10);
  const sameDay = windows.filter((candidate) => new Date(candidate.startsAt).toISOString().slice(0, 10) === day);
  const restore = await fillWindow(area, sameDay[sameDay.length - 1].startsAt);
  try {
    await shootAll(browser, "step1", `/services?area=${area}&layanan=regular`, guest, async (page, lang) => {
      const chips = page.getByRole("region", { name: lang === "id" ? /^Jam kosong di/ : /^Free times in/ }).getByRole("radio", { disabled: false });
      await chips.nth(1).check();
    });
  } finally {
    await restore();
  }
  const params = new URLSearchParams({ layanan: "regular", area, starts: window.startsAt });
  await shootAll(browser, "step2", `/pesan?${params.toString()}`, guest, async (page, lang) => {
    await page.getByLabel(lang === "id" ? "Alamat lengkap" : "Full address").fill("Jl. Kemang Contoh No. 12, Gambir, Jakarta Pusat 10110");
    await page.getByLabel(lang === "id" ? "Catatan untuk Petugas (opsional)" : "Note for your cleaner (optional)").fill("Masuk lewat pintu samping.");
    await page.getByLabel(lang === "id" ? "Nomor HP" : "Mobile number").fill("0812 3456 7890");
    await page.getByLabel("Email", { exact: true }).fill("nadia.contoh@example.com");
    await page.getByRole("switch").check();
  });
  await shootAll(browser, "step2-signed-in", `/pesan?${params.toString()}`, customer);
  // The booking-flow fixes (2026-11-16): step 2 without a choice (as from a landing link), with the
  // pickers and the same chips as step 1, and the consent error after pressing the button without it.
  await shootAll(browser, "step2-pickers", `/pesan?layanan=regular&area=${area}`, guest);
  await shootAll(browser, "step2-consent-error", `/pesan?${params.toString()}`, customer, async (page, lang) => {
    await page.getByLabel(lang === "id" ? "Alamat lengkap" : "Full address").fill("Jl. Kemang Contoh No. 12, Gambir, Jakarta Pusat 10110");
    await page.getByLabel(lang === "id" ? "Nomor HP" : "Mobile number").fill("0812 3456 7890");
    await page
      .getByRole("form", { name: lang === "id" ? "Pesan layanan" : "Book a cleaning" })
      .getByRole("button", { name: lang === "id" ? "Lanjut ke pembayaran" : "Continue to payment" })
      .click();
    await expect(page.getByRole("switch")).toBeFocused();
  });
  await shootAll(browser, "step1-no-service", `/services?area=${area}`, guest, async (page, lang) => {
    await page.getByRole("form", { name: lang === "id" ? "Ringkasan" : "Summary" }).getByRole("button", { name: lang === "id" ? "Pesan sekarang" : "Book now" }).click();
    await expect(page.getByRole("alert").filter({ hasText: lang === "id" ? "Pilih salah satu layanan" : "Choose one of the services" })).toBeVisible();
  });
});

test("step 3, the confirmation, an order's page and the orders", async ({ browser }) => {
  test.setTimeout(400_000);
  await shootAll(browser, "step3-payment", `/orders?booked=${ids.pending}`, customer);
  await shootAll(browser, "confirmed", `/orders?booked=${ids.paid}`, customer);
  await shootAll(browser, "order-live", `/orders?order=${ids.live}`, customer);
  await shootAll(browser, "order-upcoming", `/orders?order=${ids.upcoming}`, customer);
  await shootAll(browser, "order-waiting", `/orders?order=${ids.pending}`, customer);
  await shootAll(browser, "home-customer", "/home", customer);
  await shootAll(browser, "orders", "/orders", customer);
  await shootAll(browser, "home-guest", "/home", guest);
});
