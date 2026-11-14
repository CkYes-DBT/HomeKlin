import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Notice } from "@/components/admin/notice";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { adminRecordingState } from "@/components/back-office/admin-console";
import { getAdminJobs } from "@/components/back-office/admin-data";
import { findOrderTicket, parseOrderCode } from "@/components/back-office/admin-order";
import { OrderBackLink, OrderDetail } from "@/components/back-office/order-detail";
import { jakartaDayOf } from "@/components/customer/booking-query";
import { getSlotLabels } from "@/components/customer/slot-labels";
import { EmptyState } from "@/components/ui/empty-state";
import { ClientMessages } from "@/i18n/client-messages";
import { listAllServices } from "@/lib/catalog/admin";
import { aboutDuration } from "@/lib/catalog/admin-duration";
import { getServiceAreas } from "@/lib/catalog/cached";
import { CatalogError } from "@/lib/catalog/catalog";
import { formatRupiah } from "@/lib/format";
import { JobsError } from "@/lib/jobs/jobs";
import { listLiveStreams, StreamError, type LiveStream } from "@/lib/stream/streams";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listInbox, SupportError, type InboxTicket } from "@/lib/support/support";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminOrderPage");
  return { title: t("title") };
}

// One sample order number, so the build can prerender the page's shell: the admin shell reads the
// address in client components (usePathname), which needs the params known at build time. Every real
// order number is rendered on request; for the sample only the shell is built (all content is behind
// the role check and read at request time) (node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/dynamic-routes.md, "With Cache Components").
export function generateStaticParams() {
  return [{ code: "HK-1001" }];
}

type Params = PageProps<"/[locale]/admin/orders/[code]">["params"];

// One order for admin (D1, after the user's mocks "Admin-Order" and "Admin-Order-Issue"), reached from
// the order number on each live monitor card: /admin/orders/HK-1042. Admins only (T5): everything,
// the title too (it is the service's name), renders inside the page's own role check, and every read
// uses the admin's own session, so the database decides what admin may see: admin_jobs() (paid
// orders), live_streams(), the ticket inbox, and the full service list. The order number is checked
// against its format before any lookup. The params are runtime data, so they are read inside
// <Suspense> (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md).
export default function AdminOrderPage({ params }: PageProps<"/[locale]/admin/orders/[code]">) {
  return (
    <Suspense fallback={<GateFallback />}>
      <RoleGate roles={["admin"]}>
        <OrderContent params={params} />
      </RoleGate>
    </Suspense>
  );
}

/** Only a failed read becomes a message; anything else (such as Next.js' own signals) goes on. */
function readFailed(error: unknown): boolean {
  return error instanceof JobsError || error instanceof StreamError || error instanceof SupportError || error instanceof CatalogError;
}

async function OrderContent({ params }: { params: Params }) {
  const [{ code: raw }, t, locale] = await Promise.all([params, getTranslations("AdminOrderPage"), getLocale()]);
  const code = parseOrderCode(raw);
  const supabase = await createSupabaseServerClient({ writeCookies: false });

  let job;
  try {
    job = code ? (await getAdminJobs()).find((candidate) => candidate.orderCode === code) : undefined;
  } catch (error) {
    if (!readFailed(error)) throw error;
    console.error("[order] could not read the jobs:", error);
    return <ErrorNotice title={t("errorTitle")} body={t("errorBody")} back={t("back")} />;
  }
  if (!job) return <NotFound title={t("notFoundTitle")} body={t("notFoundBody")} back={t("back")} />;

  // The stream, the chat and the services are extras: the page still shows the order when one fails.
  const [streams, inbox, services] = await Promise.allSettled([listLiveStreams(supabase), listInbox(supabase), listAllServices(supabase)]);
  for (const result of [streams, inbox, services]) {
    if (result.status === "rejected" && !readFailed(result.reason)) throw result.reason;
    if (result.status === "rejected") console.error("[order] could not read part of the order:", result.reason);
  }
  const stream: LiveStream | null = streams.status === "fulfilled" ? (streams.value.find((item) => item.orderId === job.id) ?? null) : null;
  const ticket: InboxTicket | undefined = inbox.status === "fulfilled" ? findOrderTicket(inbox.value, job.id) : undefined;
  const service = services.status === "fulfilled" ? services.value.find((item) => item.id === job.serviceId) : undefined;

  const [areas, labels, tDuration, tMonitor] = await Promise.all([
    getServiceAreas(),
    getSlotLabels(locale),
    getTranslations("AdminServicesPage.duration"),
    getTranslations("AdminMonitorPage"),
  ]);
  const now = new Date();

  return (
    <ClientMessages namespaces={["AdminMonitorPage"]}>
      <OrderDetail
        job={job}
        stream={stream}
        serviceName={service?.name[locale] ?? tMonitor("serviceFallback")}
        duration={service ? aboutDuration(service.durationMinutes, tDuration) : null}
        listPrice={service ? formatRupiah(service.priceIdr, locale) : null}
        areaName={areas.find((area) => area.id === job.areaId)?.name[locale]}
        day={labels.day({ date: jakartaDayOf(job.startsAt, now).date, relative: null })}
        window={labels.window(job)}
        time={labels.time}
        recording={adminRecordingState(job, now)}
        ticket={ticket ? { id: ticket.id, customerName: ticket.customerName } : null}
      />
    </ClientMessages>
  );
}

function NotFound({ title, body, back }: { title: string; body: string; back: string }) {
  return (
    <div className="flex flex-col gap-6">
      <OrderBackLink label={back} />
      <h1 className="sr-only">{title}</h1>
      <EmptyState tone="forest" icon={SearchX} title={title}>
        {body}
      </EmptyState>
    </div>
  );
}

function ErrorNotice({ title, body, back }: { title: string; body: string; back: string }) {
  return (
    <div className="flex flex-col gap-6">
      <OrderBackLink label={back} />
      <h1 className="sr-only">{title}</h1>
      <Notice tone="danger" title={title}>
        {body}
      </Notice>
    </div>
  );
}
