import { Check, ChevronDown, ImageOff, Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ServiceVisual } from "@/components/customer/service-visual";
import type { AdminService } from "@/lib/catalog/admin";
import { aboutDuration } from "@/lib/catalog/admin-duration";
import { formatRupiah } from "@/lib/format";
import { serviceToFormValues, type ServiceFormValues } from "@/lib/validation/service";
import { ServiceCreatePanel, ServiceEditPanel } from "./service-panel";

type Categories = readonly { value: string; label: string }[];

type ServicesListProps = {
  services: readonly AdminService[];
  /** The service types for the forms' select, in the page's language. */
  categories: Categories;
  /** At /admin/services?new: the empty form to add a service, open at the top (R5). */
  create?: ServiceFormValues;
  /**
   * New on every server render of the page (a random id). Every panel is keyed on it, so each answer
   * from the server, above all the redirect after a save or an add (even to the same address), draws
   * the panels anew: closed, back on the stored values, with no message left from an earlier refusal.
   */
  renderId: string;
};

// HomeKlin's services and the one price list (R3, the redesign's "Layanan dan harga"): one white card
// of rows, each a native <details> whose <summary> is the row, so a click, Enter or Space opens the
// service's panel without any script. The panel is the service's edit form (R4, service-panel.tsx).
// Rows cannot live in a <table>, so this is a list: each summary says all its own values in its
// accessible name ("Ubah layanan Pembersihan Rutin, Jenis: Seluruh rumah, Sekitar 2 jam, Rp 85.000,
// Aktif, Urutan 1"), and the column header row above is for the eye only (aria-hidden), so a screen
// reader meets each fact once. At ?new an open "Layanan baru" panel sits above the rows (R5). Every
// server render draws the panels anew (renderId), so a save or an add always comes back to closed rows.
//
// Columns (from 768 px): picture, service, duration (from 1280 px; under the name below that), price,
// status, order, chevron. Below 768 px a row stacks: picture, name with type and duration, then price
// and status; the order moves into the panel. Header and rows share one grid template.
const columns =
  "md:grid-cols-[--spacing(10)_minmax(0,1fr)_--spacing(30)_--spacing(35)_--spacing(15)_--spacing(11)] xl:grid-cols-[--spacing(10)_minmax(0,1fr)_--spacing(50)_--spacing(30)_--spacing(35)_--spacing(15)_--spacing(11)]";

export function ServicesList({ services, categories, create, renderId }: ServicesListProps) {
  const t = useTranslations("AdminServicesPage");

  return (
    <div className="overflow-hidden rounded-lg bg-card">
      {create ? (
        <div className="border-b border-border">
          <ServiceCreatePanel
            key={renderId}
            initial={create}
            categories={categories}
            summary={<CreateSummary />}
            photo={<CurrentPhoto />}
            // For the eye the summary says what the panel is; this is the heading to jump to.
            heading={<h2 className="sr-only">{t("create.title")}</h2>}
          />
        </div>
      ) : null}
      {services.length > 0 ? (
        <>
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
          </div>
          <ul aria-label={t("list.label")} className="divide-y divide-border">
            {services.map((service) => {
              return (
                <li key={service.id}>
                  <ServiceEditPanel
                    key={renderId}
                    initial={serviceToFormValues(service)}
                    categories={categories}
                    summary={<ServiceSummary service={service} />}
                    photo={<CurrentPhoto service={service} />}
                    ownPhoto={Boolean(service.photoUrl)}
                  />
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}

const chevronClass =
  "flex size-touch items-center justify-center justify-self-end text-ink-muted transition-[rotate] duration-150 ease-out-quart group-open:rotate-180 motion-reduce:transition-none";

/** The create panel's own row: what it is and its chevron. Its heading sits in the panel (service-panel.tsx). */
function CreateSummary() {
  const t = useTranslations("AdminServicesPage.create");
  return (
    <summary className="flex cursor-pointer list-none items-center gap-3 py-3 pr-2 pl-4 transition-colors duration-150 ease-out-quart group-open:bg-field hover:bg-field focus-visible:rounded-lg focus-visible:-outline-offset-2 active:bg-sunken md:gap-4 md:px-5 [&::-webkit-details-marker]:hidden">
      {/* An icon well on a light surface (lime-wash): the header's "Tambah layanan" pill is the one full
          lime action on screen (markdown/design.md). */}
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

function ServiceSummary({ service }: { service: AdminService }) {
  const t = useTranslations("AdminServicesPage");
  const tDuration = useTranslations("AdminServicesPage.duration");
  const locale = useLocale();
  const name = locale === "en" ? service.name.en : service.name.id;
  const duration = aboutDuration(service.durationMinutes, tDuration);
  const price = formatRupiah(service.priceIdr, locale);

  return (
    // The ring is drawn inside the row (negative offset), so the card's rounded clip never cuts it.
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
        className={`col-start-3 row-span-2 row-start-1 md:col-start-auto md:row-span-1 md:row-start-auto ${chevronClass}`}
      >
        <ChevronDown className="size-5" strokeWidth={2} />
      </span>
    </summary>
  );
}

/**
 * What the service card shows now, for the panel's photo field (D1, the mock "Admin-ServiceNew"; B10):
 * the service's own photo, else the app's photo for it, else its type's icon; a new service has none yet.
 */
function CurrentPhoto({ service }: { service?: AdminService }) {
  if (service) return <ServiceVisual service={service} tone="sunken" sizes="44px" className="size-touch rounded-sm" iconClassName="size-5" />;
  return (
    <span aria-hidden="true" className="flex size-touch shrink-0 items-center justify-center rounded-sm bg-sunken text-ink-muted">
      <ImageOff className="size-5" strokeWidth={1.75} />
    </span>
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
