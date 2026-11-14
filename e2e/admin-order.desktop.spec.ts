import { expect, test, type Page } from "@playwright/test";
import { adminClient } from "../tests/integration/test-project";
import { jakartaClock } from "./job-test-data";
import { createMonitorWorld, type MonitorWorld } from "./monitor-test-data";
import { signedInAs } from "./setup/auth-state";

// D1: the admin order detail page after the user's mocks "Admin-Order" and "Admin-Order-Issue", at
// /admin/orders/<order number>. The spec makes its own agency, cleaners, jobs and streams (the monitor
// world), one finished job and one help chat about the live order, and removes them at the end (the
// chat goes with the world's customer).

test.describe.configure({ mode: "serial", timeout: 120_000 });

let data: MonitorWorld;
let finishedCode: string;
const question = "Uji pertanyaan tentang pesanan ini dari pelanggan";

test.beforeAll(async () => {
  test.setTimeout(180_000);
  data = await createMonitorWorld("d1o");
  const admin = adminClient();
  const cleaner = await data.world.cleaner(data.agencyId, "Uji Petugas Detail Selesai");
  const job = await data.world.job({ agencyId: data.agencyId, cleaner, startsIn: -200, address: "Jl. Uji Detail Selesai", completedMinutesAgo: 20 });
  const { data: row, error: codeError } = await admin.from("orders").select("code").eq("id", job.id).single<{ code: string }>();
  if (codeError || !row) throw new Error(`Could not read the order number: ${codeError?.message}`);
  finishedCode = row.code;
  // As open_ticket writes it: the ticket, and the question as its first message.
  const { data: ticket, error } = await admin
    .from("support_tickets")
    .insert({ customer_id: data.world.customer.id, order_id: data.live.active.id, question, urgency: "urgent" })
    .select("id")
    .single<{ id: string }>();
  if (error || !ticket) throw new Error(`Could not set up the help chat: ${error?.message}`);
  const { error: messageError } = await admin.from("ticket_messages").insert({ ticket_id: ticket.id, from_admin: false, body: question });
  if (messageError) throw new Error(`Could not set up the first message: ${messageError.message}`);
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await data?.cleanup();
});

test.use(signedInAs.admin);

const card = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test("a live order shows its video, facts, people, payment and status steps", async ({ page }) => {
  const job = data.live.active;
  await page.goto(`/admin/orders/${job.code}`);
  await expect(page.getByRole("heading", { level: 1, name: "Pembersihan Rutin" })).toBeVisible();
  await expect(page.getByRole("status").first()).toHaveText("Sedang berlangsung");
  await expect(page.getByText(new RegExp(`^Pesanan ${job.code}, `))).toBeVisible();
  await expect(page.getByRole("link", { name: "Kembali ke pemantauan langsung" })).toHaveAttribute("href", "/admin/monitor");

  const video = card(page, "Siaran langsung");
  await expect(video.locator("video")).toHaveCount(1);
  await expect(video.getByRole("button", { name: `Buka siaran ${job.cleaner} dalam layar penuh` })).toBeVisible();
  await expect(video).toContainText("Rekaman tersimpan 7 hari");

  const facts = card(page, "Detail pesanan");
  await expect(facts).toContainText("Pembersihan Rutin");
  await expect(facts).toContainText("Jakarta Timur");

  const people = card(page, "Petugas dan agensi");
  await expect(people).toContainText(job.cleaner);
  await expect(people).toContainText(data.agencyName);

  await expect(card(page, "Pembayaran")).toContainText("Lunas");

  const steps = card(page, "Status pekerjaan");
  await expect(steps.locator("[data-step='assigned']")).toHaveAttribute("data-state", "done");
  await expect(steps.locator("[data-step='checkedIn']")).toHaveAttribute("data-state", "done");
  await expect(steps.locator("[data-step='completed']")).toContainText("Belum");
  // Each step carries an icon beside its word, never colour alone.
  await expect(steps.locator("li svg")).toHaveCount(3);
});

test("the help chat about the order opens from the page, with the customer's name", async ({ page }) => {
  await page.goto(`/admin/orders/${data.live.active.code}`);
  await expect(card(page, "Pelanggan")).toContainText("Uji Pelanggan Pekerjaan");
  await page.getByRole("link", { name: "Buka obrolan pelanggan" }).click();
  await expect(page).toHaveURL(/\/admin\/tickets\?ticket=/);
  await expect(page.getByRole("region", { name: "Percakapan dengan pelanggan" }).getByText(question).first()).toBeVisible();
});

test("a disconnected order says so in the chip, the frame and the steps", async ({ page }) => {
  await page.goto(`/admin/orders/${data.live.disconnected.code}`);
  await expect(page.getByRole("status").first()).toHaveText("Terputus");
  const video = card(page, "Siaran langsung");
  await expect(video.getByText("Siaran terputus", { exact: true })).toBeVisible();
  await expect(video).toContainText(/Siaran terputus pukul \d{2}\.\d{2}\./);
  await expect(card(page, "Status pekerjaan").locator("[data-step='disconnected']")).toHaveAttribute("data-state", "problem");
  // No help chat about this order: no chat button and no customer card.
  await expect(page.getByRole("link", { name: "Buka obrolan pelanggan" })).toHaveCount(0);
  await expect(card(page, "Pelanggan")).toHaveCount(0);
});

test("an order not checked in yet shows its start time and no video", async ({ page }) => {
  await page.goto(`/admin/orders/${data.waiting.code}`);
  await expect(page.getByText("Belum check-in", { exact: true })).toBeVisible();
  const video = card(page, "Siaran langsung");
  await expect(video).toContainText(`Mulai pukul ${jakartaClock(data.waiting.startsAt)} WIB`);
  await expect(video.locator("video")).toHaveCount(0);
  await expect(card(page, "Status pekerjaan").locator("[data-step='checkedIn']")).toHaveAttribute("data-state", "pending");
});

test("a finished order shows when it finished and that it has no recording", async ({ page }) => {
  await page.goto(`/admin/orders/${finishedCode}`);
  await expect(page.getByRole("heading", { level: 1, name: "Pembersihan Rutin" })).toBeVisible();
  const video = card(page, "Siaran langsung");
  await expect(video).toContainText(/Pekerjaan selesai pukul \d{2}\.\d{2}\./);
  await expect(video).toContainText("Pekerjaan ini tidak memiliki rekaman.");
  await expect(card(page, "Status pekerjaan").locator("[data-step='completed']")).toHaveAttribute("data-state", "done");
});

test("an unknown or malformed order number shows a plain message", async ({ page }) => {
  for (const code of ["HK-999999999", "not-an-order"]) {
    await page.goto(`/admin/orders/${code}`);
    await expect(page.getByRole("heading", { level: 2, name: "Pesanan tidak ditemukan" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Kembali ke pemantauan langsung" })).toBeVisible();
  }
});

test("reads in English", async ({ page }) => {
  await page.goto(`/en/admin/orders/${data.live.weak.code}`);
  await expect(page.getByRole("heading", { level: 1, name: "Regular Cleaning" })).toBeVisible();
  await expect(page.getByRole("status").first()).toHaveText("Weak signal");
  await expect(page.getByText(new RegExp(`^Order ${data.live.weak.code}, `))).toBeVisible();
  await expect(card(page, "Job status").locator("[data-step='weak']")).toContainText("Weak signal");
  await expect(page.getByRole("link", { name: "Back to live monitoring" })).toHaveAttribute("href", "/en/admin/monitor");
});
