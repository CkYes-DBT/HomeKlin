import type { Metadata } from "next";
import { Plus, Tags } from "lucide-react";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { categoryOptions } from "@/components/admin/category-options";
import { Notice } from "@/components/admin/notice";
import { ServicesList } from "@/components/admin/services-list";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ClientMessages } from "@/i18n/client-messages";
import { listAllServices, nextSortOrder, type AdminService } from "@/lib/catalog/admin";
import { CatalogError } from "@/lib/catalog/catalog";
import { formatRupiah } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseServiceId, type ServiceFormValues } from "@/lib/validation/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminServicesPage");
  return { title: t("title") };
}

type SearchParams = PageProps<"/[locale]/admin/services">["searchParams"];

// HomeKlin's services and its one price list (T7b; the redesigned list since R3), admins only (T5). The
// title and "Tambah layanan" are prerendered; the list renders inside the page's own role check (a
// layout's check would not protect it) and is read with the signed-in admin's own client, so row-level
// security decides what it may see: every service, active or draft. It is never cached, so admin
// always sees what is stored. Each row opens its edit form in place (R4); ?new opens an empty form to
// add a service above the rows (R5). After a save the action comes back here with ?created= or ?saved=
// and the service's id, which says what was done (the notice takes the cursor), and no open panel.
export default function AdminServicesPage({ searchParams }: PageProps<"/[locale]/admin/services">) {
  const t = useTranslations("AdminServicesPage");
  return (
    <>
      <PageHeader
        size="compact"
        title={t("title")}
        description={t("description")}
        action={
          // Behind its own role check like the list, so the way to add a service never reaches anyone
          // but admin; the title stays in the prerendered shell. A link, so it opens the create panel
          // without JavaScript too (R5). Until it streams in, a wordless block of its size holds its place.
          <Suspense fallback={<GateFallback variant="action" />}>
            <RoleGate roles={["admin"]}>
              <ButtonLink href="/admin/services?new" variant="forest" circleIcon={Plus}>
                {t("add")}
              </ButtonLink>
            </RoleGate>
          </Suspense>
        }
      />
      <Suspense fallback={<GateFallback />}>
        <RoleGate roles={["admin"]}>
          <AdminServicesContent searchParams={searchParams} />
        </RoleGate>
      </Suspense>
    </>
  );
}

/** The first value of a parameter that may appear more than once. */
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

async function AdminServicesContent({ searchParams }: { searchParams: SearchParams }) {
  const [t, locale, params, supabase, categories] = await Promise.all([
    getTranslations("AdminServicesPage"),
    getLocale(),
    searchParams,
    createSupabaseServerClient({ writeCookies: false }),
    categoryOptions(),
  ]);
  // New for every render of the list (after the request's own data, so it is never prerendered). The
  // panels and the notice are keyed on it: after a save, even one that comes back to the same address,
  // every row is drawn anew (closed, no old messages) and the notice takes the cursor again.
  const renderId = crypto.randomUUID();

  let services: AdminService[];
  try {
    services = await listAllServices(supabase);
  } catch (error) {
    // Only a failed read becomes a message; anything else (such as Next.js' own signals) goes on.
    if (!(error instanceof CatalogError)) throw error;
    return (
      <Notice tone="danger" title={t("loadErrorTitle")}>
        {t("loadErrorBody")}
      </Notice>
    );
  }

  const createdId = parseServiceId(first(params.created));
  const savedId = parseServiceId(first(params.saved));
  const changed = services.find((service) => service.id === (createdId ?? savedId));
  // ?new (any value) opens the create panel. A new service starts as a draft, after the last one.
  const create: ServiceFormValues | undefined =
    params.new === undefined
      ? undefined
      : {
          id: "",
          category: "",
          sortOrder: String(nextSortOrder(services)),
          nameId: "",
          nameEn: "",
          descriptionId: "",
          descriptionEn: "",
          priceIdr: "",
          durationMinutes: "",
          isActive: false,
        };

  return (
    <>
      {changed ? (
        // The cursor goes to the notice: the form it was in has closed, and a screen reader reads at once
        // what was done and whether customers see it. The row's summary would only repeat the row.
        <Notice
          key={renderId}
          focus
          tone="success"
          title={t(createdId ? "notice.created" : "notice.saved", {
            name: locale === "en" ? changed.name.en : changed.name.id,
          })}
        >
          {changed.isActive
            ? t("notice.live", { price: formatRupiah(changed.priceIdr, locale) })
            : t("notice.hidden")}
        </Notice>
      ) : null}
      {services.length === 0 && !create ? (
        <EmptyState icon={Tags} title={t("emptyTitle")}>
          {t("emptyBody")}
        </EmptyState>
      ) : (
        <ClientMessages namespaces={["AdminServiceForm"]}>
          <ServicesList services={services} categories={categories} create={create} renderId={renderId} />
        </ClientMessages>
      )}
    </>
  );
}
