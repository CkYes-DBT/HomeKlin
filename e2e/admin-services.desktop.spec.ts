import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { adminClient, visitorClient } from "../tests/integration/test-project";
import { signedInAs } from "./setup/auth-state";

// T7b on a desk: admin manages HomeKlin's services and the one price list at /admin/services, and only
// admin may. Runs against the separate Supabase test project (playwright.config.ts).
// Test data: other specs read the same catalog at the same time, so this file never changes the seven
// seeded services. It adds its own, with a unique id (uji-<random>), placed last (order 999), and keeps
// it switched off except while it checks switching on; afterAll deletes what it added.

const created: string[] = [];

/** A unique, fictional service for one test. */
function testService() {
  const id = `uji-${randomUUID().slice(0, 8)}`;
  created.push(id);
  return { id, nameId: `Uji Layanan ${id.slice(4)}`, nameEn: `Test Service ${id.slice(4)}` };
}

test.afterAll(async () => {
  if (created.length > 0) await adminClient().from("services").delete().in("id", created.splice(0));
});

/** What a visitor's catalog (the customer pages' read, src/lib/catalog/catalog.ts) says about a service. */
async function visitorSees(id: string): Promise<{ price_idr: number } | undefined> {
  const { data, error } = await visitorClient().rpc("search_services", { p_query: null, p_category: null, p_area: null });
  if (error) throw new Error(`Could not read the catalog as a visitor: ${error.message}`);
  return (data as { id: string; price_idr: number }[]).find((service) => service.id === id);
}

async function fillNewService(page: Page, service: { id: string; nameId: string; nameEn: string }) {
  await page.getByLabel("ID layanan").fill(service.id);
  await page.getByLabel("Jenis layanan").selectOption({ label: "Kain & kasur" });
  await page.getByLabel("Urutan tampil").fill("999");
  await page.getByLabel("Nama (Bahasa Indonesia)").fill(service.nameId);
  await page.getByLabel("Deskripsi (Bahasa Indonesia)").fill("Layanan uji otomatis. Tidak dijual.");
  await page.getByLabel("Nama (Inggris)").fill(service.nameEn);
  await page.getByLabel("Deskripsi (Inggris)").fill("An automated test service. Not for sale.");
  await page.getByLabel("Harga (Rp)").fill("90.000");
  await page.getByLabel("Durasi (menit)").fill("90");
}

/** A service's row in the list (R3: a <details> per service inside one list). */
function rowOf(page: Page, name: string) {
  return page.getByRole("list", { name: "Layanan HomeKlin dan harganya" }).getByRole("listitem").filter({ hasText: name });
}

/** Sets a service's Aktif checkbox on its edit page and saves (R4 and R6 move this into the row's panel). */
async function setActive(page: Page, service: { id: string }, active: boolean) {
  await page.goto(`/admin/services/edit?id=${service.id}`);
  await page.getByLabel("Aktif: tampil di katalog pelanggan").setChecked(active);
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page).toHaveURL(`/admin/services?saved=${service.id}`);
}

test.describe("an admin", () => {
  test.use(signedInAs.admin);

  test("sees every service with its photo, type, duration, price, state and order", async ({ page }) => {
    await page.goto("/admin/services");
    await expect(page.getByRole("heading", { level: 1, name: "Layanan dan harga" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tambah layanan" })).toHaveAttribute("href", "/admin/services/new");

    // The column header row is for the eye only (aria-hidden): each row says its own values.
    const header = page.getByTestId("services-header");
    await expect(header).toHaveAttribute("aria-hidden", "true");
    await expect(header).toHaveText(/Foto\s*Layanan\s*Durasi\s*Harga\s*Status\s*Urutan\s*Ubah/);
    for (const column of ["Foto", "Layanan", "Durasi", "Harga", "Status", "Urutan"]) {
      await expect(header.getByText(column, { exact: true })).toBeVisible();
    }

    const row = rowOf(page, "Pembersihan Rutin");
    const summary = row.locator("summary");
    await expect(summary).toContainText("Pembersihan Rutin");
    await expect(summary).toContainText("Jenis: Seluruh rumah");
    await expect(summary).toContainText("Sekitar 2 jam");
    await expect(summary).toContainText(/Rp\s85\.000/);
    // The state is a word with an icon, never the colour alone.
    await expect(summary.getByText(/^(Aktif|Draf)$/)).toBeVisible();
    const { data } = await adminClient().from("services").select("sort_order").eq("id", "regular").single();
    await expect(summary.getByTestId("service-order")).toHaveText(`Urutan ${data?.sort_order}`);
    // What the row does comes first in its name, then the values it shows.
    // A 68 px row, as in the mock.
    expect((await summary.boundingBox())?.height).toBeCloseTo(68, 0);
    await expect(summary).toHaveAccessibleName(/^Ubah layanan Pembersihan Rutin Jenis: Seluruh rumah Sekitar 2 jam Rp\s85\.000 (Aktif|Draf) Urutan \d+$/);
  });

  test("opens a row by click and by keyboard; every row starts closed", async ({ page }) => {
    await page.goto("/admin/services");
    const details = page.getByRole("list", { name: "Layanan HomeKlin dan harganya" }).locator("details");
    await expect(details.first()).toBeVisible();
    // All rows start closed.
    await expect(page.locator("details[open]")).toHaveCount(0);

    const row = rowOf(page, "Pembersihan Rutin").locator("details");
    const summary = row.locator("summary");
    const chevron = summary.getByTestId("row-chevron");
    await expect(chevron).toHaveCSS("rotate", "none");

    await summary.click();
    await expect(row).toHaveAttribute("open", "");
    // Open, the chevron points up and the panel shows the details and the way to change them.
    await expect(chevron).toHaveCSS("rotate", "180deg");
    await expect(row.getByText("Regular Cleaning")).toBeVisible();
    await expect(row.getByRole("link", { name: "Ubah Pembersihan Rutin" })).toHaveAttribute(
      "href",
      "/admin/services/edit?id=regular",
    );
    await summary.click();
    await expect(row).not.toHaveAttribute("open");

    // By keyboard: the summary takes focus with a visible ring, Enter opens, Space closes.
    // Shift+Tab then Tab lands on the summary by keyboard, which is what :focus-visible answers to.
    await summary.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(summary).toBeFocused();
    await expect(summary).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(row).toHaveAttribute("open", "");
    await page.keyboard.press("Space");
    await expect(row).not.toHaveAttribute("open");
  });

  test("adds a service, changes its price, and switches it on and off for customers", async ({ page }) => {
    const service = testService();

    await test.step("adds the service, switched off", async () => {
      await page.goto("/admin/services");
      await page.getByRole("link", { name: "Tambah layanan" }).click();
      await expect(page).toHaveURL("/admin/services/new");
      await expect(page.getByRole("heading", { level: 1, name: "Tambah layanan" })).toBeVisible();
      await expect(page.getByLabel("Aktif: tampil di katalog pelanggan")).not.toBeChecked();

      await fillNewService(page, service);
      await page.getByRole("button", { name: "Simpan layanan" }).click();

      await expect(page).toHaveURL(`/admin/services?created=${service.id}`);
      await expect(page.getByRole("status").filter({ hasText: `${service.nameId} ditambahkan.` })).toContainText(
        "belum tampil di katalog pelanggan",
      );
      const row = rowOf(page, service.nameId);
      await expect(row).toContainText(service.nameEn);
      await expect(row.locator("summary")).toContainText("Sekitar 1 jam 30 menit");
      // A new service starts as a draft, said in a word on its chip.
      await expect(row.getByText("Draf", { exact: true })).toBeVisible();

      const { data } = await adminClient().from("services").select("price_idr, is_active, category").eq("id", service.id).single();
      expect(data).toEqual({ price_idr: 90000, is_active: false, category: "fabrics" });
      expect(await visitorSees(service.id)).toBeUndefined();
    });

    await test.step("changes the price", async () => {
      // The way to the edit page sits in the row's panel (R4 puts the form there).
      await rowOf(page, service.nameId).locator("summary").click();
      await page.getByRole("link", { name: `Ubah ${service.nameId}` }).click();
      await expect(page).toHaveURL(`/admin/services/edit?id=${service.id}`);
      await expect(page.getByRole("heading", { level: 1, name: "Ubah layanan" })).toBeVisible();
      // The id is shown, not editable.
      const id = page.getByLabel("ID layanan");
      await expect(id).toHaveValue(service.id);
      await expect(id).not.toBeEditable();

      const price = page.getByLabel("Harga (Rp)");
      await expect(price).toHaveValue("90000");
      await price.fill("95.000");
      await page.getByRole("button", { name: "Simpan perubahan" }).click();

      await expect(page).toHaveURL(`/admin/services?saved=${service.id}`);
      await expect(page.getByRole("status").filter({ hasText: `Perubahan pada ${service.nameId} disimpan.` })).toBeVisible();
      await expect(rowOf(page, service.nameId).locator("summary")).toContainText(/Rp\s95\.000/);
    });

    // The row's switch is gone (R3, user decision a): the Aktif checkbox on the edit page switches a
    // service on and off until R4 and R6 bring it into the row's panel. The chip shows the state.
    await test.step("switches it on: visitors read the new price in the catalog", async () => {
      await setActive(page, service, true);
      await expect(page.getByRole("status").filter({ hasText: `Perubahan pada ${service.nameId} disimpan.` })).toContainText(
        /Pelanggan melihat layanan ini di katalog dengan harga Rp\s95\.000/,
      );
      await expect(rowOf(page, service.nameId).getByText("Aktif", { exact: true })).toBeVisible();
      expect(await visitorSees(service.id)).toMatchObject({ price_idr: 95000 });
    });

    await test.step("switches it off again: visitors no longer see it", async () => {
      await setActive(page, service, false);
      await expect(rowOf(page, service.nameId).getByText("Draf", { exact: true })).toBeVisible();
      expect(await visitorSees(service.id)).toBeUndefined();

      // After a reload the list still shows what is stored.
      await page.goto("/admin/services");
      await expect(rowOf(page, service.nameId).getByText("Draf", { exact: true })).toBeVisible();
      await expect(rowOf(page, service.nameId).getByText("Aktif", { exact: true })).toHaveCount(0);
    });
  });

  test("is told what to fix, per field and in the page's language, and nothing is saved", async ({ page }) => {
    await page.goto("/admin/services/new");
    await page.getByRole("button", { name: "Simpan layanan" }).click();

    await expect(page.getByLabel("ID layanan")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("ID layanan")).toBeFocused();
    await expect(page.getByText("Masukkan ID layanan.")).toBeVisible();
    await expect(page.getByText("Pilih jenis layanan.")).toBeVisible();
    await expect(page.getByText("Masukkan harga.")).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Periksa 8 kolom yang ditandai.");
    await expect(page).toHaveURL("/admin/services/new");

    await page.goto("/en/admin/services/new");
    await page.getByLabel("Service ID").fill("Bad ID!");
    await page.getByLabel("Price (Rp)").fill("85,5");
    await page.getByRole("button", { name: "Save service" }).click();
    await expect(page.getByText("Use only lowercase letters, numbers and hyphens")).toBeVisible();
    await expect(page.getByText("Write the price in whole rupiah, for example 85000 or 85.000.")).toBeVisible();
    // What was typed stays in the form.
    await expect(page.getByLabel("Price (Rp)")).toHaveValue("85,5");
  });

  test("cannot take an id that is already in use", async ({ page }) => {
    const service = testService();
    await page.goto("/admin/services/new");
    await fillNewService(page, { ...service, id: "regular" });
    await page.getByRole("button", { name: "Simpan layanan" }).click();

    await expect(page.getByText("ID ini sudah dipakai layanan lain. Pilih ID lain.")).toBeVisible();
    await expect(page).toHaveURL("/admin/services/new");
    // The seeded service is unchanged.
    const { data } = await adminClient().from("services").select("name_id").eq("id", "regular").single();
    expect(data?.name_id).toBe("Pembersihan Rutin");
  });

  test("is told plainly when a service does not exist", async ({ page }) => {
    await page.goto("/admin/services/edit?id=tidak-ada-layanan-ini");
    await expect(page.getByRole("heading", { name: "Layanan tidak ditemukan" })).toBeVisible();
    await page.getByRole("link", { name: "Kembali ke daftar layanan" }).click();
    await expect(page).toHaveURL("/admin/services");
  });
});

test.describe("a signed-in customer", () => {
  test.use(signedInAs.customer);

  test("is sent to their own home, and never gets the admin's list or form", async ({ page }) => {
    const html = await (await page.request.get("/admin/services")).text();
    expect(html).not.toContain("Tambah layanan");
    const form = await (await page.request.get("/admin/services/new")).text();
    expect(form).not.toContain("Simpan layanan");

    await page.goto("/admin/services");
    await expect(page).toHaveURL("/home");
  });
});
