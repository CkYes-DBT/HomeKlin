import type { TicketStatus } from "@/lib/support/support";

// The support inbox's filters (D1, the user's mock "Admin-Support"): "Tampilkan" chooses every ticket,
// those waiting for an answer from admin, or the closed ones; the search finds a customer's name, an
// order number ("HK-1042", whole or in part) or words of the question. Both are query parameters
// (?show=&q=), so they work without JavaScript. Pure, tested in tests/admin-inbox.test.ts.

export const inboxViews = ["all", "waiting", "closed"] as const;
export type InboxView = (typeof inboxViews)[number];
export type InboxFilters = { show: InboxView; query: string };

/** The longest search kept; a longer one is cut. */
const maxQuery = 80;

const firstOf = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function parseInboxFilters(params: { show?: string | string[]; q?: string | string[] }): InboxFilters {
  const show = firstOf(params.show);
  return {
    show: (inboxViews as readonly string[]).includes(show ?? "") ? (show as InboxView) : "all",
    query: (firstOf(params.q) ?? "").trim().slice(0, maxQuery),
  };
}

type FilterableTicket = { status: TicketStatus; customerName: string | null; question: string; orderId: string | null };

function inView(ticket: FilterableTicket, show: InboxView): boolean {
  if (show === "waiting") return ticket.status === "open";
  if (show === "closed") return ticket.status === "closed";
  return true;
}

/** The tickets the filters leave, in the inbox's own order. `codes` gives each order id its number. */
export function filterInbox<T extends FilterableTicket>(tickets: readonly T[], filters: InboxFilters, codes: ReadonlyMap<string, string>): T[] {
  const words = filters.query.toLocaleLowerCase("id");
  return tickets.filter((ticket) => {
    if (!inView(ticket, filters.show)) return false;
    if (!words) return true;
    const code = ticket.orderId ? (codes.get(ticket.orderId) ?? "") : "";
    return [ticket.customerName ?? "", code, ticket.question].some((text) => text.toLocaleLowerCase("id").includes(words));
  });
}

/** How many tickets each view holds, for the select's labels ("Perlu dijawab (3)"). */
export function inboxCounts(tickets: readonly { status: TicketStatus }[]): Record<InboxView, number> {
  return {
    all: tickets.length,
    waiting: tickets.filter((ticket) => ticket.status === "open").length,
    closed: tickets.filter((ticket) => ticket.status === "closed").length,
  };
}
