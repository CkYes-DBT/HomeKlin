import { expect, test } from "@playwright/test";
import { signedInAs } from "./setup/auth-state";

// D2 on a desk: the agency back office opts in to the redesign as the admin console did (R1, R2):
// `theme-forest` with Inter on the warm cream canvas, and the dark-green forest sidebar of the partner
// mocks: 256 px of `band`, the role card ("Dasbor mitra agensi" over the agency's name; this setup's
// agency user has no agency row, so the card says "Agensi mitra HomeKlin"), 44 px items with the
// current one in lime, and the wordmark leading to the summary.

const cream = "rgb(243, 242, 234)";
const band = "rgb(19, 42, 31)";
const lime = "rgb(216, 239, 107)";
const interFamily = /^"?Inter"?[,\s]/;

test.describe("the agency back office at 1440 px", () => {
  test.use({ ...signedInAs.agency, viewport: { width: 1440, height: 900 } });

  test("uses the redesign: Inter on the cream canvas, in the main content and the sidebar", async ({ page }) => {
    await page.goto("/agency/services");
    await expect(page.getByRole("heading", { level: 1, name: "Layanan" })).toBeVisible();
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

  test("is a 256 px dark-green band with the partner role card", async ({ page }) => {
    await page.goto("/agency");
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
    expect((await sidebar.boundingBox())?.width).toBe(256);
    await expect(sidebar).toHaveCSS("background-color", band);
    await expect(sidebar).toContainText("Dasbor mitra agensi");
    await expect(sidebar).toContainText("Agensi mitra HomeKlin");
    await expect(sidebar.getByRole("link", { name: "HomeKlin, ke Ringkasan" })).toHaveAttribute("href", "/agency");
  });

  test("marks the current section in lime, keeps Petugas current on the schedule, with 44 px items", async ({ page }) => {
    await page.goto("/agency/schedule");
    const nav = page.getByRole("navigation", { name: "Navigasi agensi" });
    const current = nav.getByRole("link", { name: "Petugas", exact: true });
    await expect(current).toHaveAttribute("aria-current", "page");
    await expect(current).toHaveCSS("color", lime);
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    for (const link of await nav.getByRole("link").all()) {
      expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
  });
});
