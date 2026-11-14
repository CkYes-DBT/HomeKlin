import { expect, test, type Page } from "@playwright/test";
import { signedInAs } from "./setup/auth-state";

// R1 on a desk: the admin console opts in to the redesign through the scoped `theme-forest` class
// (src/app/[locale]/(admin)/layout.tsx), like the landing page: Inter text on the warm cream canvas,
// in the main content and in the fixed sidebar. The owner back office keeps the T3b look (Figtree on the
// cool off-white) until its own migration (markdown/design.md, "Migration notes"); the agency opted in
// at D2 (e2e/agency-shell.desktop.spec.ts).

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

for (const { role, path } of [
  { role: "owner", path: "/owner" },
] as const) {
  test.describe(`the ${role} back office`, () => {
    test.use(signedInAs[role]);

    test("keeps the T3b look: not Inter, not cream", async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const main = await lookOf(page, "main");
      expect(main.font).not.toMatch(interFamily);
      expect(main.font).toMatch(/Figtree/);
      expect(main.background).not.toBe(cream);
    });
  });
}
