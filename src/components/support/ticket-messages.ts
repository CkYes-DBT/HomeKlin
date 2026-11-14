import type { TicketMessage, TicketStatus } from "@/lib/support/support";

// The chat's messages (T20, T21): the ones the server rendered, plus the ones Supabase Realtime
// delivers while the page is open. Realtime sends raw table rows, so each is checked before it is
// shown. Shared by the customer's chat and the admin's; no React here, so it is unit tested
// (tests/support-ui.test.ts). Only types come from the reader module, so the browser never loads it.

const statuses: readonly TicketStatus[] = ["open", "answered", "closed"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The server's messages and the live ones, each once (by id), oldest first. */
export function mergeMessages(server: readonly TicketMessage[], live: readonly TicketMessage[]): TicketMessage[] {
  const byId = new Map(server.map((message) => [message.id, message]));
  for (const message of live) if (!byId.has(message.id)) byId.set(message.id, message);
  return [...byId.values()].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/** A new ticket_messages row from Realtime, or null when it is not a message of this ticket. */
export function messageFromChange(row: unknown, ticketId: string): TicketMessage | null {
  if (!isRecord(row) || row.ticket_id !== ticketId) return null;
  const { id, from_admin: fromAdmin, body, created_at: createdAt } = row;
  if (typeof id !== "string" || typeof fromAdmin !== "boolean" || typeof body !== "string") return null;
  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) return null;
  return { id, ticketId, fromAdmin, body, createdAt: new Date(createdAt).toISOString() };
}

/** The new status in a support_tickets change from Realtime, or null when it is not this ticket's. */
export function statusFromChange(row: unknown, ticketId: string): TicketStatus | null {
  if (!isRecord(row) || row.id !== ticketId) return null;
  const status = statuses.find((candidate) => candidate === row.status);
  return status ?? null;
}

/** "Terbaca": the other side read the chat at or after this message (B13). */
export function isReadBy(message: Pick<TicketMessage, "createdAt">, readAt: string | null): boolean {
  return readAt !== null && Date.parse(readAt) >= Date.parse(message.createdAt);
}

/** A side's read time (customer_read_at or admin_read_at) in a support_tickets change, or null. */
export function readTimeFromChange(row: unknown, ticketId: string, side: "customer" | "admin"): string | null {
  if (!isRecord(row) || row.id !== ticketId) return null;
  const value = row[side === "customer" ? "customer_read_at" : "admin_read_at"];
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}
