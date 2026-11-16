import { expect, test } from "@playwright/test";
import { signedInAs } from "./setup/auth-state";

// Customer pages are mobile-first: on a phone the main navigation is a bottom bar.
// A signed-in customer, because Pesanan (/orders) is theirs only (T5). The fifth item, Akun, is not a
// page but a menu (e2e/account-menu.spec.ts), so the bar has four links and one button.
const sections = [
  { label: "Beranda", path: "/home", heading: "Pesanan Anda" },
  { label: "Layanan", path: "/services", heading: "Layanan" },
  { label: "Pesanan", path: "/orders", heading: "Pesanan" },
  { label: "Bantuan", path: "/support", heading: "Bantuan" },
];

test.describe("customer bottom navigation", () => {
  test.use(signedInAs.customer);

  test("sits at the bottom of the screen with four labelled links and the account menu button", async ({ page }) => {
    await page.goto("/home");
    const nav = page.getByRole("navigation", { name: "Navigasi utama" });
    await expect(nav).toBeVisible();

    const box = await nav.boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport && Math.round(box.y + box.height)).toBe(viewport?.height);

    for (const { label } of sections) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    await expect(nav.getByRole("button", { name: "Akun", exact: true })).toBeVisible();
  });

  test("marks only the current page", async ({ page }) => {
    await page.goto("/home");
    const nav = page.getByRole("navigation", { name: "Navigasi utama" });
    await expect(nav.getByRole("link", { name: "Beranda" })).toHaveAttribute("aria-current", "page");
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  });

  test("navigates to every section and moves the current marker", async ({ page }) => {
    await page.goto("/home");
    const nav = page.getByRole("navigation", { name: "Navigasi utama" });

    for (const { label, path, heading } of [...sections.slice(1), sections[0]]) {
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    }
  });

  test("gives every item a touch target of at least 44 px", async ({ page }) => {
    await page.goto("/home");
    const links = page.getByRole("navigation", { name: "Navigasi utama" }).locator("a, button");
    await expect(links).toHaveCount(sections.length + 1);
    for (const link of await links.all()) {
      const box = await link.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  // T4: the brand moved from the home page's own header into the app bar, which every customer page
  // shares on phones (with the language switch on its right).
  for (const path of ["/home", "/services"]) {
    test(`shows the wordmark at the top of ${path}, linking to the booking home`, async ({ page }) => {
      await page.goto(path);
      const wordmark = page.getByRole("banner").getByRole("link", { name: "HomeKlin, ke beranda" });
      await expect(wordmark).toBeVisible();
      await expect(wordmark).toHaveAttribute("href", "/home");
      const box = await wordmark.boundingBox();
      expect(box?.y).toBeLessThan(80);
      await expect(page.getByRole("main").getByText("HomeKlin", { exact: true })).toHaveCount(0);
    });
  }
});
