import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ServicesContent } from "@/components/agency/services-content";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { PageHeader } from "@/components/ui/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AgencyServicesPage");
  return { title: t("title") };
}

// Agency staff only (T5): "Layanan" (D2, after the mock Partner-Services), HomeKlin's services as the
// agency's cleaners do them, read-only. The title is prerendered; the list renders inside the page's
// own role check, like every page of the section.
export default function AgencyServicesPage() {
  const t = useTranslations("AgencyServicesPage");
  return (
    <>
      <PageHeader size="compact" title={t("title")} description={t("description")} />
      <Suspense fallback={<GateFallback />}>
        <RoleGate roles={["agency"]}>
          <ServicesContent />
        </RoleGate>
      </Suspense>
    </>
  );
}
