import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { adminClient } from "../tests/integration/test-project";
import { signedInAs } from "./setup/auth-state";

// T7b and T8 together: what admin changes at /admin/services is what customers see on /services, at
// once. The customer pages cache the catalog under catalogCacheTag and admin's Server Actions expire it
// with updateTag (src/lib/catalog/cached.ts, src/lib/catalog/admin-actions.ts), so the change must show
// on the very next visit. Two browsers: a signed-in admin and a visitor who is not signed in.
// Test data: one service of its own (uji-<random>, order 999); the seeded services are never touched,
// and afterAll deletes it.

const service = (() => {
  const token = randomUUID().slice(0, 8);
  return { id: `uji-${token}`, token, nameId: `Uji Katalog ${token}`, nameEn: `Test Catalog ${token}` };
})();

test.afterAll(async () => {
  await adminClient().from("services").delete().eq("id", service.id);
});

/** The visitor's /services for this test's keyword, once the streamed catalog has arrived. */
async function visitorCatalog(page: Page) {
  await page.goto(`/services?q=${service.token}`);
  await expect(page.getByText("Memuat layanan…")).toHaveCount(0);
  return page.getByRole("main");
}

/** This test's service in admin's list. */
function rowOf(page: Page) {
  return page.getByRole("list", { name: "Layanan HomeKlin dan harganya" }).getByRole("listitem").filter({ hasText: service.nameId });
}

/** Opens this test's row; its panel holds the edit form (R4). */
async function openRow(page: Page) {
  const details = rowOf(page).locator("details");
  await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
  return details;
}

test("a price admin saves is the price customers see on their next visit", async ({ browser }) => {
  const adminContext = await browser.newContext({ storageState: signedInAs.admin.storageState });
  const visitorContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const visitor = await visitorContext.newPage();

  await test.step("admin adds the service in the list's create panel, switched on, at Rp 90.000", async () => {
    await admin.goto("/admin/services?new");
    const panel = admin.getByTestId("create-panel");
    await panel.getByLabel("ID layanan").fill(service.id);
    await panel.getByLabel("Jenis", { exact: true }).selectOption({ label: "Kain & kasur" });
    await panel.getByLabel("Urutan tampil").fill("999");
    await panel.getByLabel("Nama layanan (Bahasa Indonesia)").fill(service.nameId);
    await panel.getByLabel("Deskripsi singkat (Bahasa Indonesia)").fill("Layanan uji otomatis. Tidak dijual.");
    await panel.getByLabel("Nama layanan (Inggris)").fill(service.nameEn);
    await panel.getByLabel("Deskripsi singkat (Inggris)").fill("An automated test service. Not for sale.");
    await panel.getByLabel("Harga penuh (Rp)").fill("90.000");
    await panel.getByLabel("Durasi (menit)").fill("90");
    await panel.getByLabel("Tampilkan di situs pelanggan").check();
    await panel.getByRole("button", { name: "Simpan layanan" }).click();
    await expect(admin).toHaveURL(`/admin/services?created=${service.id}`);
  });

  await test.step("the visitor finds it with its price", async () => {
    const catalog = await visitorCatalog(visitor);
    await expect(catalog.getByText(service.nameId)).toBeVisible();
    await expect(catalog).toContainText(/Rp\s90\.000/);
  });

  await test.step("admin changes the price in the row's panel; the visitor sees the new one on the next visit", async () => {
    const panel = await openRow(admin);
    await panel.getByLabel("Harga penuh (Rp)").fill("95.000");
    await panel.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(admin).toHaveURL(`/admin/services?saved=${service.id}`);

    const catalog = await visitorCatalog(visitor);
    await expect(catalog).toContainText(/Rp\s95\.000/);
    await expect(catalog).not.toContainText(/Rp\s90\.000/);
  });

  await test.step("admin switches it off; the visitor no longer finds it", async () => {
    // The row's switch is gone (R3): the panel's "Tampilkan di situs pelanggan" checkbox switches it
    // off (R4). The list comes back only after the change is stored and the cache tag expired; only
    // then does the visitor look.
    const panel = await openRow(admin);
    await panel.getByLabel("Tampilkan di situs pelanggan").uncheck();
    await panel.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(admin).toHaveURL(`/admin/services?saved=${service.id}`);
    await expect(rowOf(admin).getByText("Draf", { exact: true })).toBeVisible();

    const catalog = await visitorCatalog(visitor);
    await expect(catalog.getByRole("heading", { name: "Tidak ada layanan yang cocok" })).toBeVisible();
    await expect(catalog.getByText(service.nameId)).toHaveCount(0);
  });

  await adminContext.close();
  await visitorContext.close();
});
