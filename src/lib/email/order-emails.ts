import type { Locale } from "next-intl";
import { routing } from "@/i18n/routing";
import { createOrderLink } from "@/lib/orders/order-link";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { cleanerAssignedEmail, recordingReadyEmail } from "./order-templates";
import { orderConfirmationEmail, sendAppEmail, type SendResult } from "./send";

// Sends an order's emails (B9) from the server: the facts come from order_email_facts()
// (supabase/migrations/20261114210000_order_emails.sql), which answers the secret key only, because it
// holds the customer's email. Each sender is best effort: it never throws, so the action that triggers
// it (an assignment, a check-out, a resend) never fails because of an email. The customer's language
// is not stored with the order, so the emails the agency and the cleaner trigger are in Indonesian, the
// site's default; a resend uses the language of the page it was asked from.

export type OrderEmailResult = SendResult | { sent: false; reason: "not_ready" };

type Facts = {
  customer_email: string | null;
  order_code: string;
  service_name_id: string;
  service_name_en: string;
  starts_at: string;
  ends_at: string;
  address: string;
  price_idr: number;
  status: string;
  cleaner_name: string | null;
  cleaner_photo_url: string | null;
  recording_expires_at: string | null;
};

const siteUrl = () => (process.env.SITE_URL ?? "https://home-klin.vercel.app").replace(/\/+$/, "");
const localePrefix = (locale: Locale) => (locale === routing.defaultLocale ? "" : `/${locale}`);
/** The order's private link (B14a, signs the customer in and opens the order), else the signed-in orders page. */
const orderUrl = async (orderId: string, locale: Locale) =>
  (await createOrderLink(orderId, locale)) ?? `${siteUrl()}${localePrefix(locale)}/orders?order=${orderId}`;
/** A site image (/images/...) as an address mail apps can load; an https address as it is. */
const absolute = (url: string | null) => (!url ? null : url.startsWith("/") ? `${siteUrl()}${url}` : url);

async function withFacts(orderId: string, what: string, send: (facts: Facts) => Promise<OrderEmailResult>): Promise<OrderEmailResult> {
  try {
    const { data, error } = await createSupabaseServiceClient().rpc("order_email_facts", { p_order: orderId });
    if (error) throw new Error(error.message);
    const facts = (data as Facts[] | null)?.[0];
    if (!facts?.customer_email) return { sent: false, reason: "not_ready" };
    const result = await send(facts);
    if (!result.sent) console.warn(`[email] ${what} for ${orderId} not sent (${result.reason}).`);
    return result;
  } catch (cause) {
    console.error(`[email] ${what} for ${orderId} failed:`, cause);
    return { sent: false, reason: "failed" };
  }
}

/** The cleaner the agency assigned, to the order's customer. */
export function emailCleanerAssigned(orderId: string, locale: Locale = routing.defaultLocale): Promise<OrderEmailResult> {
  return withFacts(orderId, "cleaner email", async (facts) => {
    if (!facts.cleaner_name) return { sent: false, reason: "not_ready" };
    const message = cleanerAssignedEmail(
      {
        orderCode: facts.order_code,
        serviceName: locale === "en" ? facts.service_name_en : facts.service_name_id,
        startsAt: facts.starts_at,
        endsAt: facts.ends_at,
        cleanerName: facts.cleaner_name,
        cleanerPhotoUrl: absolute(facts.cleaner_photo_url),
        orderUrl: await orderUrl(orderId, locale),
      },
      locale,
    );
    return sendAppEmail({ to: facts.customer_email ?? "", ...message });
  });
}

/** The recording is ready to replay, to the order's customer. */
export function emailRecordingReady(orderId: string, locale: Locale = routing.defaultLocale): Promise<OrderEmailResult> {
  return withFacts(orderId, "recording email", async (facts) => {
    if (!facts.recording_expires_at) return { sent: false, reason: "not_ready" };
    const message = recordingReadyEmail(
      {
        orderCode: facts.order_code,
        serviceName: locale === "en" ? facts.service_name_en : facts.service_name_id,
        expiresAt: facts.recording_expires_at,
        orderUrl: await orderUrl(orderId, locale),
      },
      locale,
    );
    return sendAppEmail({ to: facts.customer_email ?? "", ...message });
  });
}

/** The order confirmation once more ("Kirim ulang email"). */
export function emailOrderAgain(orderId: string, locale: Locale): Promise<OrderEmailResult> {
  return withFacts(orderId, "order email", async (facts) => {
    const message = orderConfirmationEmail(
      {
        serviceName: locale === "en" ? facts.service_name_en : facts.service_name_id,
        startsAt: facts.starts_at,
        endsAt: facts.ends_at,
        address: facts.address,
        priceIdr: facts.price_idr,
        orderUrl: (await createOrderLink(orderId, locale)) ?? `${siteUrl()}${localePrefix(locale)}/orders?booked=${orderId}`,
      },
      locale,
    );
    return sendAppEmail({ to: facts.customer_email ?? "", ...message });
  });
}
