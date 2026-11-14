import { Info, LayoutGrid } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Notice } from "@/components/admin/notice";
import { ServiceVisual } from "@/components/customer/service-visual";
import { EmptyState } from "@/components/ui/empty-state";
import { ClientMessages } from "@/i18n/client-messages";
import { saveAgencyServices } from "@/lib/agency/actions";
import { AgencyError, getMyAgency, listAgencyServiceChoices, type AgencyServiceChoice } from "@/lib/agency/agency";
import { CatalogError, type Service } from "@/lib/catalog/catalog";
import { getCatalogServices } from "@/lib/catalog/cached";
import { splitDuration } from "@/lib/catalog/customer-duration";
import { formatRupiah } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NoAgency } from "./no-agency";
import { ServicesChoice, type ServiceChoiceRow } from "./services-choice";

type Read = { services: Service[]; choices: AgencyServiceChoice[] } | null;

// "Layanan" (D2, after the mock Partner-Services; B12): HomeKlin's active services with their photo,
// type, duration and the one customer price admin sets, and whether this agency offers each, which it
// changes with "Ubah pilihan" (ServicesChoice). The facts come from the public catalog (cached, the
// same list customers see); the choice from agency_service_choices(), read with the agency's own
// session, which answers for the caller's own agency only. A draft service ("belum tersedia" in the
// mock) is not listed: the agency can read active services only (docs/redesign-gaps-partner.md).
export async function ServicesContent() {
  const [t, locale] = await Promise.all([getTranslations("AgencyServicesPage"), getLocale()]);

  let data: Read;
  try {
    const client = await createSupabaseServerClient({ writeCookies: false });
    if (!(await getMyAgency(client))) data = null;
    else {
      const [services, choices] = await Promise.all([getCatalogServices(), listAgencyServiceChoices(client)]);
      data = { services, choices };
    }
  } catch (error) {
    // Only a failed read becomes a message; anything else (such as Next.js' own signals) goes on.
    if (!(error instanceof CatalogError || error instanceof AgencyError)) throw error;
    console.error(error);
    return (
      <Notice tone="danger" title={t("errorTitle")}>
        {t("errorBody")}
      </Notice>
    );
  }
  if (!data) return <NoAgency title={t("noAgencyTitle")} body={t("noAgencyBody")} />;

  // The catalog's order; a service the choice list does not know (just switched off) is left out.
  const choiceOf = new Map(data.choices.map((choice) => [choice.serviceId, choice]));
  const services = data.services.filter((service) => choiceOf.has(service.id));
  if (services.length === 0) {
    return (
      <EmptyState tone="forest" icon={LayoutGrid} title={t("emptyTitle")}>
        {t("emptyBody")}
      </EmptyState>
    );
  }

  const restricted = data.choices.some((choice) => choice.restricted);
  const rows: ServiceChoiceRow[] = services.map((service) => ({
    id: service.id,
    name: service.name[locale],
    type: t("type", { type: t(`categories.${service.category}`) }),
    duration: t("durationValue", splitDuration(service.durationMinutes)),
    price: formatRupiah(service.priceIdr, locale),
    visual: <ServiceVisual service={service} tone="sunken" sizes="44px" className="size-11 shrink-0 rounded-sm" iconClassName="size-5" />,
    offered: choiceOf.get(service.id)?.offered === true,
  }));

  return (
    <ClientMessages namespaces={["AgencyServicesPage", "AgencyErrors"]}>
      <ServicesChoice rows={rows} restricted={restricted} saveAgencyServices={saveAgencyServices} />
      <p className="flex max-w-prose items-start gap-2 text-sm text-ink-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        {t(restricted ? "noteRestricted" : "noteAll")}
      </p>
    </ClientMessages>
  );
}
