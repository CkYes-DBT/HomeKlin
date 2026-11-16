"use server";

import { z } from "zod";
import { routing } from "@/i18n/routing";
import { authorize } from "@/lib/auth/dal";
import { banks } from "@/lib/payment/methods";
import { cancelCharge, chargePayload, createCharge, midtransOrderId, PaymentError } from "@/lib/payment/midtrans";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Paying on HomeKlin's own payment step. A Server Action is a public POST endpoint, so each one checks
// the customer, then reads the order through order_for_payment() with the customer's own session (the
// database answers only for the customer's own order, supabase/migrations/20261026090000_payments.sql),
// and charges exactly the price stored on that order. Every charge is an "attempt" the database opens
// first (begin_payment_attempt), so choosing another method later makes a new charge and cancels the old
// one at Midtrans; what Midtrans answered (the account number, the QR code) is kept on the order
// (attach_payment_details) and shown from there, also after a reload. The payment's result comes back to
// HomeKlin only through Midtrans' signed notification (T11), never through the browser: these actions
// only start a payment.

/** Why the payment could not start, as a message key ("Payment.errors.<key>"). */
export type PaymentFailureKey =
  | "notCustomer"
  | "notFound"
  | "notPayable"
  | "paymentUnavailable"
  | "tooManyAttempts"
  | "invalidChoice";

export type PayResult =
  | { ok: true; authenticateUrl?: string; declined?: boolean }
  | { ok: false; error: PaymentFailureKey };

export type ChangeResult = { ok: true } | { ok: false; error: PaymentFailureKey };

const choiceSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("qris") }),
  z.object({ method: z.literal("bank"), bank: z.enum(banks) }),
  // The one-time token Midtrans gives for a card, never the card itself.
  z.object({ method: z.literal("card"), tokenId: z.string().regex(/^[A-Za-z0-9-]{8,100}$/) }),
]);

const orderIdSchema = z.uuid();
const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);

type PaymentRow = {
  order_id: string;
  service_id: string;
  service_name_id: string;
  service_name_en: string;
  price_idr: number;
  contact_phone: string | null;
  status: string;
};

type Attempt = { attempt: number; previous_attempt: number; previous_charge: boolean };

/** Opens the next attempt on the customer's own waiting order; the failure key when it cannot. */
async function openAttempt(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  orderId: string,
): Promise<{ attempt: Attempt } | { error: PaymentFailureKey }> {
  const { data, error } = await supabase.rpc("begin_payment_attempt", { p_order: orderId });
  if (error) {
    if (error.message === "order_not_payable") return { error: "notPayable" };
    if (error.message === "attempts_exhausted") return { error: "tooManyAttempts" };
    return { error: "paymentUnavailable" };
  }
  const attempt = ((data ?? []) as Attempt[])[0];
  return attempt ? { attempt } : { error: "paymentUnavailable" };
}

/** Cancels what the customer left, best effort: a failed cancellation never stops the new attempt. */
function cancelPrevious(orderId: string, attempt: Attempt): Promise<boolean> {
  if (!attempt.previous_charge) return Promise.resolve(false);
  return cancelCharge(midtransOrderId(orderId, attempt.previous_attempt), { serverKey: process.env.MIDTRANS_SERVER_KEY });
}

/** "Bayar sekarang": charges the order with the method the customer chose. */
export async function payOrder(input: unknown): Promise<PayResult> {
  if (!(await authorize(["customer"]))) return { ok: false, error: "notCustomer" };

  const given = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const orderId = orderIdSchema.safeParse(given.orderId);
  if (!orderId.success) return { ok: false, error: "notFound" };
  const choice = choiceSchema.safeParse(given.choice);
  if (!choice.success) return { ok: false, error: "invalidChoice" };
  const locale = localeSchema.parse(given.locale);

  const supabase = await createSupabaseServerClient({ writeCookies: true });
  const { data, error } = await supabase.rpc("order_for_payment", { p_order: orderId.data });
  const order = ((data ?? []) as PaymentRow[])[0];
  if (error || !order) return { ok: false, error: "notFound" };
  if (order.status !== "pending_payment") return { ok: false, error: "notPayable" };

  const opened = await openAttempt(supabase, order.order_id);
  if ("error" in opened) return { ok: false, error: opened.error };
  const { attempt } = opened;

  const { data: account } = await supabase.auth.getUser();
  const payload = chargePayload(
    {
      orderId: order.order_id,
      serviceId: order.service_id,
      serviceName: locale === "en" ? order.service_name_en : order.service_name_id,
      priceIdr: order.price_idr,
      email: account.user?.email ?? undefined,
      phone: order.contact_phone,
    },
    choice.data,
    attempt.attempt,
  );

  let charge;
  try {
    [charge] = await Promise.all([
      createCharge(payload, { serverKey: process.env.MIDTRANS_SERVER_KEY }),
      cancelPrevious(order.order_id, attempt),
    ]);
  } catch (cause) {
    console.warn(`Payment not started (${cause instanceof PaymentError ? cause.reason : "error"}).`);
    return { ok: false, error: "paymentUnavailable" };
  }

  const stored = await supabase.rpc("attach_payment_details", {
    p_order: order.order_id,
    p_attempt: attempt.attempt,
    p_details: charge.details,
  });
  if (stored.error) return { ok: false, error: "notPayable" };

  return {
    ok: true,
    ...(charge.authenticateUrl ? { authenticateUrl: charge.authenticateUrl } : {}),
    ...(charge.declined ? { declined: true } : {}),
  };
}

/** "Ganti cara bayar": leaves the method that was charged, so the customer can choose again. */
export async function changePaymentMethod(input: unknown): Promise<ChangeResult> {
  if (!(await authorize(["customer"]))) return { ok: false, error: "notCustomer" };

  const given = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const orderId = orderIdSchema.safeParse(given.orderId);
  if (!orderId.success) return { ok: false, error: "notFound" };

  const supabase = await createSupabaseServerClient({ writeCookies: true });
  const opened = await openAttempt(supabase, orderId.data);
  if ("error" in opened) return { ok: false, error: opened.error };
  await cancelPrevious(orderId.data, opened.attempt);
  return { ok: true };
}
