import { CircleCheck, Info, LayoutGrid } from "lucide-react";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Notice } from "@/components/admin/notice";
import { StatusPill } from "@/components/back-office/status-pill";
import { servicePhoto } from "@/components/customer/service-photos";
import { EmptyState } from "@/components/ui/empty-state";
import { CatalogError } from "@/lib/catalog/catalog";
import { getCatalogServices } from "@/lib/catalog/cached";
import { splitDuration } from "@/lib/catalog/customer-duration";
import { formatRupiah } from "@/lib/format";
import { panel } from "./styles";

const cell = "px-4 py-3 align-middle";
const headCell = "px-4 py-3 text-left text-xs font-semibold text-ink-muted";

// "Layanan" (D2, after the mock Partner-Services), read-only: HomeKlin's active services with their
// type, duration and the one customer price admin sets. The mock lets an agency choose which services
// it offers, but nothing in the app stores such a choice: every active service can be booked in every
// area an agency serves, so each row says "Ditawarkan" and the note under the list says why
// (docs/redesign-gaps-partner.md). The agency's fee per service is not shown either: its share is set
// by the owner and an agency cannot read it before a job is finished. The catalog is public, cached
// data (the same list customers see), so this reads no agency data at all.
export async function ServicesContent() {
  const [t, tPhotos, locale] = await Promise.all([getTranslations("AgencyServicesPage"), getTranslations("ServicePhotos"), getLocale()]);

  let services: Awaited<ReturnType<typeof getCatalogServices>>;
  try {
    services = await getCatalogServices();
  } catch (error) {
    if (!(error instanceof CatalogError)) throw error;
    console.error(error);
    return (
      <Notice tone="danger" title={t("errorTitle")}>
        {t("errorBody")}
      </Notice>
    );
  }
  if (services.length === 0) {
    return (
      <EmptyState tone="forest" icon={LayoutGrid} title={t("emptyTitle")}>
        {t("emptyBody")}
      </EmptyState>
    );
  }

  return (
    <>
      <section aria-labelledby="services-title" className={`${panel} overflow-hidden`}>
        <h2 id="services-title" className="sr-only">
          {t("listTitle")}
        </h2>
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead className="hidden bg-sunken md:table-header-group">
            <tr>
              <th scope="col" className={headCell}>
                {t("table.service")}
              </th>
              <th scope="col" className={headCell}>
                {t("table.duration")}
              </th>
              <th scope="col" className={`${headCell} text-right`}>
                {t("table.price")}
              </th>
              <th scope="col" className={headCell}>
                {t("table.offered")}
              </th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => {
              const photo = servicePhoto(service.id);
              const duration = t("durationValue", splitDuration(service.durationMinutes));
              const price = formatRupiah(service.priceIdr, locale);
              const offered = <StatusPill Icon={CircleCheck} pill="bg-success-surface text-success" label={t("offered")} />;
              return (
                <tr key={service.id} data-service={service.id} className="border-t border-border">
                  <td className={cell}>
                    <span className="flex items-center gap-3">
                      {photo ? (
                        <Image
                          src={photo.photo.src}
                          width={88}
                          height={88}
                          sizes="44px"
                          alt={tPhotos(photo.key)}
                          className="size-11 shrink-0 rounded-sm bg-sunken object-cover"
                          style={{ objectPosition: photo.photo.focus }}
                        />
                      ) : (
                        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-sunken text-mint">
                          <LayoutGrid className="size-5" />
                        </span>
                      )}
                      <span className="flex min-w-0 flex-col">
                        <span className="font-semibold text-ink">{service.name[locale]}</span>
                        <span className="text-xs text-ink-muted">{t("type", { type: t(`categories.${service.category}`) })}</span>
                        {/* Phones: duration, price and status under the name, so nothing scrolls sideways. */}
                        <span className="mt-2 flex flex-col items-start gap-1.5 md:hidden">
                          <span className="text-ink tabular-nums">
                            {duration}, <span className="font-semibold">{price}</span>
                          </span>
                          {offered}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className={`${cell} hidden text-ink md:table-cell`}>{duration}</td>
                  <td className={`${cell} hidden text-right font-semibold whitespace-nowrap text-ink tabular-nums md:table-cell`}>{price}</td>
                  <td className={`${cell} hidden md:table-cell`}>{offered}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <p className="flex max-w-prose items-start gap-2 text-sm text-ink-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        {t("note")}
      </p>
    </>
  );
}
