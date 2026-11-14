import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgencySummary,
  AgencyFeesByCleanerRow,
  AgencyFeesByServiceRow,
  AgencyFeesDailyRow,
  AgencyPayoutsListRow,
  OwnerPayoutsOverviewRow,
  ValidDays,
} from "./schemas";

// Server-side readers for agency fees and payouts (T40). Pass the caller's session client
// (createSupabaseServerClient) so RLS limits SECURITY INVOKER functions to their own agency.
// SECURITY DEFINER functions (owner_payouts_overview, and agency_summary since B5) check the caller's
// role in the DB itself.

export class PayoutError extends Error {
  constructor(cause: { message: string }) {
    super(`Could not read payout data: ${cause.message}`);
    this.name = "PayoutError";
  }
}

export async function getAgencySummary(client: SupabaseClient, days: ValidDays): Promise<AgencySummary> {
  const { data, error } = await client.rpc("agency_summary", { p_days: days });
  if (error) throw new PayoutError(error);
  type Row = { total_fee_idr: unknown; jobs_count: unknown; avg_fee_idr: unknown; pending_idr: unknown; previous_total_fee_idr: unknown };
  const row = (Array.isArray(data) ? data[0] : data) as Row;
  return {
    totalFeeIdr: Number(row.total_fee_idr ?? 0),
    jobsCount: Number(row.jobs_count ?? 0),
    avgFeeIdr: Number(row.avg_fee_idr ?? 0),
    pendingIdr: Number(row.pending_idr ?? 0),
    previousTotalFeeIdr: Number(row.previous_total_fee_idr ?? 0),
  };
}

export async function getAgencyFeesDaily(client: SupabaseClient, days: ValidDays): Promise<AgencyFeesDailyRow[]> {
  const { data, error } = await client.rpc("agency_fees_daily", { p_days: days });
  if (error) throw new PayoutError(error);
  type Row = { day: string; fee_idr: unknown };
  return ((data ?? []) as Row[]).map((row) => ({
    day: String(row.day).slice(0, 10),
    feeIdr: Number(row.fee_idr ?? 0),
  }));
}

export async function getAgencyFeesByCleaner(client: SupabaseClient, days: ValidDays): Promise<AgencyFeesByCleanerRow[]> {
  const { data, error } = await client.rpc("agency_fees_by_cleaner", { p_days: days });
  if (error) throw new PayoutError(error);
  type Row = { cleaner_id: string; full_name: string; fee_idr: unknown; share_percent: unknown };
  return ((data ?? []) as Row[]).map((row) => ({
    cleanerId: row.cleaner_id,
    fullName: row.full_name,
    feeIdr: Number(row.fee_idr ?? 0),
    sharePercent: Number(row.share_percent ?? 0),
  }));
}

export async function getAgencyFeesByService(client: SupabaseClient, days: ValidDays): Promise<AgencyFeesByServiceRow[]> {
  const { data, error } = await client.rpc("agency_fees_by_service", { p_days: days });
  if (error) throw new PayoutError(error);
  type Row = { service_id: string; service_name: string; fee_idr: unknown; share_percent: unknown };
  return ((data ?? []) as Row[]).map((row) => ({
    serviceId: row.service_id,
    serviceName: row.service_name,
    feeIdr: Number(row.fee_idr ?? 0),
    sharePercent: Number(row.share_percent ?? 0),
  }));
}

export async function listAgencyPayouts(client: SupabaseClient, limit: number): Promise<AgencyPayoutsListRow[]> {
  const { data, error } = await client.rpc("agency_payouts_list", { p_limit: limit });
  if (error) throw new PayoutError(error);
  type Row = {
    id: string; period_start: string; period_end: string; amount_idr: number; jobs_count: number;
    status: string; payout_date: string | null; paid_at: string | null; paid_reference: string | null;
  };
  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    periodStart: String(row.period_start).slice(0, 10),
    periodEnd: String(row.period_end).slice(0, 10),
    amountIdr: Number(row.amount_idr),
    jobsCount: Number(row.jobs_count),
    status: row.status as "pending" | "paid",
    payoutDate: row.payout_date ? String(row.payout_date).slice(0, 10) : null,
    paidAt: row.paid_at ?? null,
    paidReference: row.paid_reference ?? null,
  }));
}

export async function getOwnerPayoutsOverview(client: SupabaseClient): Promise<OwnerPayoutsOverviewRow[]> {
  const { data, error } = await client.rpc("owner_payouts_overview");
  if (error) throw new PayoutError(error);
  type Row = { agency_id: string; agency_name: string; total_paid_idr: unknown; total_pending_idr: unknown; last_payout_date: string | null };
  return ((data ?? []) as Row[]).map((row) => ({
    agencyId: row.agency_id,
    agencyName: row.agency_name,
    totalPaidIdr: Number(row.total_paid_idr ?? 0),
    totalPendingIdr: Number(row.total_pending_idr ?? 0),
    lastPayoutDate: row.last_payout_date ? String(row.last_payout_date).slice(0, 10) : null,
  }));
}

/**
 * The agency's fee for each of these finished orders (D2: "Imbalan agensi" on its completed orders),
 * read from order_fees with the agency's own session, so RLS returns its own rows only. An order with
 * no fee row (not finished through check-out) is missing from the map.
 */
export async function listAgencyOrderFees(client: SupabaseClient, orderIds: readonly string[]): Promise<Map<string, number>> {
  if (orderIds.length === 0) return new Map();
  const { data, error } = await client.from("order_fees").select("order_id, fee_idr").in("order_id", [...orderIds]);
  if (error) throw new PayoutError(error);
  return new Map(((data ?? []) as { order_id: string; fee_idr: number }[]).map((row) => [row.order_id, Number(row.fee_idr)]));
}
