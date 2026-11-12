import { expect, test } from "@playwright/test";
import { signedInAs } from "./setup/auth-state";

// R3 on a phone: below 768 px the services list drops its column header and each row stacks: the
// picture, the name with its type and duration, then the price and the status chip, with the chevron on
// the right. Nothing scrolls sideways at 360 px, in Indonesian or in English (which runs longer).

test.describe("the admin services list at 360 px", () => {
  test.use({ ...signedInAs.admin, viewport: { width: 360, height: 780 } });

  for (const { lang, prefix, label, name, type, duration, chip } of [
    { lang: "id", prefix: "", label: "Layanan HomeKlin dan harganya", name: "Pembersihan Rutin", type: "Jenis: Seluruh rumah", duration: "Sekitar 2 jam", chip: /^(Aktif|Draf)$/ },
    { lang: "en", prefix: "/en", label: "HomeKlin’s services and their prices", name: "Regular Cleaning", type: "Type: Whole home", duration: "About 2 hours", chip: /^(Active|Draft)$/ },
  ]) {
    test(`stacks each row without sideways scroll (${lang})`, async ({ page }) => {
      await page.goto(`${prefix}/admin/services`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByTestId("services-header")).toBeHidden();

      const row = page.getByRole("list", { name: label }).getByRole("listitem").filter({ hasText: name });
      const summary = row.locator("summary");
      await expect(summary).toContainText(type);
      await expect(summary).toContainText(duration);
      await expect(summary).toContainText(/Rp\s85\.000/);
      const chipBox = await summary.getByText(chip).boundingBox();
      const nameBox = await summary.getByText(name, { exact: true }).boundingBox();
      const chevronBox = await summary.getByTestId("row-chevron").boundingBox();
      // The price and chip sit under the name; the chevron on the right, a full 44 px target.
      expect(chipBox && nameBox && chipBox.y > nameBox.y + nameBox.height - 1).toBe(true);
      expect(chevronBox && nameBox && chevronBox.x > nameBox.x).toBe(true);
      expect(chevronBox?.width).toBeGreaterThanOrEqual(44);
      // The order is not in the row on a phone; it is in the panel.
      await expect(summary.getByTestId("service-order")).toBeHidden();

      await summary.click();
      await expect(row.locator("details")).toHaveAttribute("open", "");
      await expect(row.getByTestId("panel-order")).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
