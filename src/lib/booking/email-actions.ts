"use server";

import { z } from "zod";
import { routing } from "@/i18n/routing";
import { authorize } from "@/lib/auth/dal";
import { emailOrderAgain } from "@/lib/email/order-emails";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// "Kirim ulang email" (B9): the order's own customer asks for the order email again. A public POST
// endpoint, so it checks the role and parses its input; claim_order_email_resend()
// (supabase/migrations/20261114210000_order_emails.sql) checks that the order is the customer's and
// allows one request per order every 5 minutes, before anything is sent.

export type ResendFailureKey = "notCustomer" | "notFound" | "tooSoon" | "unavailable";
export type ResendState = { ok?: true; formError?: ResendFailureKey } | null;

const input = z.object({ orderId: z.uuid(), locale: z.enum(routing.locales).catch(routing.defaultLocale) });

export async function resendOrderEmail(_previous: ResendState, formData: FormData): Promise<ResendState> {
  if (!(await authorize(["customer"]))) return { formError: "notCustomer" };
  const text = (name: string) => {
    const entry = formData.get(name);
    return typeof entry === "string" ? entry : undefined;
  };
  const parsed = input.safeParse({ orderId: text("orderId"), locale: text("locale") });
  if (!parsed.success) return { formError: "notFound" };

  const supabase = await createSupabaseServerClient({ writeCookies: true });
  const { error } = await supabase.rpc("claim_order_email_resend", { p_order: parsed.data.orderId });
  if (error) {
    if (error.message === "too_soon") return { formError: "tooSoon" };
    if (error.message === "order_not_found") return { formError: "notFound" };
    if (error.message === "not_customer") return { formError: "notCustomer" };
    return { formError: "unavailable" };
  }
  const result = await emailOrderAgain(parsed.data.orderId, parsed.data.locale);
  return result.sent ? { ok: true } : { formError: "unavailable" };
}

/**
 * B14a: the customer revokes every private link of their own order (the links in its emails), for
 * example after forwarding an email by mistake. New emails carry new links.
 */
export async function revokeOrderLinks(_previous: ResendState, formData: FormData): Promise<ResendState> {
  if (!(await authorize(["customer"]))) return { formError: "notCustomer" };
  const entry = formData.get("orderId");
  const parsed = z.uuid().safeParse(typeof entry === "string" ? entry : undefined);
  if (!parsed.success) return { formError: "notFound" };

  const supabase = await createSupabaseServerClient({ writeCookies: true });
  const { error } = await supabase.rpc("revoke_order_links", { p_order: parsed.data });
  if (error) return { formError: error.message === "order_not_found" ? "notFound" : error.message === "not_customer" ? "notCustomer" : "unavailable" };
  return { ok: true };
}
