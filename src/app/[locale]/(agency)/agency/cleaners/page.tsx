import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AddCleanerJump, CleanersContent } from "@/components/agency/cleaners-content";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { PageHeader } from "@/components/ui/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AgencyCleanersPage");
  return { title: t("title") };
}

// Agency staff only (T5): "Petugas dan ketersediaan" (D2, after the mock Partner-Cleaners), the
// agency's own cleaners, the week's arrival windows (?week=) and the form that adds a cleaner (T28).
// The title is prerendered; the rest renders inside the page's own role checks (a layout's check would
// not protect it).
export default function AgencyCleanersPage({ searchParams }: PageProps<"/[locale]/agency/cleaners">) {
  const t = useTranslations("AgencyCleanersPage");
  return (
    <>
      <PageHeader
        size="compact"
        title={t("title")}
        description={t("description")}
        action={
          <Suspense fallback={<GateFallback variant="action" />}>
            <RoleGate roles={["agency"]}>
              <AddCleanerJump />
            </RoleGate>
          </Suspense>
        }
      />
      <Suspense fallback={<GateFallback />}>
        <RoleGate roles={["agency"]}>
          <CleanersContent searchParams={searchParams} />
        </RoleGate>
      </Suspense>
    </>
  );
}
