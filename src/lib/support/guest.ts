import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { messageFromRow, SupportError, type TicketMessage, type TicketStatus, type TicketUrgency } from "./support";

// The support chat of a visitor without an account (B13, supabase/migrations/20261114180000_guest_support.sql).
// The guest is known by a random token the server keeps in an httpOnly cookie ("<ticket id>.<token>");
// only its SHA-256 leaves the server. The guest functions answer the secret key alone, so they are
// called with the service client, after the cookie has shown the chat is this visitor's. The visitor's
// address is hashed before it is sent, for the database's abuse limits. Realtime does not reach a guest
// (no session), so the guest's page reloads the chat (router.refresh) instead.

export const guestCookieName = "hk_guest_ticket";
/** How long a browser keeps its guest chat: 30 days. */
export const guestCookieMaxAge = 30 * 24 * 60 * 60;

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export const tokenHash = (token: string) => sha256(token);

/** A new random token (256 bits, base64url). */
export const newGuestToken = () => randomBytes(32).toString("base64url");

/** The visitor's address as the database sees it: a hash, never the address itself. */
export async function visitorAddressHash(): Promise<string> {
  const list = await headers();
  const address = list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip")?.trim() || "unknown";
  return sha256(`homeklin-guest-address:${address}`);
}

const cookieValue = z.string().regex(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);

/** The guest chat this browser holds, if any. */
export async function readGuestCookie(): Promise<{ ticketId: string; token: string } | null> {
  const raw = (await cookies()).get(guestCookieName)?.value;
  const parsed = cookieValue.safeParse(raw);
  if (!parsed.success) return null;
  const [ticketId, token] = parsed.data.split(".");
  return z.uuid().safeParse(ticketId).success ? { ticketId, token } : null;
}

/** The token hash for this chat, when this browser's cookie is for it; null otherwise. */
export async function guestTokenHashFor(ticketId: string): Promise<string | null> {
  const held = await readGuestCookie();
  return held && held.ticketId === ticketId ? tokenHash(held.token) : null;
}

export type GuestTicket = {
  id: string;
  question: string;
  urgency: TicketUrgency;
  status: TicketStatus;
  guestName: string;
  createdAt: string;
  lastMessageAt: string;
  /** "Terbaca": the guest's and admin's last read times; a message is read when the other side's is at or after it. */
  customerReadAt: string | null;
  adminReadAt: string | null;
};

type GuestTicketRow = {
  id: string;
  question: string;
  urgency: TicketUrgency;
  status: TicketStatus;
  guest_name: string;
  created_at: string;
  last_message_at: string;
  customer_read_at: string | null;
  admin_read_at: string | null;
};

const isoOrNull = (value: string | null) => (value ? new Date(value).toISOString() : null);

/** This browser's guest chat with its messages, oldest first; null when the cookie is not for it. */
export async function getGuestTicket(ticketId: string): Promise<{ ticket: GuestTicket; messages: TicketMessage[] } | null> {
  const hash = await guestTokenHashFor(ticketId);
  if (!hash) return null;
  const server = createSupabaseServiceClient();
  const [ticket, messages] = await Promise.all([
    server.rpc("guest_ticket", { p_ticket: ticketId, p_token_hash: hash }),
    server.rpc("guest_ticket_messages", { p_ticket: ticketId, p_token_hash: hash }),
  ]);
  if (ticket.error?.message === "ticket_not_found" || messages.error?.message === "ticket_not_found") return null;
  if (ticket.error) throw new SupportError(ticket.error);
  if (messages.error) throw new SupportError(messages.error);
  const row = (ticket.data as GuestTicketRow[])[0];
  if (!row) return null;
  return {
    ticket: {
      id: row.id,
      question: row.question,
      urgency: row.urgency,
      status: row.status,
      guestName: row.guest_name,
      createdAt: new Date(row.created_at).toISOString(),
      lastMessageAt: new Date(row.last_message_at).toISOString(),
      customerReadAt: isoOrNull(row.customer_read_at),
      adminReadAt: isoOrNull(row.admin_read_at),
    },
    messages: (messages.data as Parameters<typeof messageFromRow>[0][]).map(messageFromRow),
  };
}
