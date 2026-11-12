import { expect, test } from "@playwright/test";
import { signedInAs } from "./setup/auth-state";
import { expectAccountFitsAvatar } from "./admin-account";

// R2 on a phone: below 1024 px the admin sidebar becomes a dark-green top bar whose Menu opens the same
// dark sections, the language switch and the signed-in user, without sideways scrolling at 360 px.

const band = "rgb(19, 42, 31)";

test.describe("the admin top bar at 360 px", () => {
  test.use({ ...signedInAs.admin, viewport: { width: 360, height: 780 } });

  test("is a dark band whose menu opens the sections", async ({ page }) => {
    await page.goto("/admin/services");
    const header = page.locator("header").first();
    await expect(header).toHaveCSS("background-color", band);

    const menu = page.getByRole("button", { name: "Menu" });
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    const nav = page.getByRole("navigation", { name: "Navigasi admin" });
    await expect(nav.getByRole("link")).toHaveCount(5);
    await expect(nav.getByRole("link", { name: "Layanan dan harga", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(header.getByRole("button", { name: "Keluar" })).toBeVisible();
    await expectAccountFitsAvatar(header);
    await expect(header.getByRole("group", { name: "Bahasa" })).toBeVisible();

    // The wordmark in the bar leads to live monitoring, the console's start page (R2b).
    await expect(header.getByRole("link", { name: "HomeKlin, ke Pemantauan langsung" })).toHaveAttribute("href", "/admin/monitor");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
