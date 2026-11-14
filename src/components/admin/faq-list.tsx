import { Check, ChevronDown, Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { faqToFormValues, type AdminFaqEntry, type FaqFormValues } from "@/lib/validation/faq";
import { FaqCreatePanel, FaqEditPanel } from "./faq-panel";

type FaqListProps = {
  entries: readonly AdminFaqEntry[];
  /** At /admin/faq?new: the empty form to add an entry, open at the top. */
  create?: FaqFormValues;
  /** New on every server render, so each answer from the server draws the panels anew (services-list.tsx). */
  renderId: string;
};

// HomeKlin's FAQ for admin (D1, the user's mock "Admin-Faq"): one white card of rows, as the services
// list (R3): each row a native <details> whose <summary> shows the order, the question in the page's
// language with its keywords, and the status, and opens the entry's edit panel. The column header row
// is for the eye only (aria-hidden); each summary says its own facts in its accessible name. At ?new
// an open "Pertanyaan baru" panel sits above the rows.
//
// Columns (from 768 px): order, question, status, chevron. Below 768 px a row stacks the status under
// the question.
const columns = "md:grid-cols-[--spacing(16)_minmax(0,1fr)_--spacing(32)_--spacing(11)]";

const chevronClass =
  "flex size-touch items-center justify-center justify-self-end text-ink-muted transition-[rotate] duration-150 ease-out-quart group-open:rotate-180 motion-reduce:transition-none";

const summaryClass =
  "cursor-pointer list-none transition-colors duration-150 ease-out-quart group-open:bg-field hover:bg-field focus-visible:rounded-lg focus-visible:-outline-offset-2 active:bg-sunken [&::-webkit-details-marker]:hidden";

export function FaqList({ entries, create, renderId }: FaqListProps) {
  const t = useTranslations("AdminFaqPage");
  return (
    <div className="overflow-hidden rounded-lg bg-card">
      {create ? (
        <div className="border-b border-border">
          <FaqCreatePanel key={renderId} initial={create} summary={<CreateSummary />} heading={<h2 className="sr-only">{t("create.title")}</h2>} />
        </div>
      ) : null}
      {entries.length > 0 ? (
        <>
          <div aria-hidden="true" className={`hidden items-center gap-x-4 bg-sunken px-5 py-3 text-xs font-semibold text-ink md:grid ${columns}`}>
            <span>{t("list.order")}</span>
            <span>{t("list.question")}</span>
            <span>{t("list.status")}</span>
            <span className="text-right">{t("list.edit")}</span>
          </div>
          <ul aria-label={t("list.label")} className="divide-y divide-border">
            {entries.map((entry) => (
              <li key={entry.id} data-faq={entry.id}>
                <FaqEditPanel key={renderId} initial={faqToFormValues(entry)} summary={<EntrySummary entry={entry} />} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function CreateSummary() {
  const t = useTranslations("AdminFaqPage.create");
  return (
    <summary className={`flex items-center gap-3 py-3 pr-2 pl-4 md:gap-4 md:px-5 ${summaryClass}`}>
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-lime-wash text-on-lime-wash">
        <Plus className="size-5" strokeWidth={2.5} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-base font-semibold text-ink">{t("title")}</span>
        <span className="text-xs text-ink-muted">{t("description")}</span>
      </span>
      <span aria-hidden="true" className={chevronClass}>
        <ChevronDown className="size-5" strokeWidth={2} />
      </span>
    </summary>
  );
}

function EntrySummary({ entry }: { entry: AdminFaqEntry }) {
  const t = useTranslations("AdminFaqPage");
  const locale = useLocale();
  const question = locale === "en" ? entry.question.en : entry.question.id;

  return (
    <summary
      className={`grid grid-cols-[--spacing(8)_minmax(0,1fr)_--spacing(11)] items-center gap-x-3 gap-y-2 py-3 pr-2 pl-4 text-sm md:gap-x-4 md:px-5 ${summaryClass} ${columns}`}
    >
      <span className="col-start-1 row-start-1 self-start pt-0.5 text-ink tabular-nums md:col-start-auto md:row-start-auto md:self-center md:pt-0">
        <span className="sr-only">{t("row.order")} </span>
        {entry.sortOrder}
      </span>
      <span className="col-start-2 row-start-1 flex min-w-0 flex-col gap-0.5 md:col-start-auto md:row-start-auto">
        <span className="font-semibold break-words text-ink">
          <span className="sr-only">{t("row.open")} </span>
          {question}
        </span>
        {entry.keywords ? <span className="text-xs break-words text-ink-muted">{t("row.keywords", { keywords: entry.keywords })}</span> : null}
      </span>
      <span className="col-start-2 row-start-2 md:col-start-auto md:row-start-auto">
        <PublishChip published={entry.isPublished} />
      </span>
      <span aria-hidden="true" className={`col-start-3 row-span-2 row-start-1 md:col-start-auto md:row-span-1 md:row-start-auto ${chevronClass}`}>
        <ChevronDown className="size-5" strokeWidth={2} />
      </span>
    </summary>
  );
}

/** Dipublikasikan or Draf, always a word with an icon, never the colour alone. */
function PublishChip({ published }: { published: boolean }) {
  const t = useTranslations("AdminFaqPage.row");
  const Icon = published ? Check : Pencil;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
        published ? "bg-success-surface text-success" : "bg-warning-surface text-warning"
      }`}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" strokeWidth={2.5} />
      {published ? t("published") : t("draft")}
    </span>
  );
}
