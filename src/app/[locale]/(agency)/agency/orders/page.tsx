import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { IncomingContent } from "@/components/agency/incoming-content";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { PageHeader } from "@/components/ui/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AgencyOrdersPage");
  return { title: t("title") };
}

// Agency staff only (T5): "Pekerjaan masuk" (D2, after the mock Partner-Jobs), the jobs routed to the
// agency that are not finished yet, with the control that assigns one of its own cleaners (T28);
// ?status= and ?q= filter the list. The title is prerendered; the rest renders inside the page's own
// role check (a layout's check would not protect it).
export default function AgencyOrdersPage({ searchParams }: PageProps<"/[locale]/agency/orders">) {
  const t = useTranslations("AgencyOrdersPage");
  return (
    <>
      <PageHeader size="compact" title={t("title")} description={t("description")} />
      <Suspense fallback={<GateFallback />}>
        <RoleGate roles={["agency"]}>
          <IncomingContent searchParams={searchParams} />
        </RoleGate>
      </Suspense>
    </>
  );
}
