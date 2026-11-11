"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { authorize } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Owner-only server actions for the payout layer (T40).
// markPayoutPaid: marks a pending payout as paid (DEMO — no external service called).
// generatePayouts: creates pending payouts for the weekly period ending last Sunday.

export type PayoutFailureKey = "notAllowed" | "notFound" | "alreadyPaid" | "unavailable";
export type PayoutActionState = { ok?: true; created?: number; formError?: PayoutFailureKey } | null;

const refusals: Record<string, PayoutFailureKey> = {
  not_owner: "notAllowed",
  payout_not_found: "notFound",
  already_paid: "alreadyPaid",
};

const failure = (error: { message: string }): PayoutActionState => ({ formError: refusals[error.message] ?? "unavailable" });

const field = (formData: FormData, name: string) => {
  const entry = formData.get(name);
  return entry === null || entry === "" ? undefined : entry;
};

/** Returns the most recent Sunday as YYYY-MM-DD (UTC). */
function lastSundayUtc(): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday
  const daysBack = dayOfWeek === 0 ? 7 : dayOfWeek; // if today IS Sunday, use last Sunday
  const sunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack));
  return sunday.toISOString().slice(0, 10);
}

export async function markPayoutPaid(_previous: PayoutActionState, formData: FormData): Promise<PayoutActionState> {
  if (!(await authorize(["owner"]))) return { formError: "notAllowed" };
  const parsed = z.object({ payoutId: z.string().uuid() }).safeParse({ payoutId: field(formData, "payoutId") });
  if (!parsed.success) return { formError: "notFound" };

  const supabase = await createSupabaseServerClient({ writeCookies: true });
  const { error } = await supabase.rpc("mark_payout_paid", { p_payout_id: parsed.data.payoutId });
  if (error) return failure(error);
  refresh();
  return { ok: true };
}

export async function generatePayouts(_previous: PayoutActionState): Promise<PayoutActionState> {
  if (!(await authorize(["owner"]))) return { formError: "notAllowed" };

  const periodEnd = lastSundayUtc();
  const supabase = await createSupabaseServerClient({ writeCookies: true });
  const { data, error } = await supabase.rpc("generate_payouts", { p_period_end: periodEnd });
  if (error) return failure(error);
  refresh();
  return { ok: true, created: Number(data ?? 0) };
}
