import type { Metadata } from "next";
import { ArrowLeft, MessageCircleOff, MessagesSquare, MousePointerClick } from "lucide-react";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CloseTicket } from "@/components/admin/close-ticket";
import { filterInbox, inboxCounts, inboxViews, parseInboxFilters, type InboxView } from "@/components/admin/inbox-filters";
import { InboxLive } from "@/components/admin/inbox-live";
import { Notice } from "@/components/admin/notice";
import { inboxHref, TicketInbox } from "@/components/admin/ticket-inbox";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { getAdminJobs } from "@/components/back-office/admin-data";
import { SubmitOnChangeSelect } from "@/components/back-office/submit-on-change";
import { jakartaDayOf } from "@/components/customer/booking-query";
import { getSlotLabels } from "@/components/customer/slot-labels";
import { parseSupportQuery } from "@/components/support/support-query";
import { TicketChat } from "@/components/support/ticket-chat";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ClientMessages } from "@/i18n/client-messages";
import { getPathname, Link } from "@/i18n/navigation";
import { listAllServices } from "@/lib/catalog/admin";
import { CatalogError } from "@/lib/catalog/catalog";
import { JobsError, type AdminJob } from "@/lib/jobs/jobs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTicket, listInbox, SupportError, type InboxTicket } from "@/lib/support/support";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminTicketsPage");
  return { title: t("title") };
}

type SearchParams = PageProps<"/[locale]/admin/tickets">["searchParams"];

// Admin's ticket inbox (T21), admins only (T5). The title is prerendered; the rest renders inside the
// page's own role check (a layout's check would not protect it) and is read with the admin's own
// session: the inbox through the admin-only inbox function, the chat through row-level security.
// On a desk the list and the open chat (/admin/tickets?ticket=<id>) sit side by side; below 1024 px
// one shows at a time, with a way back to the list. New tickets and messages arrive through Realtime.
// The redesign (D1, the user's mock "Admin-Support"): "Tampilkan" in the header (every ticket, those
// waiting for an answer, the closed ones) and a search in the inbox card, both as query parameters;
// a chat about an order names it ("Pesanan HK-1042, ...") and links to its detail page, from
// admin_jobs().
export default function AdminTicketsPage({ searchParams }: PageProps<"/[locale]/admin/tickets">) {
  const t = useTranslations("AdminTicketsPage");
  return (
    <>
      <PageHeader
        size="compact"
        title={t("title")}
        description={t("description")}
        action={
          <Suspense fallback={<GateFallback variant="action" />}>
            <RoleGate roles={["admin"]}>
              <ShowFilter searchParams={searchParams} />
            </RoleGate>
          </Suspense>
        }
      />
      <Suspense fallback={<GateFallback />}>
        <RoleGate roles={["admin"]}>
          <AdminTicketsContent searchParams={searchParams} />
        </RoleGate>
      </Suspense>
    </>
  );
}

async function AdminTicketsContent({ searchParams }: { searchParams: SearchParams }) {
  const [t, params, supabase] = await Promise.all([
    getTranslations("AdminTicketsPage"),
    searchParams,
    createSupabaseServerClient({ writeCookies: false }),
  ]);
  const { ticketId } = parseSupportQuery(params);
  const filters = parseInboxFilters(params);

  let inbox: InboxTicket[];
  let selected: Awaited<ReturnType<typeof getTicket>> = null;
  try {
    [inbox, selected] = await Promise.all([listInbox(supabase), ticketId ? getTicket(supabase, ticketId) : null]);
  } catch (error) {
    // Only a failed read becomes a message; anything else (such as Next.js' own signals) goes on.
    if (!(error instanceof SupportError)) throw error;
    console.error(error);
    return (
      <Notice tone="danger" title={t("errorTitle")}>
        {t("errorBody")}
      </Notice>
    );
  }

  const waiting = inbox.filter((ticket) => ticket.status === "open").length;
  const jobs = await readJobs();
  const codes = new Map(jobs.map((job) => [job.id, job.orderCode]));
  const shown = filterInbox(inbox, filters, codes);
  const order = selected ? await orderOf(jobs, selected.ticket.orderId) : undefined;
  const live = (
    <InboxLive
      labels={{
        connected: t("live.connected"),
        connecting: t("live.connecting"),
        offline: t("live.offline"),
        reload: t("live.reload"),
      }}
    />
  );

  if (inbox.length === 0 && !ticketId) {
    return (
      <>
        {live}
        <EmptyState tone="forest" icon={MessagesSquare} title={t("emptyTitle")}>
          {t("emptyBody")}
        </EmptyState>
      </>
    );
  }

  const customerName = selected ? inbox.find((ticket) => ticket.id === selected.ticket.id)?.customerName : undefined;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <p className="text-sm font-medium text-ink">{t("summary", { waiting })}</p>
        {live}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(20rem,25rem)_minmax(0,1fr)]">
        <div className={ticketId ? "hidden lg:block" : ""}>
          <TicketInbox tickets={shown} selectedId={selected?.ticket.id ?? null} filters={filters} codes={codes} />
        </div>
        <div className={ticketId ? "flex flex-col gap-2" : "hidden lg:block"}>
          {ticketId ? (
            <Link
              href={inboxHref(filters)}
              className="inline-flex min-h-touch w-fit items-center gap-2 rounded-full pr-3 text-sm font-semibold text-primary underline underline-offset-4 transition-colors duration-150 ease-out-quart hover:decoration-2 active:text-ink lg:hidden"
            >
              <ArrowLeft className="size-4.5 shrink-0" aria-hidden="true" />
              {t("back")}
            </Link>
          ) : null}
          {!ticketId ? (
            <EmptyState tone="forest" icon={MousePointerClick} title={t("pickTitle")}>
              {t("pickBody")}
            </EmptyState>
          ) : !selected ? (
            <EmptyState tone="forest" icon={MessageCircleOff} title={t("notFoundTitle")}>
              {t("notFoundBody")}
            </EmptyState>
          ) : (
            <ClientMessages namespaces={["SupportChat"]}>
              <TicketChat
                key={selected.ticket.id}
                viewer="admin"
                ticket={{
                  id: selected.ticket.id,
                  status: selected.ticket.status,
                  urgency: selected.ticket.urgency,
                  createdAt: selected.ticket.createdAt,
                  orderId: selected.ticket.orderId,
                }}
                messages={selected.messages}
                customerName={customerName || t("customerFallback")}
                order={order}
                actions={
                  <CloseTicket
                    key={selected.ticket.id}
                    ticketId={selected.ticket.id}
                    labels={{
                      button: t("close.button"),
                      question: t("close.question"),
                      confirm: t("close.confirm"),
                      cancel: t("close.cancel"),
                      pending: t("close.pending"),
                      error: t("close.error"),
                    }}
                  />
                }
              />
            </ClientMessages>
          )}
        </div>
      </div>
    </>
  );
}

/** The paid jobs, for the order numbers and the chat's order line; none when they cannot be read. */
async function readJobs(): Promise<AdminJob[]> {
  try {
    return await getAdminJobs();
  } catch (error) {
    if (!(error instanceof JobsError)) throw error;
    console.error("[tickets] could not read the jobs:", error);
    return [];
  }
}

/** "Pesanan HK-1042, Pembersihan Rutin, Kamis, 5 November 09.00" and the order's page, if known. */
async function orderOf(jobs: readonly AdminJob[], orderId: string | null): Promise<{ line: string; href: string } | undefined> {
  const job = orderId ? jobs.find((candidate) => candidate.id === orderId) : undefined;
  if (!job) return undefined;
  const [t, locale, supabase] = await Promise.all([
    getTranslations("AdminTicketsPage"),
    getLocale(),
    createSupabaseServerClient({ writeCookies: false }),
  ]);
  const labels = await getSlotLabels(locale);
  let service: string | undefined;
  try {
    service = (await listAllServices(supabase)).find((item) => item.id === job.serviceId)?.name[locale];
  } catch (error) {
    if (!(error instanceof CatalogError)) throw error;
  }
  const when = `${labels.day({ date: jakartaDayOf(job.startsAt, new Date()).date, relative: null })} ${labels.time(job.startsAt)}`;
  return {
    line: service ? t("orderLine", { code: job.orderCode, service, when }) : t("orderLineShort", { code: job.orderCode, when }),
    href: `/admin/orders/${job.orderCode}`,
  };
}

/** "Tampilkan": every ticket, those waiting for an answer, the closed ones, each with its count. */
async function ShowFilter({ searchParams }: { searchParams: SearchParams }) {
  const [t, locale, params, supabase] = await Promise.all([
    getTranslations("AdminTicketsPage"),
    getLocale(),
    searchParams,
    createSupabaseServerClient({ writeCookies: false }),
  ]);
  const filters = parseInboxFilters(params);
  const { ticketId } = parseSupportQuery(params);
  let counts: Record<InboxView, number> | null = null;
  try {
    counts = inboxCounts(await listInbox(supabase));
  } catch (error) {
    if (!(error instanceof SupportError)) throw error;
  }
  const label = (view: InboxView) => (counts ? t("show.withCount", { view: t(`show.${view}`), count: counts[view] }) : t(`show.${view}`));
  return (
    <form method="get" action={getPathname({ href: "/admin/tickets", locale })} className="flex flex-wrap items-center gap-2">
      {ticketId ? <input type="hidden" name="ticket" value={ticketId} /> : null}
      {filters.query ? <input type="hidden" name="q" value={filters.query} /> : null}
      <label htmlFor="inbox-show" className="text-xs font-medium text-ink-muted">
        {t("show.label")}
      </label>
      <SubmitOnChangeSelect
        id="inbox-show"
        name="show"
        value={filters.show}
        options={inboxViews.map((view) => ({ value: view, label: label(view) }))}
        className="h-11 min-w-48 rounded-sm bg-card pr-10 pl-3.5 text-sm text-ink inset-ring inset-ring-border-control transition-colors duration-150 ease-out-quart hover:inset-ring-primary"
      />
      <noscript>
        <button
          type="submit"
          className="inline-flex min-h-touch items-center rounded-full border-[1.5px] border-outline px-4 text-sm font-semibold text-ink hover:bg-card"
        >
          {t("show.apply")}
        </button>
      </noscript>
    </form>
  );
}
