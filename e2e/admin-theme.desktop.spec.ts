import { expect, test, type Page } from "@playwright/test";
import { signedInAs } from "./setup/auth-state";

// R1 on a desk: the admin console opts in to the redesign through the scoped `theme-forest` class
// (src/app/[locale]/(admin)/layout.tsx), like the landing page: Inter text on the warm cream canvas,
// in the main content and in the fixed sidebar. The agency opted in at D2 and the owner at D3
// (e2e/agency-shell.desktop.spec.ts, e2e/owner-shell.desktop.spec.ts).

const cream = "rgb(243, 242, 234)";
const interFamily = /^"?Inter"?[,\s]/;

/** The computed font family and the first painted background behind an element. */
async function lookOf(page: Page, selector: string) {
  await page.evaluate(() => document.fonts.ready);
  return page.locator(selector).first().evaluate((element) => {
    let background = "";
    for (let node: Element | null = element; node; node = node.parentElement) {
      const colour = getComputedStyle(node).backgroundColor;
      if (colour !== "rgba(0, 0, 0, 0)" && colour !== "transparent") {
        background = colour;
        break;
      }
    }
    return { font: getComputedStyle(element).fontFamily, background };
  });
}

test.describe("the admin console", () => {
  test.use(signedInAs.admin);

  test("uses the redesign: Inter on the cream canvas", async ({ page }) => {
    await page.goto("/admin/services");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const main = await lookOf(page, "main");
    expect(main.font).toMatch(interFamily);
    expect(main.background).toBe(cream);
  });

  test("gives the fixed sidebar the redesign fonts too", async ({ page }) => {
    await page.goto("/admin/services");
    const sidebar = await lookOf(page, "aside");
    expect(sidebar.font).toMatch(interFamily);
  });
});
