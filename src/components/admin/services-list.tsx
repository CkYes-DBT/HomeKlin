import { Check, ChevronDown, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ServiceVisual } from "@/components/customer/service-visual";
import { Link } from "@/i18n/navigation";
import type { AdminService } from "@/lib/catalog/admin";
import { aboutDuration } from "@/lib/catalog/admin-duration";
import { formatRupiah } from "@/lib/format";

type ServicesListProps = {
  services: readonly AdminService[];
};

// HomeKlin's services and the one price list (R3, the redesign's "Layanan dan harga"): one white card
// of rows, each a native <details> whose <summary> is the row, so a click, Enter or Space opens the
// service's panel without any script. Rows cannot live in a <table>, so this is a list: each summary
// says all its own values in its accessible name ("Ubah layanan Pembersihan Rutin, Jenis: Seluruh
// rumah, Sekitar 2 jam, Rp 85.000, Aktif, Urutan 1"), and the column header row above is for the eye
// only (aria-hidden), so a screen reader meets each fact once. The panel is read-only for now; R4 puts
// the edit form in it.
//
// Columns (from 768 px): picture, service, duration (from 1280 px; under the name below that), price,
// status, order, chevron. Below 768 px a row stacks: picture, name with type and duration, then price
// and status; the order moves into the panel. Header and rows share one grid template.
const columns =
  "md:grid-cols-[--spacing(10)_minmax(0,1fr)_--spacing(30)_--spacing(35)_--spacing(15)_--spacing(11)] xl:grid-cols-[--spacing(10)_minmax(0,1fr)_--spacing(50)_--spacing(30)_--spacing(35)_--spacing(15)_--spacing(11)]";

export function ServicesList({ services }: ServicesListProps) {
  const t = useTranslations("AdminServicesPage");

  return (
    <div className="overflow-hidden rounded-lg bg-card">
      <div
        data-testid="services-header"
        aria-hidden="true"
        className={`hidden items-center gap-x-4 bg-sunken px-5 py-3 text-xs font-semibold text-ink md:grid ${columns}`}
      >
        <span>{t("list.photo")}</span>
        <span>{t("list.service")}</span>
        <span className="hidden xl:block">{t("list.duration")}</span>
        <span className="text-right">{t("list.price")}</span>
        <span>{t("list.status")}</span>
        <span className="text-right">{t("list.order")}</span>
        <span className="sr-only">{t("list.edit")}</span>
      </div>
      <ul aria-label={t("list.label")} className="divide-y divide-border">
        {services.map((service) => (
          <li key={service.id}>
            <ServiceRow service={service} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ServiceRow({ service }: { service: AdminService }) {
  const t = useTranslations("AdminServicesPage");
  const tDuration = useTranslations("AdminServicesPage.duration");
  const locale = useLocale();
  const name = locale === "en" ? service.name.en : service.name.id;
  const duration = aboutDuration(service.durationMinutes, tDuration);
  const price = formatRupiah(service.priceIdr, locale);
  const label = "text-xs font-semibold text-ink-muted";

  return (
    <details className="group">
      {/* The ring is drawn inside the row (negative offset), so the card's rounded clip never cuts it. */}
      <summary
        className={`grid cursor-pointer list-none grid-cols-[--spacing(10)_minmax(0,1fr)_--spacing(11)] items-center gap-x-3 gap-y-2 py-3 pr-2 pl-4 text-sm transition-colors duration-150 ease-out-quart group-open:bg-field hover:bg-field focus-visible:rounded-lg focus-visible:-outline-offset-2 active:bg-sunken md:gap-x-4 md:px-5 [&::-webkit-details-marker]:hidden ${columns}`}
      >
        {/* Decorative: the name sits right beside it. */}
        <span aria-hidden="true" className="col-start-1 row-start-1 self-start md:col-start-auto md:row-start-auto md:self-center">
          <ServiceVisual service={service} tone="sunken" sizes="40px" className="size-10 rounded-sm" iconClassName="size-5" />
        </span>

        <span className="col-start-2 row-start-1 flex min-w-0 flex-col md:col-start-auto md:row-start-auto">
          <span className="font-semibold text-ink">
            <span className="sr-only">{t("row.open")} </span>
            <span>{name}</span>
          </span>
          <span className="text-xs text-ink-muted">
            {t("row.category", { category: t(`categories.${service.category}`) })}
            {/* Below 1280 px the duration has no column of its own: its own line on a phone, after a
                dot from 768 px. The dot travels with it, so a wrapped line never ends on a dot. */}
            <span className="block whitespace-nowrap md:inline xl:hidden">
              <span aria-hidden="true" className="hidden md:inline">
                {" "}
                ·{" "}
              </span>
              {duration}
            </span>
          </span>
        </span>

        <span className="hidden text-ink xl:block">{duration}</span>

        {/* One line under the name on a phone; two cells of the grid from 768 px. */}
        <span className="col-start-2 row-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 md:contents">
          <span className="font-semibold whitespace-nowrap text-ink tabular-nums md:text-right">{price}</span>
          <span className="md:justify-self-start">
            <StatusChip active={service.isActive} />
          </span>
        </span>

        <span data-testid="service-order" className="hidden text-right text-ink tabular-nums md:block">
          <span className="sr-only">{t("row.order")} </span>
          {service.sortOrder}
        </span>

        <span
          data-testid="row-chevron"
          aria-hidden="true"
          className="col-start-3 row-span-2 row-start-1 flex size-touch items-center justify-center justify-self-end text-ink-muted transition-[rotate] duration-150 ease-out-quart group-open:rotate-180 motion-reduce:transition-none md:col-start-auto md:row-span-1 md:row-start-auto"
        >
          <ChevronDown className="size-5" strokeWidth={2} />
        </span>
      </summary>

      {/* Read-only for now (R3); R4 replaces this with the edit form. */}
      <div className="flex flex-col gap-4 bg-field pt-1 pr-4 pb-5 pl-17 md:pr-5 md:pl-19">
        <dl className="grid gap-4 text-sm md:grid-cols-2 md:gap-x-8">
          <div>
            <dt className={label}>{t("panel.nameId")}</dt>
            <dd lang="id" className="text-ink">
              {service.name.id}
            </dd>
          </div>
          <div>
            <dt className={label}>{t("panel.nameEn")}</dt>
            <dd lang="en" className="text-ink">
              {service.name.en}
            </dd>
          </div>
          <div>
            <dt className={label}>{t("panel.descriptionId")}</dt>
            <dd lang="id" className="max-w-prose text-ink">
              {service.description.id}
            </dd>
          </div>
          <div>
            <dt className={label}>{t("panel.descriptionEn")}</dt>
            <dd lang="en" className="max-w-prose text-ink">
              {service.description.en}
            </dd>
          </div>
          <div data-testid="panel-order" className="md:hidden">
            <dt className={label}>{t("panel.order")}</dt>
            <dd className="text-ink tabular-nums">{service.sortOrder}</dd>
          </div>
        </dl>
        <Link
          href={`/admin/services/edit?id=${service.id}`}
          className="inline-flex min-h-touch items-center gap-1.5 self-start rounded-full border-[1.5px] border-outline px-5 text-sm font-semibold text-ink transition-[background-color,color,transform] duration-150 ease-out-quart hover:bg-primary hover:text-on-primary active:scale-[0.98]"
        >
          <Pencil className="size-4 shrink-0" aria-hidden="true" />
          {t("edit")}
          <span className="sr-only"> {name}</span>
        </Link>
      </div>
    </details>
  );
}

/** Aktif or Draf, always a word with an icon, never the colour alone. */
function StatusChip({ active }: { active: boolean }) {
  const t = useTranslations("AdminServicesPage.row");
  const Icon = active ? Check : Pencil;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
        active ? "bg-success-surface text-success" : "bg-warning-surface text-warning"
      }`}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" strokeWidth={2.5} />
      {active ? t("active") : t("draft")}
    </span>
  );
}
