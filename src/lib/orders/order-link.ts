import { createHash, randomBytes } from "node:crypto";
import type { Locale } from "next-intl";
import { routing } from "@/i18n/routing";
import type { OrderStatus } from "@/lib/booking/orders";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// The private link to one order's page from its emails (B14a, supabase/migrations/20261114220000_order_links.sql).
// The link is /o/<token> (or /en/o/<token>): a random 256-bit token that only the email holds; the
// database keeps its SHA-256. Opening it signs the order's customer in
// (src/lib/orders/order-link-sign-in.ts) and leads to their full order page. A link works for
// 30 days; the order's customer revokes them all with revokeOrderLinks (src/lib/booking/email-actions.ts).

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const tokenFormat = /^[A-Za-z0-9_-]{43}$/;
const siteUrl = () => (process.env.SITE_URL ?? "https://home-klin.vercel.app").replace(/\/+$/, "");

/** A new link to the order's page, or null when it could not be stored (the email then links the orders page). */
export async function createOrderLink(orderId: string, locale: Locale): Promise<string | null> {
  const token = randomBytes(32).toString("base64url");
  try {
    const { error } = await createSupabaseServiceClient().rpc("issue_order_link", { p_order: orderId, p_token_hash: sha256(token) });
    if (error) throw new Error(error.message);
  } catch (cause) {
    console.error(`[order link] could not store a link for ${orderId}:`, cause);
    return null;
  }
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  return `${siteUrl()}${prefix}/o/${token}`;
}

export type OrderLinkView = {
  id: string;
  orderCode: string;
  serviceId: string;
  areaId: string;
  startsAt: string;
  endsAt: string;
  priceIdr: number;
  status: OrderStatus;
  createdAt: string;
  paymentMethod: string | null;
  cleanerName: string | null;
  cleanerPhotoUrl: string | null;
  assignedAt: string | null;
  checkedInAt: string | null;
  completedAt: string | null;
  recordingExpiresAt: string | null;
  recordingDeleted: boolean;
  /** When this link stops working. */
  linkExpiresAt: string;
};

type Row = {
  order_id: string;
  order_code: string;
  service_id: string;
  area_id: string;
  starts_at: string;
  ends_at: string;
  price_idr: number;
  status: OrderStatus;
  created_at: string;
  payment_type: string | null;
  cleaner_name: string | null;
  cleaner_photo_url: string | null;
  assigned_at: string | null;
  checked_in_at: string | null;
  completed_at: string | null;
  recording_expires_at: string | null;
  recording_deleted: boolean | null;
  link_expires_at: string;
};

const iso = (value: string) => new Date(value).toISOString();
const isoOrNull = (value: string | null) => (value ? iso(value) : null);

/** The order behind a link, or null for an unknown, revoked, expired or malformed one. */
export async function getOrderByLink(token: string): Promise<OrderLinkView | null> {
  if (!tokenFormat.test(token)) return null;
  const { data, error } = await createSupabaseServiceClient().rpc("order_by_link", { p_token_hash: sha256(token) });
  if (error) {
    if (error.message === "link_not_found") return null;
    throw new Error(`Could not read the order link: ${error.message}`);
  }
  const row = (data as Row[] | null)?.[0];
  if (!row) return null;
  return {
    id: row.order_id,
    orderCode: row.order_code,
    serviceId: row.service_id,
    areaId: row.area_id,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    priceIdr: row.price_idr,
    status: row.status,
    createdAt: iso(row.created_at),
    paymentMethod: row.payment_type,
    cleanerName: row.cleaner_name,
    cleanerPhotoUrl: row.cleaner_photo_url,
    assignedAt: isoOrNull(row.assigned_at),
    checkedInAt: isoOrNull(row.checked_in_at),
    completedAt: isoOrNull(row.completed_at),
    recordingExpiresAt: isoOrNull(row.recording_expires_at),
    recordingDeleted: row.recording_deleted === true,
    linkExpiresAt: iso(row.link_expires_at),
  };
}
