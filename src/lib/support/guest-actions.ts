"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { authorize } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { guestCookieMaxAge, guestCookieName, guestTokenHashFor, newGuestToken, tokenHash, visitorAddressHash } from "./guest";

// The guest support chat's actions (B13) and marking a chat read ("Terbaca") for every side. Public
// POST endpoints: each parses its input; a guest acts only on the chat its own httpOnly cookie names
// (src/lib/support/guest.ts), and the database checks the token's hash once more. Refusals come back as
// message keys (SupportGuestErrors in src/messages, added with the page).

export type GuestFailureKey =
  | "nameInvalid"
  | "emailInvalid"
  | "questionInvalid"
  | "messageInvalid"
  | "notFound"
  | "closed"
  | "tooMany"
  | "noAddress"
  | "notAllowed"
  | "unavailable";
export type GuestFormState = { ok?: true; formError?: GuestFailureKey } | null;

const refusals: Record<string, GuestFailureKey> = {
  name_invalid: "nameInvalid",
  email_invalid: "emailInvalid",
  question_invalid: "questionInvalid",
  message_invalid: "messageInvalid",
  ticket_not_found: "notFound",
  ticket_closed: "closed",
  too_many_tickets: "tooMany",
  too_many_messages: "tooMany",
  not_allowed: "notAllowed",
};

const failure = (error: { message: string }): GuestFormState => ({ formError: refusals[error.message] ?? "unavailable" });

const text = (formData: FormData, name: string) => {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
};

const openInput = z.object({
  name: z.string().trim().min(1, { error: "nameInvalid" }).max(80, { error: "nameInvalid" }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.union([z.literal(""), z.email({ error: "emailInvalid" }).max(254, { error: "emailInvalid" })])),
  question: z.string().trim().min(5, { error: "questionInvalid" }).max(1000, { error: "questionInvalid" }),
  locale: z.enum(routing.locales).catch(routing.defaultLocale),
});

const messageInput = z.object({ ticketId: z.uuid(), body: z.string().trim().min(1).max(2000) });

/** A visitor without an account opens a support chat; the browser keeps its token in a cookie. */
export async function openGuestTicket(_previous: GuestFormState, formData: FormData): Promise<GuestFormState> {
  const parsed = openInput.safeParse({
    name: text(formData, "name"),
    email: text(formData, "email"),
    question: text(formData, "question"),
    locale: text(formData, "locale"),
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { formError: field === "name" ? "nameInvalid" : field === "email" ? "emailInvalid" : "questionInvalid" };
  }

  // Review L2: without the visitor's address there is no per-address limit, so no guest chat opens.
  const addressHash = await visitorAddressHash();
  if (!addressHash) return { formError: "noAddress" };

  const token = newGuestToken();
  const { data, error } = await createSupabaseServiceClient().rpc("guest_open_ticket", {
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_question: parsed.data.question,
    p_token_hash: tokenHash(token),
    p_ip_hash: addressHash,
  });
  if (error) return failure(error);
  const ticketId = String(data);

  (await cookies()).set(guestCookieName, `${ticketId}.${token}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: guestCookieMaxAge,
  });
  const prefix = parsed.data.locale === routing.defaultLocale ? "" : `/${parsed.data.locale}`;
  return redirect(`${prefix}/support?ticket=${ticketId}`);
}

/** The guest writes in their own chat. */
export async function postGuestMessage(_previous: GuestFormState, formData: FormData): Promise<GuestFormState> {
  const parsed = messageInput.safeParse({ ticketId: text(formData, "ticketId"), body: text(formData, "body") });
  if (!parsed.success) return { formError: parsed.error.issues.some((issue) => issue.path[0] === "body") ? "messageInvalid" : "notFound" };
  const hash = await guestTokenHashFor(parsed.data.ticketId);
  if (!hash) return { formError: "notFound" };

  const { error } = await createSupabaseServiceClient().rpc("guest_post_message", {
    p_ticket: parsed.data.ticketId,
    p_token_hash: hash,
    p_body: parsed.data.body,
  });
  if (error) return failure(error);
  refresh();
  return { ok: true };
}

/** The guest has seen their chat (its "Terbaca" for admin). */
export async function markGuestTicketRead(ticketId: string): Promise<GuestFormState> {
  if (!z.uuid().safeParse(ticketId).success) return { formError: "notFound" };
  const hash = await guestTokenHashFor(ticketId);
  if (!hash) return { formError: "notFound" };
  const { error } = await createSupabaseServiceClient().rpc("guest_mark_read", { p_ticket: ticketId, p_token_hash: hash });
  return error ? failure(error) : { ok: true };
}

/** A signed-in customer (their own ticket) or an admin has seen the chat. */
export async function markTicketRead(ticketId: string): Promise<GuestFormState> {
  if (!(await authorize(["customer", "admin"]))) return { formError: "notAllowed" };
  if (!z.uuid().safeParse(ticketId).success) return { formError: "notFound" };
  const supabase = await createSupabaseServerClient({ writeCookies: true });
  const { error } = await supabase.rpc("mark_ticket_read", { p_ticket: ticketId });
  return error ? failure(error) : { ok: true };
}
