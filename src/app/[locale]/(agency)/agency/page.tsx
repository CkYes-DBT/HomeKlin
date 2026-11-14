import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { SummaryContent, SummaryRange } from "@/components/agency/summary-content";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { PageHeader } from "@/components/ui/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AgencySummaryPage");
  return { title: t("title") };
}

// Agency staff only (T5): "Ringkasan", the console's start page (D2, after the mock Partner-Summary):
// the agency's fees, jobs and payouts over 7, 30 or 90 days (?days=). The title is prerendered; the
// range toggle and the numbers render inside the page's own role checks (a layout's check would not
// protect them).
export default function AgencySummaryPage({ searchParams }: PageProps<"/[locale]/agency">) {
  const t = useTranslations("AgencySummaryPage");
  return (
    <>
      <PageHeader
        size="compact"
        title={t("title")}
        description={t("description")}
        action={
          <Suspense fallback={<GateFallback variant="action" />}>
            <RoleGate roles={["agency"]}>
              <SummaryRange searchParams={searchParams} />
            </RoleGate>
          </Suspense>
        }
      />
      <Suspense fallback={<GateFallback />}>
        <RoleGate roles={["agency"]}>
          <SummaryContent searchParams={searchParams} />
        </RoleGate>
      </Suspense>
    </>
  );
}
