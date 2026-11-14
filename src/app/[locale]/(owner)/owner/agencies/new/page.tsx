import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { AddAgencyForm } from "@/components/owner/add-agency-form";
import { PageHeader } from "@/components/ui/page-header";
import { ClientMessages } from "@/i18n/client-messages";
import { getServiceAreas } from "@/lib/catalog/cached";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("OwnerPartnerNewPage");
  return { title: t("title") };
}

// "Tambah mitra agensi" (D3, after the mock Owner-PartnerNew), the owner only: the partner's name and
// the areas it serves, in one white card under a centred title. The title and the way back are
// prerendered; the form renders inside the page's own role check, and addAgency checks the owner role
// again on the server. The mock's contact person, email, WhatsApp number and invitation are not built:
// the database has no place for them (docs/redesign-gaps.md, Owner).
export default function OwnerPartnerNewPage() {
  const t = useTranslations("OwnerPartnerNewPage");
  return (
    <>
      <PageHeader size="compact" align="center" title={t("title")} description={t("description")} back={{ href: "/owner/agencies", label: t("back") }} />
      <Suspense fallback={<GateFallback />}>
        <RoleGate roles={["owner"]}>
          <PartnerForm />
        </RoleGate>
      </Suspense>
    </>
  );
}

async function PartnerForm() {
  const [locale, areas] = await Promise.all([getLocale(), getServiceAreas()]);
  return (
    <div className="mx-auto w-full max-w-160 rounded-lg bg-card p-5 md:p-6">
      <ClientMessages namespaces={["OwnerAgenciesPage"]}>
        <AddAgencyForm areas={areas.map((area) => ({ id: area.id, name: area.name[locale] }))} />
      </ClientMessages>
    </div>
  );
}
