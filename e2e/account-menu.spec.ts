import { expect, test, type Page } from "@playwright/test";
import { signedInAs, signedOut } from "./setup/auth-state";

// The customer's "Akun" is a menu, not a page: it shows who is signed in and a "Keluar" action, and the
// old account page is gone. Runs on a phone (the bottom bar) and on a desktop (the top bar).
const nav = (page: Page) => page.getByRole("navigation", { name: "Navigasi utama" });
const trigger = (page: Page) => nav(page).getByRole("button", { name: "Akun", exact: true });

test.describe("the account menu of a signed-in customer", () => {
  test.use(signedInAs.customer);

  test("opens from the Akun button and shows the name and the way out", async ({ page }) => {
    await page.goto("/home");
    await expect(trigger(page)).toHaveAttribute("aria-haspopup", "menu");
    await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("menu")).toHaveCount(0);

    await trigger(page).click();
    await expect(trigger(page)).toHaveAttribute("aria-expanded", "true");
    const menu = page.getByRole("menu", { name: "Akun" });
    await expect(menu).toBeVisible();
    await expect(menu.getByText("Masuk sebagai")).toBeVisible();
    // The shared test customer has no name, so the menu says "Akun HomeKlin" (a named customer is in
    // auth-customer.mobile.spec.ts).
    await expect(menu.getByText("Akun HomeKlin", { exact: true })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Keluar" })).toBeFocused();
    // The old account page's note does not belong in a menu.
    await expect(page.getByText("Tidak perlu kata sandi")).toHaveCount(0);

    await trigger(page).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("opens with Enter and with Space, and Escape closes it and returns the focus", async ({ page }) => {
    await page.goto("/home");
    await expect(trigger(page)).toBeEnabled();
    for (const key of ["Enter", "Space"]) {
      await trigger(page).focus();
      await page.keyboard.press(key);
      await expect(page.getByRole("menuitem", { name: "Keluar" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(trigger(page)).toBeFocused();
    }
  });

  test("closes on Tab, and on a click outside", async ({ page }) => {
    await page.goto("/home");
    await trigger(page).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("menu")).toHaveCount(0);

    await trigger(page).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.getByRole("main").click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("closes when the page changes", async ({ page }) => {
    await page.goto("/home");
    await trigger(page).click();
    await expect(page.getByRole("menu")).toBeVisible();
    // By keyboard, so no pointer press outside closes the menu: only the new page can.
    await nav(page).getByRole("link", { name: "Layanan", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/services");
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("gives the button and the item a touch target of at least 44 px and stays on screen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/home");
    const button = await trigger(page).boundingBox();
    expect(button?.width).toBeGreaterThanOrEqual(44);
    expect(button?.height).toBeGreaterThanOrEqual(44);

    await trigger(page).click();
    const item = await page.getByRole("menuitem", { name: "Keluar" }).boundingBox();
    expect(item?.height).toBeGreaterThanOrEqual(44);
    const menu = await page.getByRole("menu").boundingBox();
    expect(menu).not.toBeNull();
    expect(menu!.x).toBeGreaterThanOrEqual(0);
    expect(menu!.y).toBeGreaterThanOrEqual(0);
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(360);
    expect(menu!.y + menu!.height).toBeLessThanOrEqual(740);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });

  // The log-out ends the browser's own session only (scope "local"), so the saved test session still works.
  test("logs out from the menu, and /orders then needs a sign-in again", async ({ page }) => {
    await page.goto("/home");
    await trigger(page).click();
    await page.getByRole("menuitem", { name: "Keluar" }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/orders");
    await expect(page).toHaveURL(/\/login\?next=%2Forders$/);
  });

  test("keeps working in English", async ({ page }) => {
    await page.goto("/en/home");
    const english = page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Account" });
    await english.click();
    await expect(page.getByRole("menu").getByText("Signed in as")).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible();
  });

  test("redirects the retired account page to the customer home", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL("/home");
    await page.goto("/en/account");
    await expect(page).toHaveURL("/en/home");
  });
});

test.describe("the account menu of a visitor", () => {
  test.use(signedOut);

  test("offers Masuk, and the retired account page lands on the home", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL("/home");
    await trigger(page).click();
    await expect(page.getByRole("menuitem", { name: "Masuk" })).toHaveAttribute("href", "/login");
  });
});
