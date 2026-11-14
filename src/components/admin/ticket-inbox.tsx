import { MessageSquareText, Search, SearchX } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { TicketStatusPill, UrgentPill } from "@/components/support/ticket-pills";
import { getPathname, Link } from "@/i18n/navigation";
import type { InboxTicket } from "@/lib/support/support";
import type { InboxFilters } from "./inbox-filters";

type TicketInboxProps = {
  /** The tickets the filters leave, in the inbox function's order. */
  tickets: InboxTicket[];
  /** The ticket open beside the list, marked as current. */
  selectedId: string | null;
  filters: InboxFilters;
  /** Each order id's number ("HK-1042"), so a row can name the order the question is about. */
  codes: ReadonlyMap<string, string>;
};

/** The address of the inbox with these filters and, optionally, a ticket open. */
export function inboxHref(filters: InboxFilters, ticketId?: string): string {
  const params = new URLSearchParams();
  if (ticketId) params.set("ticket", ticketId);
  if (filters.show !== "all") params.set("show", filters.show);
  if (filters.query) params.set("q", filters.query);
  const query = params.toString();
  return query ? `/admin/tickets?${query}` : "/admin/tickets";
}

// Admin's ticket inbox (T21; the redesign's "Kotak masuk" since D1, the user's mock "Admin-Support"):
// a white card with its heading and the search, then one row per ticket, in the order the inbox
// function gives: tickets waiting for HomeKlin first, urgent before normal, oldest first; then answered
// and closed ones. Each row shows who asked, how long ago, the question (and its order number), its
// urgency and status in words, and how many messages the chat has; the whole row opens the chat
// beside the list, keeping the filters. The open row has a forest bar on its left edge and
// aria-current. The search is a plain GET form, so it works without JavaScript.
export async function TicketInbox({ tickets, selectedId, filters, codes }: TicketInboxProps) {
  const [t, tChat, format, locale] = await Promise.all([
    getTranslations("AdminTicketsPage"),
    getTranslations("SupportChat"),
    getFormatter(),
    getLocale(),
  ]);
  const now = new Date();

  return (
    <section aria-labelledby="inbox-title" className="flex min-w-0 flex-col overflow-hidden rounded-lg bg-card">
      <div className="flex flex-col gap-3 px-5 pt-4 pb-3">
        <h2 id="inbox-title" className="font-display text-lg font-semibold text-ink">
          {t("inboxTitle")}
        </h2>
        <form method="get" action={getPathname({ href: "/admin/tickets", locale })} role="search" className="relative">
          {filters.show !== "all" ? <input type="hidden" name="show" value={filters.show} /> : null}
          <label htmlFor="inbox-search" className="sr-only">
            {t("search.label")}
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <input
            id="inbox-search"
            type="search"
            name="q"
            defaultValue={filters.query}
            key={filters.query}
            placeholder={t("search.placeholder")}
            maxLength={80}
            autoComplete="off"
            enterKeyHint="search"
            className="h-11 w-full rounded-sm border border-border-control bg-field pr-3.5 pl-10.5 text-base text-ink caret-primary transition-colors duration-150 ease-out-quart placeholder:text-ink-muted hover:border-primary lg:text-sm"
          />
        </form>
      </div>

      {tickets.length === 0 ? (
        <p className="flex items-start gap-2 border-t border-border px-5 py-4 text-sm text-ink-muted">
          <SearchX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {t("search.none")}{" "}
            <Link href={inboxHref({ show: "all", query: "" }, selectedId ?? undefined)} className="font-semibold text-primary underline underline-offset-4 hover:decoration-2">
              {t("search.clear")}
            </Link>
          </span>
        </p>
      ) : (
        <ul aria-label={t("listLabel")} className="flex flex-col">
          {tickets.map((ticket) => {
            const current = ticket.id === selectedId;
            const code = ticket.orderId ? codes.get(ticket.orderId) : undefined;
            return (
              <li key={ticket.id} className="border-t border-border">
                <Link
                  href={inboxHref(filters, ticket.id)}
                  aria-current={current ? "true" : undefined}
                  className={`relative flex min-h-21 flex-col gap-1.5 px-5 py-3.5 transition-colors duration-150 ease-out-quart focus-visible:-outline-offset-2 ${
                    current ? "bg-field" : "hover:bg-field active:bg-sunken"
                  }`}
                >
                  {current ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.75 bg-primary" /> : null}
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-semibold text-ink">{ticket.customerName || t("customerFallback")}</span>
                    <time dateTime={ticket.createdAt} className="shrink-0 text-xs text-ink-muted tabular-nums">
                      {format.relativeTime(new Date(ticket.createdAt), now)}
                    </time>
                  </span>
                  <span className="line-clamp-2 text-sm leading-snug break-words text-ink-muted">
                    {code ? <span className="font-medium text-ink">{code} · </span> : null}
                    {ticket.question}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {ticket.urgency === "urgent" ? <UrgentPill label={tChat("urgent")} /> : null}
                    <TicketStatusPill status={ticket.status} label={tChat(`status.${ticket.status}`)} />
                    <span className="inline-flex items-center gap-1 text-xs text-ink-muted tabular-nums">
                      <MessageSquareText className="size-3.5 shrink-0" aria-hidden="true" />
                      {t("messageCount", { count: ticket.messageCount })}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
