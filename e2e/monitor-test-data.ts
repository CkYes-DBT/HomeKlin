import { randomUUID } from "node:crypto";
import type { Browser, Page } from "@playwright/test";
import { adminClient, type TestUser } from "../tests/integration/test-project";
import { createJobWorld, type JobWorld } from "./job-test-data";

// Test data for the live monitor specs and screenshots (M1), in the shared Supabase test project, on
// top of the job world (e2e/job-test-data.ts): an agency of its own in Jakarta Timur with three jobs in
// progress, each with a live stream (active, weak, disconnected; a stream_sessions row written with the
// secret key, as start_stream writes it), one of today's jobs with a cleaner who has not checked in
// yet (a "Belum check-in" card), and two jobs the monitor must leave out: one today without a cleaner
// and one tomorrow with a cleaner. The world's cleanup removes all of it (the streams go with their
// orders). Other specs use the same project at the same time, so their cards may show up too.

export type MonitorJob = { id: string; code: string; cleaner: string; startsAt: string };

export type MonitorWorld = {
  world: JobWorld;
  agencyName: string;
  live: { active: MonitorJob; weak: MonitorJob; disconnected: MonitorJob };
  waiting: MonitorJob;
  /** Today's job without a cleaner and tomorrow's job with one: neither is a card. */
  left: { unassigned: string; tomorrow: string };
  admin: TestUser;
  cleanup: () => Promise<void>;
};

async function must<T>(what: string, request: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await request;
  if (error) throw new Error(`Could not set up ${what}: ${error.message}`);
  return data as T;
}

/**
 * Minutes from now to a start that is still today in Jakarta: in 20 minutes, unless that crosses
 * midnight, then 20 minutes ago (a cleaner running late is not checked in either).
 */
function laterToday(): number {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" });
  const inTwenty = new Date(Date.now() + 25 * 60_000);
  return day.format(inTwenty) === day.format(new Date()) ? 20 : -20;
}

export async function createMonitorWorld(label: string): Promise<MonitorWorld> {
  const admin = adminClient();
  const world = await createJobWorld(label);
  try {
    const suffix = randomUUID().slice(0, 6);
    const agencyName = `Uji Agensi Pantau ${suffix}`;
    const agency = await world.agency(agencyName);
    const names = {
      active: "Uji Petugas Pantau Aktif",
      weak: "Uji Petugas Pantau Lemah",
      disconnected: "Uji Petugas Pantau Putus",
      waiting: "Uji Petugas Pantau Menunggu",
      tomorrow: "Uji Petugas Pantau Besok",
    };
    const cleaners = {
      active: await world.cleaner(agency.id, names.active),
      weak: await world.cleaner(agency.id, names.weak),
      disconnected: await world.cleaner(agency.id, names.disconnected),
      waiting: await world.cleaner(agency.id, names.waiting),
      tomorrow: await world.cleaner(agency.id, names.tomorrow),
    };

    const live = {} as Record<"active" | "weak" | "disconnected", { id: string; startsAt: string }>;
    for (const [status, startsIn] of [
      ["active", -40],
      ["weak", -30],
      ["disconnected", -20],
    ] as const) {
      live[status] = await world.job({
        agencyId: agency.id,
        cleaner: cleaners[status],
        startsIn,
        address: `Jl. Uji Pantau ${status}, Cakung, Jakarta Timur`,
        checkedInMinutesAgo: 10,
      });
    }
    const waiting = await world.job({
      agencyId: agency.id,
      cleaner: cleaners.waiting,
      startsIn: laterToday(),
      address: "Jl. Uji Pantau Menunggu, Cakung, Jakarta Timur",
    });
    const unassigned = await world.job({ agencyId: agency.id, cleaner: null, startsIn: laterToday(), address: "Jl. Uji Pantau Kosong, Cakung, Jakarta Timur" });
    const tomorrow = await world.job({
      agencyId: agency.id,
      cleaner: cleaners.tomorrow,
      startsIn: 24 * 60 + 60,
      address: "Jl. Uji Pantau Besok, Cakung, Jakarta Timur",
    });

    // As start_stream writes it: one session per job, the demo source, the status the cleaner's page reports.
    await must(
      "the live streams",
      admin.from("stream_sessions").insert(
        (["active", "weak", "disconnected"] as const).map((status) => ({
          order_id: live[status].id,
          cleaner_id: cleaners[status].id,
          agency_id: agency.id,
          source: "demo",
          status,
        })),
      ),
    );

    const ids = [live.active.id, live.weak.id, live.disconnected.id, waiting.id];
    const rows = await must("the order codes", admin.from("orders").select("id, code").in("id", ids));
    const codes = new Map((rows as { id: string; code: string }[]).map((row) => [row.id, row.code]));
    const card = (job: { id: string; startsAt: string }, cleaner: string): MonitorJob => ({
      id: job.id,
      code: codes.get(job.id) ?? "",
      cleaner,
      startsAt: job.startsAt,
    });

    const staff = await world.admin("Uji Admin Pantau");
    return {
      world,
      agencyName,
      live: {
        active: card(live.active, names.active),
        weak: card(live.weak, names.weak),
        disconnected: card(live.disconnected, names.disconnected),
      },
      waiting: card(waiting, names.waiting),
      left: { unassigned: unassigned.id, tomorrow: tomorrow.id },
      admin: staff,
      cleanup: () => world.cleanup(),
    };
  } catch (error) {
    await world.cleanup();
    throw error;
  }
}

/**
 * A short video the browser can play: the test project's demo clip is an 8-byte stand-in, so a spec
 * that needs a playing feed records two seconds of a calm canvas in the browser (WebM, no files, no
 * dependencies) and serves it in place of every signed link (serveTestVideo).
 */
export async function makeTestVideo(browser: Browser): Promise<Buffer> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context2d = canvas.getContext("2d");
    if (!context2d) throw new Error("no canvas");
    const recorder = new MediaRecorder(canvas.captureStream(15), { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));
    recorder.start();
    const started = performance.now();
    await new Promise<void>((resolve) => {
      function draw() {
        const t = (performance.now() - started) / 2000;
        const gradient = context2d!.createLinearGradient(0, 0, 640, 360);
        gradient.addColorStop(0, "#cfdccf");
        gradient.addColorStop(1, `rgb(${200 + 20 * t}, 214, 196)`);
        context2d!.fillStyle = gradient;
        context2d!.fillRect(0, 0, 640, 360);
        if (t < 1) requestAnimationFrame(draw);
        else resolve();
      }
      draw();
    });
    recorder.stop();
    await stopped;
    const buffer = await new Blob(chunks, { type: "video/webm" }).arrayBuffer();
    let binary = "";
    for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  await context.close();
  return Buffer.from(base64, "base64");
}

/** Every signed recordings link on this page answers with the test video instead of the stand-in clip. */
export async function serveTestVideo(page: Page, video: Buffer) {
  await page.route("**/storage/v1/object/sign/recordings/**", (route) =>
    route.fulfill({ status: 200, contentType: "video/webm", body: video }),
  );
}
