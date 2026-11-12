import type { Metadata } from "next";
import { MonitorPlay, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { cache, Suspense } from "react";
import { Notice } from "@/components/admin/notice";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { monitorCounts, waitingForCheckIn } from "@/components/back-office/admin-console";
import { CheckInTile, FeedTile } from "@/components/back-office/feed-tile";
import { getSlotLabels } from "@/components/customer/slot-labels";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ClientMessages } from "@/i18n/client-messages";
import { getCatalogServices, getServiceAreas } from "@/lib/catalog/cached";
import { JobsError, listAdminJobs, type AdminJob } from "@/lib/jobs/jobs";
import { listLiveStreams, StreamError, type LiveStream } from "@/lib/stream/streams";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminMonitorPage");
  return { title: t("title") };
}

// Admins only (T5). The live monitor (T25; M1 after the user's mock "Admin-Live"): one grid of cards,
// as many columns of at least 300 px as fit (one on a phone). Each live stream is a card with its
// video; each of today's jobs whose cleaner has not checked in yet is a card too ("Belum check-in",
// H1). The summary line under the title counts them as the page read them. live_streams() and
// admin_jobs() answer admins (live_streams() also agencies, their own); this page's own role check
// keeps everyone else out, and each video link is made for this admin by stream_for_viewer()
// (src/components/back-office/feed-tile.tsx). The list is read when the page opens; "Perbarui daftar"
// reads it again, while each live card keeps its status current on its own.
// The title is prerendered; the summary, the refresh link and the cards render inside role checks
// (a layout's check would not protect them).
export default function AdminMonitorPage() {
  const t = useTranslations("AdminMonitorPage");
  return (
    <>
      <PageHeader
        size="compact"
        title={t("title")}
        description={
          <Suspense fallback={null}>
            <RoleGate roles={["admin"]}>
              <MonitorSummary />
            </RoleGate>
          </Suspense>
        }
        action={
          <Suspense fallback={<GateFallback variant="action" />}>
            <RoleGate roles={["admin"]}>
              <RefreshLink />
            </RoleGate>
          </Suspense>
        }
      />
      <Suspense fallback={<GateFallback />}>
        <RoleGate roles={["admin"]}>
          <MonitorCards />
        </RoleGate>
      </Suspense>
    </>
  );
}

type MonitorData = {
  /** null when the streams could not be read. */
  streams: LiveStream[] | null;
  /** Today's jobs not checked in yet; null when the jobs could not be read. */
  waiting: AdminJob[] | null;
};

// Both lists at once, read once per request: the summary and the cards share the result.
const readMonitor = cache(async (): Promise<MonitorData> => {
  const client = await createSupabaseServerClient({ writeCookies: false });
  const [streams, jobs] = await Promise.allSettled([listLiveStreams(client), listAdminJobs(client)]);
  // Only a failed read becomes a message; anything else (such as Next.js' own signals) goes on.
  for (const result of [streams, jobs]) {
    if (result.status === "rejected" && !(result.reason instanceof StreamError || result.reason instanceof JobsError)) throw result.reason;
    if (result.status === "rejected") console.error("[monitor] could not read the list:", result.reason);
  }
  return {
    streams: streams.status === "fulfilled" ? streams.value : null,
    waiting: jobs.status === "fulfilled" ? waitingForCheckIn(jobs.value, new Date()) : null,
  };
});

/** "6 pekerjaan sedang berlangsung. 2 terkendala." and, when there are any, "1 belum check-in." */
async function MonitorSummary() {
  const [t, { streams, waiting }] = await Promise.all([getTranslations("AdminMonitorPage"), readMonitor()]);
  if (!streams) return null;
  const counts = monitorCounts(streams, waiting?.length ?? 0);
  return (
    <span data-testid="monitor-summary">
      {t("summary", counts)}
      {counts.waiting > 0 ? ` ${t("summaryWaiting", counts)}` : null}
    </span>
  );
}

// A plain link on purpose: a full page load reads the list again and makes fresh video links.
async function RefreshLink() {
  const t = await getTranslations("AdminMonitorPage");
  return (
    <a
      href=""
      className="inline-flex min-h-touch items-center gap-2 rounded-full border border-border-control bg-card px-4 text-sm font-semibold text-ink transition-colors duration-150 ease-out-quart hover:bg-sunken active:bg-lime-wash"
    >
      <RefreshCw className="size-4 shrink-0" aria-hidden="true" />
      {t("refresh")}
    </a>
  );
}

async function MonitorCards() {
  const [t, locale, { streams, waiting }] = await Promise.all([getTranslations("AdminMonitorPage"), getLocale(), readMonitor()]);

  const notices = (
    <>
      {streams ? null : (
        <Notice tone="danger" title={t("errorTitle")}>
          {t("errorBody")}
        </Notice>
      )}
      {waiting ? null : (
        <Notice tone="info" title={t("jobsErrorTitle")}>
          {t("jobsErrorBody")}
        </Notice>
      )}
    </>
  );

  const live = streams ?? [];
  const late = waiting ?? [];
  if (live.length === 0 && late.length === 0) {
    return (
      <>
        {notices}
        {/* The wording is about jobs in progress, which holds even when the waiting list failed. */}
        {streams ? (
          <EmptyState tone="forest" icon={MonitorPlay} title={t("emptyTitle")}>
            {t("emptyBody")}
          </EmptyState>
        ) : null}
      </>
    );
  }

  const [services, areas, labels] = await Promise.all([getCatalogServices(), getServiceAreas(), getSlotLabels(locale)]);
  const names = (job: { serviceId: string; areaId: string }) => ({
    serviceName: services.find((service) => service.id === job.serviceId)?.name[locale],
    areaName: areas.find((area) => area.id === job.areaId)?.name[locale],
  });

  return (
    <ClientMessages namespaces={["AdminMonitorPage"]}>
      {notices}
      <ul aria-label={t("gridLabel")} className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,--spacing(75)),1fr))] gap-5">
        {live.map((stream) => (
          <FeedTile key={stream.sessionId} stream={stream} {...names(stream)} />
        ))}
        {late.map((job) => (
          <CheckInTile key={job.id} job={job} startsAt={labels.time(job.startsAt)} {...names(job)} />
        ))}
      </ul>
    </ClientMessages>
  );
}
