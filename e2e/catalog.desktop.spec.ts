import { expect, test } from "@playwright/test";

// T8 on a desktop screen, step 1 of ordering since D5 (mock Main): the page uses the width
// (markdown/design.md, Layout) instead of stretching the phone column: the summary sits beside the
// services, the type filter fits one row under the search, and the services sit in two columns.
test.use({ viewport: { width: 1280, height: 800 } });

test("puts the summary beside the services and the services in two columns", async ({ page }) => {
  await page.goto("/services");
  const area = await page.getByRole("combobox", { name: "Area layanan" }).boundingBox();
  const summary = await page.getByRole("form", { name: "Ringkasan" }).boundingBox();
  expect(area).not.toBeNull();
  expect(summary).not.toBeNull();
  expect(summary!.x).toBeGreaterThan(area!.x + area!.width);

  const search = await page.getByRole("searchbox", { name: "Cari layanan" }).boundingBox();
  const types = page.getByRole("group", { name: "Jenis layanan" }).getByRole("button");
  const firstType = await types.first().boundingBox();
  const lastType = await types.last().boundingBox();
  expect(firstType!.y).toBeGreaterThan(search!.y + search!.height);
  expect(Math.abs(lastType!.y - firstType!.y)).toBeLessThan(2);

  const cards = page.getByRole("list", { name: "Layanan", exact: true }).getByRole("listitem");
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
  expect(second!.x).toBeGreaterThan(first!.x + first!.width);

  // The whole card is the radio's target: a click on it chooses the service.
  const regular = cards.filter({ has: page.getByRole("heading", { name: "Pembersihan Rutin" }) });
  await regular.click();
  await expect(page.getByRole("radio", { name: "Pembersihan Rutin", exact: true })).toBeChecked();
});

test("keeps the keyboard on the area while the list follows the choice", async ({ page }) => {
  await page.goto("/services");
  const area = page.getByRole("combobox", { name: "Area layanan" });
  await area.focus();
  await area.selectOption("jakarta-pusat");
  await expect(page).toHaveURL("/services?area=jakarta-pusat");
  await expect(page.getByRole("heading", { level: 2, name: "Jam kosong di Jakarta Pusat" })).toBeVisible();
  await expect(area).toBeFocused();
});
