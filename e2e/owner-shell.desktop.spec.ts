import { expect, test } from "@playwright/test";
import { signedInAs } from "./setup/auth-state";

// D3 on a desk: the owner dashboard opts in to the redesign as the admin (R1, R2) and agency (D2)
// consoles did: `theme-forest` with Inter on the warm cream canvas, and the dark-green forest sidebar of
// the owner mocks: 256 px of `band`, the role card ("Dasbor pemilik" over "Pemilik HomeKlin"), the
// three sections with 44 px items and the current one in lime, and the wordmark leading to the overview.
// The current item stays marked on the add pages under its section.

const cream = "rgb(243, 242, 234)";
const band = "rgb(19, 42, 31)";
const lime = "rgb(216, 239, 107)";
const interFamily = /^"?Inter"?[,\s]/;

test.describe("the owner dashboard at 1440 px", () => {
  test.use({ ...signedInAs.owner, viewport: { width: 1440, height: 900 } });

  test("uses the redesign: Inter on the cream canvas, in the main content and the sidebar", async ({ page }) => {
    await page.goto("/owner");
    await expect(page.getByRole("heading", { level: 1, name: "Ringkasan" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const main = page.locator("main");
    expect(await main.evaluate((element) => getComputedStyle(element).fontFamily)).toMatch(interFamily);
    const canvas = await main.evaluate((element) => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const colour = getComputedStyle(node).backgroundColor;
        if (colour !== "rgba(0, 0, 0, 0)") return colour;
      }
      return "";
    });
    expect(canvas).toBe(cream);
    expect(await page.locator("aside").evaluate((element) => getComputedStyle(element).fontFamily)).toMatch(interFamily);
  });

  test("is a 256 px dark-green band with the owner role card", async ({ page }) => {
    await page.goto("/owner/admins");
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
    expect((await sidebar.boundingBox())?.width).toBe(256);
    await expect(sidebar).toHaveCSS("background-color", band);
    await expect(sidebar).toContainText("Dasbor pemilik");
    await expect(sidebar).toContainText("Pemilik HomeKlin");
    await expect(sidebar.getByRole("button", { name: "Keluar" })).toBeVisible();
    const home = sidebar.getByRole("link", { name: "HomeKlin, ke Ringkasan" });
    expect((await home.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await home.click();
    await expect(page).toHaveURL("/owner");
  });

  test("lists the three sections of the mocks and marks the current one in lime, also on its add page", async ({ page }) => {
    await page.goto("/owner/agencies/new");
    const nav = page.getByRole("navigation", { name: "Navigasi pemilik" });
    await expect(nav.getByRole("link")).toHaveText(["Ringkasan", "Mitra agensi", "Akun admin"]);
    const current = nav.getByRole("link", { name: "Mitra agensi", exact: true });
    await expect(current).toHaveAttribute("aria-current", "page");
    await expect(current).toHaveCSS("color", lime);
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    for (const link of await nav.getByRole("link").all()) {
      expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("reads the same in English", async ({ page }) => {
    await page.goto("/en/owner/admins");
    const sidebar = page.locator("aside");
    await expect(sidebar).toContainText("Owner dashboard");
    await expect(sidebar).toContainText("HomeKlin owner");
    await expect(page.getByRole("navigation", { name: "Owner navigation" }).getByRole("link")).toHaveText([
      "Overview",
      "Partner agencies",
      "Admin accounts",
    ]);
    await expect(sidebar.getByRole("link", { name: "HomeKlin, to Overview" })).toHaveAttribute("href", "/en/owner");
  });
});
