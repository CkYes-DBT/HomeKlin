import { expect, test } from "@playwright/test";

// The sign-in page's redesign (the SignIn mock) on a desktop screen, signed out: the dark forest panel
// on the left with the wordmark, the heading and the three facts, and on the right the back link, the
// language switch and the card.

test("on a desktop the forest panel sits beside the card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Kirim kode" })).toBeVisible();

  const panel = page.getByRole("complementary", { name: "Tentang HomeKlin" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link", { name: "HomeKlin, halaman depan" })).toHaveAttribute("href", "/");
  await expect(panel.getByText("Satu pintu untuk semua akun HomeKlin")).toBeVisible();
  for (const fact of ["Pantau pembersihan secara langsung", "Rekaman tersedia selama 7 hari", "Bantuan dari tim HomeKlin"]) {
    await expect(panel.getByRole("listitem").filter({ hasText: fact })).toBeVisible();
  }
  // The phone's copy of the heading is not shown.
  await expect(page.getByRole("main").getByText("Satu pintu untuk semua akun HomeKlin")).toBeHidden();

  const banner = page.getByRole("banner");
  await expect(banner.getByRole("link", { name: "Kembali ke beranda" })).toHaveAttribute("href", "/");
  await expect(banner.getByRole("group", { name: "Bahasa" })).toBeVisible();

  const panelBox = await panel.boundingBox();
  const cardBox = await page.getByRole("region", { name: "Masuk" }).boundingBox();
  expect(panelBox && cardBox).toBeTruthy();
  expect(cardBox!.x).toBeGreaterThanOrEqual(panelBox!.x + panelBox!.width);
  expect(cardBox!.width).toBeLessThanOrEqual(440);
});
