import { expect, test, type Locator, type Page } from "@playwright/test";
import { adminClient } from "../tests/integration/test-project";
import { createJobWorld, jakartaClock, sessionOf, type JobWorld } from "./job-test-data";
import { signedInAs } from "./setup/auth-state";

// T18 on a desk: the agency sees where each job stands (on /agency/orders, since D2 the open jobs, and
// /agency/past, the finished ones; each job's own page has the times): no cleaner yet, a cleaner
// assigned, checked in at a time, finished at a time, and can assign a cleaner only until check-in
// (T28, covered in full by e2e/agency-back-office.desktop.spec.ts). Admin sees finished jobs, read-only
// and with the agency's name, on /admin/recordings (the dashboard's list of today's jobs went with the
// dashboard, R2b). The agency sees only the jobs routed to it. The spec makes its own agency (serving
// Jakarta Timur, with one cleaner) and writes its own paid jobs a few minutes from now
// (e2e/job-test-data.ts), so they are today's jobs in Jakarta.

test.describe.configure({ mode: "serial", timeout: 90_000 });

const agencyName = "Uji Agensi Status";
const address = {
  unassigned: "Jl. Uji Tanpa Petugas No. 1, Jakarta Timur",
  assigned: "Jl. Uji Ditugaskan No. 2, Jakarta Timur",
  started: "Jl. Uji Sedang Dikerjakan No. 3, Jakarta Timur",
  finished: "Jl. Uji Selesai No. 4, Jakarta Timur",
};

let world: JobWorld;
let agencySession: Awaited<ReturnType<typeof sessionOf>>;
const jobs: Record<string, string> = {};
const times: Record<string, string> = {};

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  world = await createJobWorld("t18d");
  const agency = await world.agency(agencyName);
  const cleaner = await world.cleaner(agency.id, "Uji Petugas Meja");
  jobs.unassigned = (await world.job({ agencyId: agency.id, cleaner: null, startsIn: 3, address: address.unassigned })).id;
  jobs.assigned = (await world.job({ agencyId: agency.id, cleaner, startsIn: 4, address: address.assigned })).id;
  jobs.started = (await world.job({ agencyId: agency.id, cleaner, startsIn: 1, address: address.started, checkedInMinutesAgo: 2 })).id;
  jobs.finished = (await world.job({ agencyId: agency.id, cleaner, startsIn: 2, address: address.finished, completedMinutesAgo: 1 })).id;
  const { data } = await adminClient()
    .from("orders")
    .select("id, checked_in_at, completed_at")
    .in("id", [jobs.started, jobs.finished]);
  for (const row of (data ?? []) as { id: string; checked_in_at: string; completed_at: string | null }[]) {
    if (row.id === jobs.started) times.checkedIn = jakartaClock(row.checked_in_at);
    if (row.id === jobs.finished && row.completed_at) times.completed = jakartaClock(row.completed_at);
  }
  agencySession = await sessionOf(browser, baseURL, agency.user);
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await world?.cleanup();
});

const rowOf = (table: Locator, text: string) => table.getByRole("row").filter({ hasText: text });

async function expectReadOnly(page: Page, table: Locator) {
  await expect(table.getByRole("button")).toHaveCount(0);
  await expect(table.getByRole("combobox")).toHaveCount(0);
  await expect(page.locator("main form")).toHaveCount(0);
}

test.describe("the agency", () => {
  test.use({ storageState: async ({}, provide) => provide(agencySession) });

  test("sees each of its jobs with the cleaner and where it stands; only jobs not started can be assigned", async ({ page }) => {
    // Since D2 the jobs not finished are "Pekerjaan masuk" and the finished ones "Pesanan selesai".
    await page.goto("/agency/orders");
    const table = page.getByRole("table", { name: "Pekerjaan masuk agensi Anda" });
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(4); // the header and three open jobs: only its own

    await expect(rowOf(table, address.unassigned)).toContainText("Perlu petugas");
    await expect(rowOf(table, address.assigned)).toContainText("Uji Petugas Meja");
    await expect(rowOf(table, address.assigned)).toContainText("Ditugaskan");
    await expect(rowOf(table, address.started)).toContainText("Berlangsung");
    await expect(rowOf(table, address.finished)).toHaveCount(0);
    // T28: a cleaner can be assigned (or changed) until check-in; a job that has started is read-only.
    await expect(rowOf(table, address.unassigned).getByRole("button", { name: "Tugaskan" })).toBeVisible();
    await rowOf(table, address.assigned).getByRole("button", { name: "Ganti petugas Uji Petugas Meja" }).click();
    await expect(rowOf(table, address.assigned).getByRole("combobox")).toHaveValue(/.+/); // its cleaner is chosen
    await expect(rowOf(table, address.started).getByRole("combobox")).toHaveCount(0);
    await expect(rowOf(table, address.started).getByRole("button")).toHaveCount(0);

    // The check-in and finish times are on each job's own page.
    await page.goto(`/agency/orders/job?order=${jobs.started}`);
    await expect(page.getByRole("region", { name: "Status pekerjaan" })).toContainText(times.checkedIn);
    await expect(page.getByRole("main").getByRole("combobox")).toHaveCount(0);

    await page.goto("/agency/past");
    const past = page.getByRole("table", { name: "Pesanan selesai agensi Anda" });
    await expect(rowOf(past, address.finished)).toContainText("Pembersihan Rutin");
    await expect(rowOf(past, address.finished).getByRole("button")).toHaveCount(0);
    await page.goto(`/agency/past/job?order=${jobs.finished}`);
    await expect(page.getByRole("region", { name: "Status pekerjaan" })).toContainText(times.completed);
  });

  test("reads in English", async ({ page }) => {
    await page.goto("/en/agency/orders");
    const table = page.getByRole("table", { name: "Your agency’s incoming jobs" });
    await expect(rowOf(table, address.unassigned)).toContainText("Needs a cleaner");
    await expect(rowOf(table, address.started)).toContainText("In progress");
    await page.goto(`/en/agency/past/job?order=${jobs.finished}`);
    await expect(page.getByRole("region", { name: "Job status" })).toContainText(times.completed);
  });
});

test.describe("admin", () => {
  test.use(signedInAs.admin);

  // The admin dashboard and its "Pekerjaan hari ini" list are gone (R2b, user 2026-11-12). Admin now
  // meets a job once it is live (live monitoring, e2e/admin-console.desktop.spec.ts) and once it is
  // finished, on the recordings page: still read-only, still with the agency and the cleaner.
  test("sees a finished job with the agency, the cleaner and the finish time, read-only", async ({ page }) => {
    await page.goto("/admin/recordings");
    const table = page.getByRole("table", { name: "Pekerjaan selesai" });
    await expect(table).toBeVisible();
    const row = (key: string) => table.locator(`tr[data-job="${jobs[key]}"]`);
    await expect(row("finished")).toContainText(agencyName);
    await expect(row("finished")).toContainText("Uji Petugas Meja");
    await expect(row("finished")).toContainText(`${times.completed} WIB`);
    await expect(row("finished")).toContainText("Tidak ada rekaman");
    // Jobs that have not finished are not on this page.
    for (const key of ["unassigned", "assigned", "started"]) await expect(row(key)).toHaveCount(0);
    await expectReadOnly(page, table);
  });
});
