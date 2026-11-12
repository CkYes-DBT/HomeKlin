import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { adminClient, visitorClient } from "../tests/integration/test-project";
import { signedInAs } from "./setup/auth-state";

// T7b on a desk: admin manages HomeKlin's services and the one price list at /admin/services, and only
// admin may. The edit and create forms sit in the list's panels (R4, R5); the old /new and /edit pages
// are gone and their addresses lead back to the list (R6). Runs against the separate Supabase test project (playwright.config.ts).
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

/** Fills the "Layanan baru" create panel (R5). */
async function fillNewService(scope: Page | Locator, service: { id: string; nameId: string; nameEn: string }) {
  await scope.getByLabel("ID layanan").fill(service.id);
  await scope.getByLabel("Jenis", { exact: true }).selectOption({ label: "Kain & kasur" });
  await scope.getByLabel("Urutan tampil").fill("999");
  await scope.getByLabel("Nama layanan (Bahasa Indonesia)").fill(service.nameId);
  await scope.getByLabel("Deskripsi singkat (Bahasa Indonesia)").fill("Layanan uji otomatis. Tidak dijual.");
  await scope.getByLabel("Nama layanan (Inggris)").fill(service.nameEn);
  await scope.getByLabel("Deskripsi singkat (Inggris)").fill("An automated test service. Not for sale.");
  await scope.getByLabel("Harga penuh (Rp)").fill("90.000");
  await scope.getByLabel("Durasi (menit)").fill("90");
}

/** The "Layanan baru" panel at the top of the list (R5). */
function createPanel(page: Page) {
  return page.getByTestId("create-panel");
}

/** A service's row in the list (R3: a <details> per service inside one list). */
function rowOf(page: Page, name: string) {
  return page.getByRole("list", { name: "Layanan HomeKlin dan harganya" }).getByRole("listitem").filter({ hasText: name });
}

/** Opens a service's row and returns its panel (R4: the edit form sits in the row). */
async function openRow(page: Page, name: string) {
  const details = rowOf(page, name).locator("details");
  await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
  return details;
}

/** Ticks or clears a service's "Tampilkan di situs pelanggan" in its row's panel and saves (R4). */
async function setActive(page: Page, service: { id: string; nameId: string }, active: boolean) {
  const panel = await openRow(page, service.nameId);
  await panel.getByLabel("Tampilkan di situs pelanggan").setChecked(active);
  await panel.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page).toHaveURL(`/admin/services?saved=${service.id}`);
}

test.describe("an admin", () => {
  test.use(signedInAs.admin);

  test("sees every service with its photo, type, duration, price, state and order", async ({ page }) => {
    await page.goto("/admin/services");
    await expect(page.getByRole("heading", { level: 1, name: "Layanan dan harga" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tambah layanan" })).toHaveAttribute("href", "/admin/services?new");

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
    // Open, the chevron points up and the panel holds the service's edit form (R4), not a link away.
    await expect(chevron).toHaveCSS("rotate", "180deg");
    await expect(row.getByLabel("Nama layanan (Inggris)")).toHaveValue("Regular Cleaning");
    await expect(row.getByRole("button", { name: "Simpan perubahan" })).toBeVisible();
    await expect(row.locator('a[href*="/admin/services/edit"]')).toHaveCount(0);
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

    await test.step("adds the service in place, switched off", async () => {
      await page.goto("/admin/services");
      await expect(createPanel(page)).toHaveCount(0);
      await page.getByRole("link", { name: "Tambah layanan" }).click();
      await expect(page).toHaveURL("/admin/services?new");
      // The create panel opens at the top of the list, with the cursor in its first field.
      const panel = createPanel(page);
      await expect(panel).toHaveAttribute("open", "");
      await expect(panel.getByRole("heading", { name: "Layanan baru" })).toBeVisible();
      await expect(panel.getByLabel("Nama layanan (Bahasa Indonesia)")).toBeFocused();
      await expect(panel.getByLabel("ID layanan")).toBeEditable();
      await expect(panel.getByLabel("Tampilkan di situs pelanggan")).not.toBeChecked();
      await expect(panel.getByLabel("Jenis", { exact: true })).toHaveValue("");
      const panelBox = await panel.boundingBox();
      const firstRowBox = await rowOf(page, "Pembersihan Rutin").boundingBox();
      expect(panelBox && firstRowBox && panelBox.y < firstRowBox.y).toBe(true);

      await fillNewService(panel, service);
      await panel.getByRole("button", { name: "Simpan layanan" }).click();

      await expect(page).toHaveURL(`/admin/services?created=${service.id}`);
      await expect(page.getByRole("status").filter({ hasText: `${service.nameId} ditambahkan.` })).toContainText(
        "belum tampil di katalog pelanggan",
      );
      await expect(createPanel(page)).toHaveCount(0);
      const row = rowOf(page, service.nameId);
      await expect(row.locator("summary")).toContainText("Sekitar 1 jam 30 menit");
      // A new service starts as a draft, said in a word on its chip.
      await expect(row.getByText("Draf", { exact: true })).toBeVisible();

      const { data } = await adminClient().from("services").select("price_idr, is_active, category").eq("id", service.id).single();
      expect(data).toEqual({ price_idr: 90000, is_active: false, category: "fabrics" });
      expect(await visitorSees(service.id)).toBeUndefined();
    });

    await test.step("changes the price in place", async () => {
      const panel = await openRow(page, service.nameId);
      await expect(panel.getByLabel("Nama layanan (Inggris)")).toHaveValue(service.nameEn);
      // The id is shown, not editable.
      const id = panel.getByLabel("ID layanan");
      await expect(id).toHaveValue(service.id);
      await expect(id).not.toBeEditable();

      const price = panel.getByLabel("Harga penuh (Rp)");
      await expect(price).toHaveValue("90000");
      await price.fill("95.000");
      await panel.getByRole("button", { name: "Simpan perubahan" }).click();

      await expect(page).toHaveURL(`/admin/services?saved=${service.id}`);
      await expect(page.getByRole("status").filter({ hasText: `Perubahan pada ${service.nameId} disimpan.` })).toBeVisible();
      await expect(rowOf(page, service.nameId).locator("summary")).toContainText(/Rp\s95\.000/);
      // A saved panel closes, as it does when the page loads anew without JavaScript.
      await expect(rowOf(page, service.nameId).locator("details")).not.toHaveAttribute("open");
    });

    // The row's switch is gone (R3, user decision a): the panel's "Tampilkan di situs pelanggan"
    // checkbox switches a service on and off (R4). The chip shows the state.
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

  test("Batal closes the panel and puts back the saved values; nothing is saved", async ({ page }) => {
    await page.goto("/admin/services");
    const panel = await openRow(page, "Pembersihan Rutin");
    const price = panel.getByLabel("Harga penuh (Rp)");
    const saved = await price.inputValue();
    await price.fill("1");
    await panel.getByLabel("Nama layanan (Bahasa Indonesia)").fill("Nama lain");

    await panel.getByRole("button", { name: "Batal" }).click();
    await expect(panel).not.toHaveAttribute("open");
    // The cursor goes back to the row, so a keyboard user carries on from there.
    await expect(panel.locator("summary")).toBeFocused();

    await panel.locator("summary").click();
    await expect(panel.getByLabel("Harga penuh (Rp)")).toHaveValue(saved);
    await expect(panel.getByLabel("Nama layanan (Bahasa Indonesia)")).toHaveValue("Pembersihan Rutin");
    const { data } = await adminClient().from("services").select("name_id, price_idr").eq("id", "regular").single();
    expect(String(data?.price_idr)).toBe(saved);
  });

  test("a failed save keeps the panel open with the message per field; Batal clears it", async ({ page }) => {
    await page.goto("/admin/services");
    const panel = await openRow(page, "Pembersihan Rutin");
    await panel.getByLabel("Nama layanan (Bahasa Indonesia)").fill("");
    await panel.getByLabel("Harga penuh (Rp)").fill("85,5");
    await panel.getByRole("button", { name: "Simpan perubahan" }).click();

    const name = panel.getByLabel("Nama layanan (Bahasa Indonesia)");
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toBeFocused();
    await expect(panel).toHaveAttribute("open", "");
    await expect(panel.getByText("Masukkan nama layanan.")).toBeVisible();
    await expect(panel.getByText("Tulis harga dalam rupiah penuh, misalnya 85000 atau 85.000.")).toBeVisible();
    await expect(panel.getByRole("alert")).toContainText("Periksa 2 kolom yang ditandai.");
    // What was typed stays in the form, and nothing was saved.
    await expect(panel.getByLabel("Harga penuh (Rp)")).toHaveValue("85,5");
    await expect(page).toHaveURL("/admin/services");
    const { data } = await adminClient().from("services").select("name_id").eq("id", "regular").single();
    expect(data?.name_id).toBe("Pembersihan Rutin");

    // Batal closes it and the next opening starts clean, with the saved values and no messages.
    await panel.getByRole("button", { name: "Batal" }).click();
    await expect(panel).not.toHaveAttribute("open");
    await panel.locator("summary").click();
    await expect(panel.getByLabel("Nama layanan (Bahasa Indonesia)")).toHaveValue("Pembersihan Rutin");
    await expect(panel.getByText("Masukkan nama layanan.")).toHaveCount(0);
  });

  test("the create panel shows what to fix and stays open; its Batal goes back to the list", async ({ page }) => {
    await page.goto("/admin/services?new");
    const panel = createPanel(page);
    await expect(panel.getByLabel("Nama layanan (Bahasa Indonesia)")).toBeFocused();
    await panel.getByRole("button", { name: "Simpan layanan" }).click();
    await expect(panel.getByLabel("ID layanan")).toHaveAttribute("aria-invalid", "true");
    await expect(panel.getByText("Masukkan ID layanan.")).toBeVisible();
    // The cursor goes to the first field to fix, in the panel's order: the Indonesian name.
    await expect(panel.getByLabel("Nama layanan (Bahasa Indonesia)")).toBeFocused();
    await expect(panel.getByText("Pilih jenis layanan.")).toBeVisible();
    await expect(panel.getByRole("alert")).toContainText("Periksa 8 kolom yang ditandai.");
    await expect(panel).toHaveAttribute("open", "");

    // Its Batal is a plain link back to the list, which closes the panel and drops what was typed.
    const cancel = panel.getByRole("link", { name: "Batal" });
    await expect(cancel).toHaveAttribute("href", "/admin/services");
    await cancel.click();
    await expect(page).toHaveURL("/admin/services");
    await expect(createPanel(page)).toHaveCount(0);
  });

  test("is told what to fix, per field and in the page's language, and nothing is saved", async ({ page }) => {
    await page.goto("/admin/services?new");
    const panel = createPanel(page);
    // The cursor in the first field says the page's script runs (saving needs it, R5).
    await expect(panel.getByLabel("Nama layanan (Bahasa Indonesia)")).toBeFocused();
    await panel.getByRole("button", { name: "Simpan layanan" }).click();

    await expect(panel.getByLabel("ID layanan")).toHaveAttribute("aria-invalid", "true");
    // The cursor goes to the first field to fix, in the panel's order: the Indonesian name.
    await expect(panel.getByLabel("Nama layanan (Bahasa Indonesia)")).toBeFocused();
    await expect(panel.getByText("Masukkan ID layanan.")).toBeVisible();
    await expect(panel.getByText("Pilih jenis layanan.")).toBeVisible();
    await expect(panel.getByText("Masukkan harga.")).toBeVisible();
    await expect(panel.getByRole("alert")).toContainText("Periksa 8 kolom yang ditandai.");
    await expect(page).toHaveURL("/admin/services?new");

    await page.goto("/en/admin/services?new");
    const english = createPanel(page);
    await expect(english.getByLabel("Service name (Indonesian)")).toBeFocused();
    await english.getByLabel("Service ID").fill("Bad ID!");
    await english.getByLabel("Full price (Rp)").fill("85,5");
    await english.getByRole("button", { name: "Save service" }).click();
    await expect(english.getByText("Use only lowercase letters, numbers and hyphens")).toBeVisible();
    await expect(english.getByText("Write the price in whole rupiah, for example 85000 or 85.000.")).toBeVisible();
    // What was typed stays in the form, and the panel stays open.
    await expect(english.getByLabel("Full price (Rp)")).toHaveValue("85,5");
    await expect(english).toHaveAttribute("open", "");
  });

  test("cannot take an id that is already in use", async ({ page }) => {
    const service = testService();
    await page.goto("/admin/services?new");
    const panel = createPanel(page);
    await expect(panel.getByLabel("Nama layanan (Bahasa Indonesia)")).toBeFocused();
    await fillNewService(panel, { ...service, id: "regular" });
    await panel.getByRole("button", { name: "Simpan layanan" }).click();

    await expect(panel.getByText("ID ini sudah dipakai layanan lain. Pilih ID lain.")).toBeVisible();
    await expect(panel.getByLabel("ID layanan")).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL("/admin/services?new");
    // The seeded service is unchanged.
    const { data } = await adminClient().from("services").select("name_id").eq("id", "regular").single();
    expect(data?.name_id).toBe("Pembersihan Rutin");
  });

  // R6: the pages of their own are gone. A bookmark of one, even for a service that does not exist,
  // leads to the list in the same language, never to a dead end.
  test("an old address to add or change a service leads to the list, in the same language", async ({ page }) => {
    // Indonesian first: opening an English page remembers English (the language cookie), after which
    // an address without /en opens in English too.
    await page.goto("/admin/services/edit?id=tidak-ada-layanan-ini");
    await expect(page).toHaveURL("/admin/services");
    await expect(page.getByRole("heading", { level: 1, name: "Layanan dan harga" })).toBeVisible();
    await expect(rowOf(page, "Pembersihan Rutin")).toBeVisible();

    // The old "add" page opens the create panel instead.
    await page.goto("/admin/services/new");
    await expect(page).toHaveURL("/admin/services?new");
    await expect(createPanel(page)).toHaveAttribute("open", "");

    await page.goto("/en/admin/services/edit?id=regular");
    await expect(page).toHaveURL("/en/admin/services");
    await expect(page.getByRole("heading", { level: 1, name: "Services and prices" })).toBeVisible();

    await page.goto("/en/admin/services/new");
    await expect(page).toHaveURL("/en/admin/services?new");
    await expect(createPanel(page).getByRole("button", { name: "Save service" })).toBeVisible();
  });
});

test.describe("a signed-in customer", () => {
  test.use(signedInAs.customer);

  test("is sent to their own home, and never gets the admin's list or form", async ({ page }) => {
    const html = await (await page.request.get("/admin/services")).text();
    expect(html).not.toContain("Tambah layanan");
    const form = await (await page.request.get("/admin/services?new")).text();
    expect(form).not.toContain("Simpan layanan");
    expect(form).not.toContain("Layanan baru");

    await page.goto("/admin/services");
    await expect(page).toHaveURL("/home");
    // The old address to add a service checks the role before it sends anyone on (R6).
    await page.goto("/admin/services/new");
    await expect(page).toHaveURL("/home");
  });
});
