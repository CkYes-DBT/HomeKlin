import { z } from "zod";

// Types and Zod schemas for the payouts / agency-fees layer (T40).
// Used by both readers.ts (server components) and actions.ts ("use server").
// A "use server" file cannot export constants, so this file is kept separate.

export const VALID_DAYS = [7, 30, 90] as const;
export type ValidDays = (typeof VALID_DAYS)[number];

export const PayoutDaysSchema = z.coerce
  .number()
  .refine((n): n is ValidDays => (VALID_DAYS as readonly number[]).includes(n), {
    message: "Days must be 7, 30 or 90",
  });

export type AgencySummary = {
  totalFeeIdr: number;
  jobsCount: number;
  avgFeeIdr: number;
  pendingIdr: number;
};

export type AgencyFeesDailyRow = {
  day: string; // YYYY-MM-DD
  feeIdr: number;
};

export type AgencyFeesByCleanerRow = {
  cleanerId: string;
  fullName: string;
  feeIdr: number;
  sharePercent: number;
};

export type AgencyFeesByServiceRow = {
  serviceId: string;
  serviceName: string;
  feeIdr: number;
  sharePercent: number;
};

export type AgencyPayoutsListRow = {
  id: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  amountIdr: number;
  jobsCount: number;
  status: "pending" | "paid";
  payoutDate: string | null;   // YYYY-MM-DD
  paidAt: string | null;       // ISO timestamp
  paidReference: string | null;
};

export type OwnerPayoutsOverviewRow = {
  agencyId: string;
  agencyName: string;
  totalPaidIdr: number;
  totalPendingIdr: number;
  lastPayoutDate: string | null; // YYYY-MM-DD
};
