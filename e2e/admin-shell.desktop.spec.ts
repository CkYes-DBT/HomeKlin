import { expect, test } from "@playwright/test";
import { signedInAs } from "./setup/auth-state";

// R2 on a desk: the admin sidebar is the redesign's dark-green band (markdown/design.md, Layout, "Agency
// and admin back office"): 256 px of `band`, a role card, 44 px items with the current one in lime on
// `band-raised`, and the language switch and the signed-in user at the bottom. The agency and owner
// sidebars keep the light T3b panel (they share SidebarShell with its default tone).

const band = "rgb(19, 42, 31)";
const lime = "rgb(216, 239, 107)";

test.describe("the admin sidebar at 1440 px", () => {
  test.use({ ...signedInAs.admin, viewport: { width: 1440, height: 900 } });

  test("is a 256 px dark-green band", async ({ page }) => {
    await page.goto("/admin/services");
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
    const box = await sidebar.boundingBox();
    expect(box?.width).toBe(256);
    await expect(sidebar).toHaveCSS("background-color", band);
  });

  test("marks the current section in lime, with every item a 44 px target", async ({ page }) => {
    await page.goto("/admin/services");
    const nav = page.getByRole("navigation", { name: "Navigasi admin" });
    const current = nav.getByRole("link", { name: "Layanan dan harga", exact: true });
    await expect(current).toHaveAttribute("aria-current", "page");
    await expect(current).toHaveCSS("color", lime);

    const links = nav.getByRole("link");
    await expect(links).toHaveCount(5);
    for (const link of await links.all()) {
      const linkBox = await link.boundingBox();
      expect(linkBox?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("lists the five sections of the mock in order, and the wordmark leads to live monitoring", async ({ page }) => {
    await page.goto("/admin/services");
    const nav = page.getByRole("navigation", { name: "Navigasi admin" });
    await expect(nav.getByRole("link")).toHaveText(["Pemantauan langsung", "Layanan dan harga", "Obrolan bantuan", "Pertanyaan umum", "Rekaman"]);

    const home = page.locator("aside").getByRole("link", { name: "HomeKlin, ke Pemantauan langsung" });
    const homeBox = await home.boundingBox();
    expect(homeBox?.height).toBeGreaterThanOrEqual(44);
    await home.click();
    await expect(page).toHaveURL("/admin/monitor");
    await expect(page.getByRole("heading", { level: 1, name: "Pemantauan langsung" })).toBeVisible();
  });

  test("shows the role card, the language switch and a Keluar button", async ({ page }) => {
    await page.goto("/admin/monitor");
    const sidebar = page.locator("aside");
    await expect(sidebar.getByText("Admin Dashboard", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Operasional HomeKlin", { exact: true })).toBeVisible();
    await expect(sidebar.getByRole("group", { name: "Bahasa" })).toBeVisible();

    const signOut = sidebar.getByRole("button", { name: "Keluar" });
    await expect(signOut).toBeVisible();
    const signOutBox = await signOut.boundingBox();
    expect(signOutBox?.height).toBeGreaterThanOrEqual(44);
    expect(signOutBox?.width).toBeGreaterThanOrEqual(44);
  });

  test("reads the same in English", async ({ page }) => {
    await page.goto("/en/admin/services");
    const sidebar = page.locator("aside");
    await expect(sidebar.getByText("Admin Dashboard", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("HomeKlin operations", { exact: true })).toBeVisible();
    const current = page
      .getByRole("navigation", { name: "Admin navigation" })
      .getByRole("link", { name: "Services and prices", exact: true });
    await expect(current).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("button", { name: "Log out" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Admin navigation" }).getByRole("link")).toHaveText([
      "Live monitoring",
      "Services and prices",
      "Support chats",
      "FAQ",
      "Recordings",
    ]);
    await expect(sidebar.getByRole("link", { name: "HomeKlin, to Live monitoring" })).toHaveAttribute("href", "/en/admin/monitor");
  });

  test("draws the focus ring in lime inside the band", async ({ page }) => {
    await page.goto("/admin/monitor");
    const link = page.getByRole("navigation", { name: "Navigasi admin" }).getByRole("link", { name: "Obrolan bantuan" });
    await link.focus();
    await expect(link).toHaveCSS("outline-color", lime);
  });
});

for (const { role, path } of [
  { role: "agency", path: "/agency" },
  { role: "owner", path: "/owner" },
] as const) {
  test.describe(`the ${role} sidebar`, () => {
    test.use({ ...signedInAs[role], viewport: { width: 1440, height: 900 } });

    test("keeps its light T3b panel", async ({ page }) => {
      await page.goto(path);
      const sidebar = page.locator("aside");
      await expect(sidebar).toBeVisible();
      // The T3b --color-panel, resolved by the browser the same way as the sidebar's own background.
      const { background, panel } = await sidebar.evaluate((element) => {
        const probe = document.createElement("span");
        probe.style.backgroundColor = "var(--color-panel)";
        element.append(probe);
        const panel = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { background: getComputedStyle(element).backgroundColor, panel };
      });
      expect(background).not.toBe(band);
      expect(background).toBe(panel);
    });
  });
}
