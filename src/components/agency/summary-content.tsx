import { CircleCheck, Clock, Wallet } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Notice } from "@/components/admin/notice";
import { StatusPill } from "@/components/back-office/status-pill";
import { DailyBars, ShareBars, StatTile } from "@/components/back-office/summary-pieces";
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
import { dailySeries, formatAgencyDate, parseDays, type DailyFee } from "./agency-views";
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
        <StatTile label={t("stats.total")} value={money(summary.totalFeeIdr)} hint={t("stats.totalHint", { days })} />
        <StatTile label={t("stats.jobs")} value={String(summary.jobsCount)} hint={t("stats.jobsHint")} />
        <StatTile label={t("stats.average")} value={money(Math.round(summary.avgFeeIdr))} hint={t("stats.averageHint")} />
        <StatTile label={t("stats.pending")} value={money(summary.pendingIdr)} hint={t("stats.pendingHint", { paid: money(paid) })} />
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

async function DailyChart({ series }: { series: DailyFee[] }) {
  const [t, locale] = await Promise.all([getTranslations("AgencySummaryPage"), getLocale()]);
  const money = (amount: number) => formatRupiah(amount, locale);
  const max = Math.max(0, ...series.map((day) => day.feeIdr));
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

  return (
    <Panel id="daily-title" title={t("daily.title")} description={t("daily.description", { count: series.length, ...span })}>
      <DailyBars
        series={series.map((day) => ({ date: day.date, amountIdr: day.feeIdr }))}
        locale={locale}
        sentence={sentence}
        table={{
          show: t("daily.showTable"),
          caption: t("daily.title"),
          columns: [t("daily.day"), t("daily.fee")],
          rows: series.map((day) => ({ key: day.date, cells: [formatAgencyDate(day.date, locale, "weekday"), money(day.feeIdr)] })),
        }}
      />
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
  return (
    <Panel id={id} title={title} description={t("shareDescription", { days, total: formatRupiah(total, locale) })}>
      <ShareBars rows={rows.map((row) => ({ id: row.id, name: row.name, amountIdr: row.feeIdr, sharePercent: row.sharePercent }))} locale={locale} empty={empty} />
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
