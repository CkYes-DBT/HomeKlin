import { CircleCheck, Clock, Wallet } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Notice } from "@/components/admin/notice";
import { StatusPill } from "@/components/back-office/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { AgencyError, getMyAgency } from "@/lib/agency/agency";
import { getCatalogServices } from "@/lib/catalog/cached";
import { formatRupiah } from "@/lib/format";
import {
  getAgencyFeesByCleaner,
  getAgencyFeesByService,
  getAgencyFeesDaily,
  getAgencySummary,
  listAgencyPayouts,
  PayoutError,
  type AgencyFeesDailyRow,
  type AgencyPayoutsListRow,
  type AgencySummary,
  type ValidDays,
} from "@/lib/payouts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { chartScale, dailySeries, formatAgencyDate, formatRupiahCompact, parseDays, type DailyFee } from "./agency-views";
import { FilterLinks, Panel } from "./agency-ui";
import { NoAgency } from "./no-agency";
import { jakartaToday } from "./schedule-time";

type SearchParams = Record<string, string | string[] | undefined>;

const shownPayouts = 5;

/** The range toggle beside the title: 7, 30 or 90 days, as links (?days=). */
export async function SummaryRange({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [t, params] = await Promise.all([getTranslations("AgencySummaryPage"), searchParams]);
  const days = parseDays(params.days);
  return (
    <FilterLinks
      label={t("rangeLabel")}
      options={([7, 30, 90] as const).map((option) => ({
        key: String(option),
        label: t("range", { days: option }),
        href: option === 30 ? "/agency" : { pathname: "/agency", query: { days: String(option) } },
        current: option === days,
      }))}
    />
  );
}

type SummaryData = {
  summary: AgencySummary;
  daily: AgencyFeesDailyRow[];
  byCleaner: { id: string; name: string; feeIdr: number; sharePercent: number }[];
  byService: { id: string; name: string; feeIdr: number; sharePercent: number }[];
  payouts: AgencyPayoutsListRow[];
};

// "Ringkasan" (D2, after the mock Partner-Summary): what the agency earned in the chosen range (T40:
// agency_summary and friends, SECURITY INVOKER, so row-level security keeps every number to this
// agency), as four numbers, the daily fees of the last 14 days as bars, the fees per cleaner and per
// service, and the payouts from HomeKlin. Every chart has its numbers in words too: a text summary for
// screen readers and an open-able table of the days, so nothing is shown by bar length alone.
export async function SummaryContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [t, locale, params] = await Promise.all([getTranslations("AgencySummaryPage"), getLocale(), searchParams]);
  const days = parseDays(params.days);

  let data: SummaryData | null;
  try {
    const client = await createSupabaseServerClient({ writeCookies: false });
    data = (await getMyAgency(client)) ? await readSummary(client, days, locale) : null;
  } catch (error) {
    // Only a failed read becomes a message; anything else (such as Next.js' own signals) goes on.
    if (!(error instanceof AgencyError || error instanceof PayoutError)) throw error;
    console.error(error);
    return (
      <Notice tone="danger" title={t("errorTitle")}>
        {t("errorBody")}
      </Notice>
    );
  }
  if (!data) return <NoAgency title={t("noAgencyTitle")} body={t("noAgencyBody")} />;

  const money = (amount: number) => formatRupiah(amount, locale);
  const { summary } = data;
  const paid = Math.max(summary.totalFeeIdr - summary.pendingIdr, 0);
  const today = jakartaToday(new Date());
  const series = dailySeries(data.daily, today, days === 7 ? 7 : 14);

  return (
    <>
      <ul aria-label={t("statsLabel", { days })} className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,--spacing(50)),1fr))] gap-4">
        <Stat label={t("stats.total")} value={money(summary.totalFeeIdr)} hint={t("stats.totalHint", { days })} />
        <Stat label={t("stats.jobs")} value={String(summary.jobsCount)} hint={t("stats.jobsHint")} />
        <Stat label={t("stats.average")} value={money(Math.round(summary.avgFeeIdr))} hint={t("stats.averageHint")} />
        <Stat label={t("stats.pending")} value={money(summary.pendingIdr)} hint={t("stats.pendingHint", { paid: money(paid) })} />
      </ul>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <DailyChart series={series} />
        <ShareList id="by-cleaner" title={t("byCleanerTitle")} total={summary.totalFeeIdr} days={days} rows={data.byCleaner} empty={t("byCleanerEmpty")} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] xl:items-start">
        <ShareList id="by-service" title={t("byServiceTitle")} total={summary.totalFeeIdr} days={days} rows={data.byService} empty={t("byServiceEmpty")} />
        <Payouts payouts={data.payouts} />
      </div>
    </>
  );
}

async function readSummary(client: Awaited<ReturnType<typeof createSupabaseServerClient>>, days: ValidDays, locale: "id" | "en"): Promise<SummaryData> {
  // The daily bars always cover the last 14 days (7 in the 7-day range), so they read 30 days.
  const [summary, daily, byCleaner, byService, payouts, services] = await Promise.all([
    getAgencySummary(client, days),
    getAgencyFeesDaily(client, days === 7 ? 7 : 30),
    getAgencyFeesByCleaner(client, days),
    getAgencyFeesByService(client, days),
    listAgencyPayouts(client, shownPayouts),
    getCatalogServices(),
  ]);
  return {
    summary,
    daily,
    byCleaner: byCleaner.map((row) => ({ id: row.cleanerId, name: row.fullName, feeIdr: row.feeIdr, sharePercent: row.sharePercent })),
    // The database names a service in Indonesian only; the catalog has both languages.
    byService: byService.map((row) => ({
      id: row.serviceId,
      name: services.find((service) => service.id === row.serviceId)?.name[locale] ?? row.serviceName,
      feeIdr: row.feeIdr,
      sharePercent: row.sharePercent,
    })),
    payouts,
  };
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-lg bg-card p-5">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="font-display text-2xl font-semibold text-ink tabular-nums">{value}</span>
      <span className="text-sm text-ink-muted tabular-nums">{hint}</span>
    </li>
  );
}

async function DailyChart({ series }: { series: DailyFee[] }) {
  const [t, locale] = await Promise.all([getTranslations("AgencySummaryPage"), getLocale()]);
  const money = (amount: number) => formatRupiah(amount, locale);
  const max = Math.max(0, ...series.map((day) => day.feeIdr));
  const scale = chartScale(max);
  const first = series[0];
  const last = series[series.length - 1];
  const span = { from: formatAgencyDate(first.date, locale, "short"), to: formatAgencyDate(last.date, locale, "short") };
  const total = series.reduce((sum, day) => sum + day.feeIdr, 0);
  const highest = series.reduce((best, day) => (day.feeIdr > best.feeIdr ? day : best), first);
  // What the bars say, in one sentence for screen readers (the bars themselves are hidden from them).
  const sentence =
    max === 0
      ? t("daily.noneSentence", { count: series.length })
      : t("daily.sentence", {
          count: series.length,
          total: money(total),
          high: money(highest.feeIdr),
          highDay: formatAgencyDate(highest.date, locale, "short"),
        });
  // Month names under the first day of each month shown, as in the mock ("Okt", "Nov").
  const monthOf = (date: string) => formatAgencyDate(date, locale, "short").split(" ")[1];

  return (
    <Panel id="daily-title" title={t("daily.title")} description={t("daily.description", { count: series.length, ...span })}>
      <p className="sr-only">{sentence}</p>
      <div aria-hidden="true" className="flex gap-3">
        <div className="relative h-44 w-16 shrink-0 text-xs text-ink-muted tabular-nums">
          {scale.ticks.map((tick) => (
            <span key={tick} className="absolute right-0 translate-y-1/2" style={{ bottom: `${scale.top ? (tick / scale.top) * 100 : 0}%` }}>
              {formatRupiahCompact(tick, locale)}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="relative h-44 border-b border-border-control">
            {scale.ticks.slice(1).map((tick) => (
              <span key={tick} className="absolute inset-x-0 border-t border-dashed border-border" style={{ bottom: `${(tick / scale.top) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-1 sm:gap-2">
              {series.map((day) => (
                <span
                  key={day.date}
                  data-day={day.date}
                  className="flex-1 rounded-t-sm bg-mint"
                  style={{ height: scale.top ? `${(day.feeIdr / scale.top) * 100}%` : "0%" }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-1 text-center text-xs text-ink-muted tabular-nums sm:gap-2">
            {series.map((day) => (
              <span key={day.date} className="min-w-0 flex-1">
                {Number(day.date.slice(8))}
              </span>
            ))}
          </div>
          <div className="flex justify-between text-xs font-semibold text-ink">
            <span>{monthOf(first.date)}</span>
            {monthOf(last.date) !== monthOf(first.date) ? <span>{monthOf(last.date)}</span> : null}
          </div>
        </div>
      </div>
      <details className="group text-sm">
        <summary className="inline-flex min-h-touch cursor-pointer items-center rounded-sm font-semibold text-primary underline-offset-4 hover:underline">
          {t("daily.showTable")}
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{t("daily.title")}</caption>
            <thead className="bg-sunken">
              <tr>
                <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-ink">
                  {t("daily.day")}
                </th>
                <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-ink">
                  {t("daily.fee")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {series.map((day) => (
                <tr key={day.date}>
                  <td className="px-3 py-2 text-ink">{formatAgencyDate(day.date, locale, "weekday")}</td>
                  <td className="px-3 py-2 text-right text-ink tabular-nums">{money(day.feeIdr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Panel>
  );
}

async function ShareList({
  id,
  title,
  total,
  days,
  rows,
  empty,
}: {
  id: string;
  title: string;
  total: number;
  days: ValidDays;
  rows: SummaryData["byCleaner"];
  empty: string;
}) {
  const [t, locale] = await Promise.all([getTranslations("AgencySummaryPage"), getLocale()]);
  const percent = new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-ID", { maximumFractionDigits: 1 });
  return (
    <Panel id={id} title={title} description={t("shareDescription", { days, total: formatRupiah(total, locale) })}>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-1.5">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                <span className="min-w-0 font-semibold text-ink">{row.name}</span>
                <span className="text-ink tabular-nums">
                  <span className="font-semibold">{formatRupiah(row.feeIdr, locale)}</span>{" "}
                  <span className="text-ink-muted">({percent.format(row.sharePercent)}%)</span>
                </span>
              </span>
              {/* The bar repeats the percentage beside it; it carries no meaning of its own. */}
              <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-sunken">
                <span className="block h-full rounded-full bg-mint" style={{ width: `${Math.min(Math.max(row.sharePercent, 0), 100)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

async function Payouts({ payouts }: { payouts: AgencyPayoutsListRow[] }) {
  const [t, locale] = await Promise.all([getTranslations("AgencySummaryPage"), getLocale()]);
  return (
    <Panel id="payouts-title" title={t("payouts.title")} description={t("payouts.description")}>
      {payouts.length === 0 ? (
        <EmptyState tone="forest" icon={Wallet} title={t("payouts.emptyTitle")}>
          {t("payouts.emptyBody")}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{t("payouts.title")}</caption>
            <thead>
              <tr>
                <th scope="col" className="pb-2 text-left text-xs font-semibold text-ink-muted">
                  {t("payouts.date")}
                </th>
                <th scope="col" className="pb-2 text-left text-xs font-semibold text-ink-muted">
                  {t("payouts.amount")}
                </th>
                <th scope="col" className="pb-2 text-right text-xs font-semibold text-ink-muted">
                  {t("payouts.status")}
                </th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => {
                const date = payout.payoutDate ?? payout.periodEnd;
                return (
                  <tr key={payout.id} data-payout={payout.id} className="border-t border-border">
                    <td className="py-3.5 pr-3 text-ink tabular-nums">
                      <span className="block">{formatAgencyDate(date, locale, "long")}</span>
                      <span className="block text-xs text-ink-muted">
                        {t("payouts.period", {
                          from: formatAgencyDate(payout.periodStart, locale, "short"),
                          to: formatAgencyDate(payout.periodEnd, locale, "short"),
                          count: payout.jobsCount,
                        })}
                      </span>
                    </td>
                    <td className="py-3.5 pr-3 font-semibold whitespace-nowrap text-ink tabular-nums">{formatRupiah(payout.amountIdr, locale)}</td>
                    <td className="py-3.5 text-right">
                      {payout.status === "paid" ? (
                        <StatusPill Icon={CircleCheck} pill="bg-success-surface text-success" label={t("payouts.paid")} />
                      ) : (
                        <StatusPill Icon={Clock} pill="bg-warning-surface text-warning" label={t("payouts.pending")} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
