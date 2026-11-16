import { expect, test, type Page } from "@playwright/test";
import { signedInAs } from "./setup/auth-state";

// The customer pages' language switch floats at the bottom-left of the viewport (the customer layout),
// on every page, above the phone's bottom bar and clear of the content. Runs on a phone and a desktop.
const paths = ["/home", "/services", "/support", "/orders", "/en/home"];

test.use(signedInAs.customer);

function toggle(page: Page, path: string) {
  return page.getByRole("group", { name: path.startsWith("/en") ? "Language" : "Bahasa" });
}

for (const path of paths) {
  test(`shows one language switch at the bottom-left of ${path}`, async ({ page }) => {
    await page.goto(path);
    const group = toggle(page, path);
    await expect(group).toHaveCount(1);
    await expect(group).toBeVisible();
    // It is no longer in the app bar.
    await expect(page.getByRole("banner").getByRole("group", { name: /Bahasa|Language/ })).toHaveCount(0);

    const viewport = page.viewportSize()!;
    const box = (await group.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x).toBeLessThanOrEqual(viewport.width / 4);
    expect(box.y + box.height).toBeGreaterThan(viewport.height / 2);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

    // The current language is marked, and the other one is a 44 px link.
    const current = group.locator('[aria-current="true"]');
    await expect(current).toHaveText(path.startsWith("/en") ? /^EN/ : /^ID/);
    const other = (await group.getByRole("link").boundingBox())!;
    expect(other.width).toBeGreaterThanOrEqual(44);
    expect(other.height).toBeGreaterThanOrEqual(44);

    // It never covers the bottom bar (phones).
    const bar = page.getByRole("navigation", { name: path.startsWith("/en") ? "Main navigation" : "Navigasi utama" });
    const barBox = await bar.last().boundingBox();
    if (barBox && barBox.y > viewport.height / 2) expect(box.y + box.height).toBeLessThanOrEqual(barBox.y);

    // At the end of the page, the last content ends above it.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const lastBottom = await page.evaluate(
      () => document.querySelector("main")!.lastElementChild!.getBoundingClientRect().bottom,
    );
    const after = (await group.boundingBox())!;
    expect(lastBottom).toBeLessThanOrEqual(after.y);
  });
}

test("is reachable by keyboard and switches the language, keeping the page", async ({ page }) => {
  await page.goto("/services");
  const link = toggle(page, "/services").getByRole("link", { name: "EN English" });
  await link.focus();
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/en/services");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const group = toggle(page, "/en/services");
  await expect(group.locator('[aria-current="true"]')).toHaveText(/^EN/);
  await group.getByRole("link", { name: "ID Bahasa Indonesia" }).click();
  await expect(page).toHaveURL("/services");
});

test("stays in place while the page scrolls", async ({ page }) => {
  await page.goto("/services");
  const group = toggle(page, "/services");
  const before = (await group.boundingBox())!;
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const after = (await group.boundingBox())!;
  expect(Math.round(after.y)).toBe(Math.round(before.y));
  expect(Math.round(after.x)).toBe(Math.round(before.x));
});
