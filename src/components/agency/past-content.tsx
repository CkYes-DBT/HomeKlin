import { CalendarClock, CircleCheck, SearchX, ShieldCheck, VideoOff, type LucideIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Notice } from "@/components/admin/notice";
import { StatusPill } from "@/components/back-office/status-pill";
import { jakartaDayOf } from "@/components/customer/booking-query";
import { getSlotLabels } from "@/components/customer/slot-labels";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { AgencyError, getMyAgency } from "@/lib/agency/agency";
import { getCatalogServices, getServiceAreas } from "@/lib/catalog/cached";
import { formatRupiah } from "@/lib/format";
import { JobsError, listAgencyJobs, type AgencyJob } from "@/lib/jobs/jobs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatAgencyDate, matchesSearch, parsePastRecording, parseSearch, pastJobs, type PastRecording } from "./agency-views";
import { DetailArrow, FilterLinks, Initials, SearchField } from "./agency-ui";
import { NoAgency } from "./no-agency";
import { backOfficeRecordingState, type BackOfficeRecordingState } from "./recording-state";
import { jakartaDateOf } from "./schedule-time";
import { panel } from "./styles";

type SearchParams = Record<string, string | string[] | undefined>;

const cell = "px-4 py-3 align-middle";
const headCell = "px-4 py-3 text-left text-xs font-semibold text-ink-muted";

const recordingPills: Record<BackOfficeRecordingState, { Icon: LucideIcon; pill: string }> = {
  available: { Icon: CalendarClock, pill: "bg-success-surface text-success" },
  expired: { Icon: ShieldCheck, pill: "bg-sunken text-ink-muted" },
  none: { Icon: VideoOff, pill: "bg-sunken text-ink-muted" },
};

/** Where a finished job's recording stands, as a pill with a word: "Tersedia sampai 8 Nov". */
export async function RecordingPill({ job, now }: { job: Pick<AgencyJob, "recordingId" | "recordingExpiresAt" | "recordingDeleted">; now: number }) {
  const [t, locale] = await Promise.all([getTranslations("AgencyPastPage"), getLocale()]);
  const state = backOfficeRecordingState(job, now);
  const { Icon, pill } = recordingPills[state];
  const label =
    state === "available" && job.recordingExpiresAt
      ? t("recording.available", { day: formatAgencyDate(jakartaDateOf(job.recordingExpiresAt), locale, "short") })
      : t(`recording.${state === "expired" ? "expired" : "none"}`);
  return <StatusPill Icon={Icon} pill={pill} label={label} />;
}

type Read = { jobs: AgencyJob[] } | null;

// "Pesanan selesai" (D2, after the mock Partner-Past): the jobs the agency's cleaners finished, latest
// first, with who did them, where the recording stands (kept until when, deleted after 7 days, or
// none) and the agency's fee for each (from order_fees once check-out wrote it, else the expected fee,
// marked "perkiraan"; B4), a recording filter (?recording=) and a search (?q=, also by order number).
// Read with the agency's own session: agency_jobs() lists its own jobs only, with their fees.
export async function PastContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [t, locale, params] = await Promise.all([getTranslations("AgencyPastPage"), getLocale(), searchParams]);
  const recording = parsePastRecording(params.recording);
  const query = parseSearch(params.q);

  let data: Read;
  try {
    const client = await createSupabaseServerClient({ writeCookies: false });
    if (!(await getMyAgency(client))) data = null;
    else {
      data = { jobs: await listAgencyJobs(client) };
    }
  } catch (error) {
    // Only a failed read becomes a message; anything else (such as Next.js' own signals) goes on.
    if (!(error instanceof JobsError || error instanceof AgencyError)) throw error;
    console.error(error);
    return (
      <Notice tone="danger" title={t("errorTitle")}>
        {t("errorBody")}
      </Notice>
    );
  }
  if (!data) return <NoAgency title={t("noAgencyTitle")} body={t("noAgencyBody")} />;

  const now = new Date();
  const [services, areas, labels] = await Promise.all([getCatalogServices(), getServiceAreas(), getSlotLabels(locale)]);
  const serviceName = (id: string) => services.find((service) => service.id === id)?.name[locale];
  const areaName = (id: string) => areas.find((area) => area.id === id)?.name[locale] ?? id;

  const rows = pastJobs(data.jobs, recording, now.getTime()).filter((job) =>
    matchesSearch([serviceName(job.serviceId), areaName(job.areaId), job.address, job.cleanerName, job.orderCode], query),
  );

  const filterHref = (next: PastRecording | null) => ({
    pathname: "/agency/past",
    query: { ...(next ? { recording: next } : {}), ...(query ? { q: query } : {}) },
  });
  const filters = ([null, "available", "deleted"] as const).map((key) => ({
    key: key ?? "all",
    label: t(`filter.${key ?? "all"}`),
    href: filterHref(key),
    current: key === recording,
  }));

  return (
    <>
      <section aria-labelledby="past-title" className={`${panel} flex min-w-0 flex-col overflow-hidden`}>
        <h2 id="past-title" className="sr-only">
          {t("listTitle")}
        </h2>
        <div className="flex flex-col gap-4 px-5 pt-5 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <FilterLinks label={t("filterLabel")} options={filters} />
          <SearchField
            id="past-search"
            label={t("searchLabel")}
            placeholder={t("searchPlaceholder")}
            submit={t("searchSubmit")}
            value={query}
            keep={recording ? { recording } : {}}
          />
        </div>
        <p className="px-5 pb-3 text-sm text-ink-muted">
          {query ? t("countSearch", { count: rows.length, query }) : t("count", { count: rows.length })}
        </p>
        {rows.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState tone="forest" icon={query ? SearchX : CircleCheck} title={t(query ? "searchEmptyTitle" : recording ? "filterEmptyTitle" : "emptyTitle")}>
              {t(query ? "searchEmptyBody" : recording ? "filterEmptyBody" : "emptyBody")}
            </EmptyState>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{t("caption")}</caption>
            <thead className="hidden bg-sunken md:table-header-group">
              <tr>
                <th scope="col" className={headCell}>
                  {t("table.order")}
                </th>
                <th scope="col" className={headCell}>
                  {t("table.finished")}
                </th>
                <th scope="col" className={`${headCell} hidden lg:table-cell`}>
                  {t("table.cleaner")}
                </th>
                <th scope="col" className={headCell}>
                  {t("table.recording")}
                </th>
                <th scope="col" className={`${headCell} text-right`}>
                  {t("table.fee")}
                </th>
                <th scope="col" className={headCell}>
                  <span className="sr-only">{t("table.detail")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((job) => {
                const service = serviceName(job.serviceId) ?? t("serviceFallback");
                const finished = job.completedAt ?? job.endsAt;
                const day = formatAgencyDate(jakartaDayOf(finished, now).date, locale, "weekday");
                const detail = { pathname: "/agency/past/job", query: { order: job.id } };
                const feeAmount = formatRupiah(job.agencyFeeIdr, locale);
                const feeText = job.agencyFeeFinal ? feeAmount : t("feeEstimate", { fee: feeAmount });
                const cleaner = job.cleanerName ? (
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Initials name={job.cleanerName} />
                    <span className="min-w-0 text-ink">{job.cleanerName}</span>
                  </span>
                ) : (
                  <span className="text-ink-muted">{t("noCleaner")}</span>
                );
                return (
                  <tr key={job.id} data-job={job.id} className="border-t border-border transition-colors duration-150 ease-out-quart hover:bg-field">
                    <td className={cell}>
                      <Link href={detail} className="font-semibold text-ink underline decoration-border-control underline-offset-4 transition-colors duration-150 ease-out-quart hover:decoration-primary active:text-band">
                        {service}
                      </Link>
                      <span className="mt-0.5 block text-xs text-ink-muted">{`${job.orderCode}, ${areaName(job.areaId)}`}</span>
                      <span className="mt-0.5 block text-xs text-ink-muted">{job.address}</span>
                      <span className="mt-3 flex flex-col items-start gap-2 md:hidden">
                        <span className="text-ink tabular-nums">{t("finishedValue", { day, window: labels.window(job) })}</span>
                        {cleaner}
                        <RecordingPill job={job} now={now.getTime()} />
                        <span className="text-ink tabular-nums">{t("feeValue", { fee: feeText })}</span>
                      </span>
                    </td>
                    <td className={`${cell} hidden whitespace-nowrap text-ink tabular-nums md:table-cell`}>
                      <span className="block">{day}</span>
                      <span className="block text-xs text-ink-muted">{t("windowValue", { window: labels.window(job) })}</span>
                      <span className="mt-1 block lg:hidden">{cleaner}</span>
                    </td>
                    <td className={`${cell} hidden lg:table-cell`}>{cleaner}</td>
                    <td className={`${cell} hidden md:table-cell`}>
                      <RecordingPill job={job} now={now.getTime()} />
                    </td>
                    <td className={`${cell} hidden text-right whitespace-nowrap text-ink tabular-nums md:table-cell`}>
                      {feeAmount}
                      {job.agencyFeeFinal ? null : <span className="block text-xs text-ink-muted">{t("estimate")}</span>}
                    </td>
                    <td className={`${cell} w-14 text-right`}>
                      <DetailArrow href={detail} label={t("detailFor", { service, day })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
