import { timingSafeEqual } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// The weekly payout generation (T43), called by Vercel Cron (vercel.json). Vercel sends the
// project's CRON_SECRET as "Authorization: Bearer <secret>", so only Vercel can start it: 503
// when the secret is not set, 401 for anything else, 200 with the number of payouts created.
// Runs every Monday 00:00 UTC (07:00 Jakarta WIB) and closes the previous Monday–Sunday week.
// Source: https://vercel.com/docs/cron-jobs/manage-cron-jobs ("Securing cron jobs")

function reply(status: number, body: Record<string, string | number>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function isAuthorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** YYYY-MM-DD string for the Sunday before the cron fires (Monday 00:00 UTC). */
function lastSunday(now: Date): string {
  const d = new Date(now);
  // getUTCDay(): 0=Sunday, 1=Monday … 6=Saturday. The cron fires on Monday (1).
  const daysBack = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[payouts] CRON_SECRET is not set: generate_payouts did not run");
    return reply(503, { error: "not_configured" });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) return reply(401, { error: "unauthorized" });

  try {
    const periodEnd = lastSunday(new Date());
    const server = createSupabaseServiceClient();
    const { data, error } = await server.rpc("generate_payouts", { p_period_end: periodEnd });
    if (error) throw new Error(error.message);
    console.info("[payouts] generate_payouts(%s) created %d payout(s)", periodEnd, data);
    return reply(200, { created: Number(data ?? 0), periodEnd });
  } catch (cause) {
    console.error("[payouts] generate_payouts failed:", cause);
    return reply(503, { error: "unavailable" });
  }
}
