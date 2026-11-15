import { CircleAlert, MessageCircleQuestionMark, Minus, Plus, SearchX } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import type { FaqEntry } from "@/lib/support/support";

type FaqResultsProps = {
  /** The entries found, or null when the FAQ could not be read. */
  entries: FaqEntry[] | null;
  /** The search words; empty shows every entry. */
  query: string;
};

// The FAQ on /support (T19), in the page's language: every published entry, or the ones matching the
// search, as native disclosures (keyboard and screen-reader support for free; one or more open at a
// time). A "+" in a tinted circle marks a closed question and a filled "-" the open one. No match and
// a failed read each say so plainly; the contact panel below is the way on from both.
export async function FaqResults({ entries, query }: FaqResultsProps) {
  const [t, locale] = await Promise.all([getTranslations("SupportPage"), getLocale()]);

  if (entries === null) {
    return (
      <EmptyState tone="forest" icon={CircleAlert} title={t("faq.errorTitle")}>
        {t("faq.errorBody")}
        <span className="mt-4 flex justify-center">
          {/* A plain link on purpose: a full page load reads the FAQ again. */}
          <a
            href=""
            className="inline-flex min-h-touch items-center justify-center rounded-full bg-card inset-ring-1 inset-ring-border-control px-5 text-sm font-semibold text-ink transition-colors duration-150 ease-out-quart hover:bg-sunken active:bg-lime-wash"
          >
            {t("faq.retry")}
          </a>
        </span>
      </EmptyState>
    );
  }

  if (entries.length === 0) {
    return query ? (
      <div className="flex flex-col gap-3">
        <EmptyState tone="forest" icon={SearchX} title={t("faq.emptyTitle")}>
          {t("faq.emptyBody")}
        </EmptyState>
        <ShowAll label={t("search.clear")} />
      </div>
    ) : (
      <EmptyState tone="forest" icon={MessageCircleQuestionMark} title={t("faq.noEntriesTitle")}>
        {t("faq.noEntriesBody")}
      </EmptyState>
    );
  }

  return (
    <section aria-labelledby="faq-judul" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="faq-judul" className="font-display text-lg font-semibold text-ink">
          {query ? t("faq.resultsTitle", { count: entries.length, query }) : t("faq.allTitle")}
        </h2>
        {query ? <ShowAll label={t("search.clear")} /> : null}
      </div>
      <div className="flex flex-col border-t border-border">
        {entries.map((entry) => (
          <details key={entry.id} className="group border-b border-border last:border-b-0">
            <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-4 -mx-2 rounded-md px-2 py-4 text-base font-semibold text-ink transition-colors duration-150 ease-out-quart hover:bg-sunken active:bg-lime-wash [&::-webkit-details-marker]:hidden">
              {entry.question[locale]}
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lime-wash text-primary transition-colors duration-150 ease-out-quart group-open:bg-primary group-open:text-on-primary"
              >
                <Plus className="size-4 group-open:hidden" strokeWidth={2.5} />
                <Minus className="hidden size-4 group-open:block" strokeWidth={2.5} />
              </span>
            </summary>
            <p className="max-w-prose pb-4 text-base text-ink-muted">{entry.answer[locale]}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function ShowAll({ label }: { label: string }) {
  return (
    <Link
      href="/support"
      className="inline-flex min-h-touch w-fit items-center rounded-full text-sm font-semibold text-primary transition-colors duration-150 ease-out-quart hover:text-band hover:underline active:text-ink"
    >
      {label}
    </Link>
  );
}
