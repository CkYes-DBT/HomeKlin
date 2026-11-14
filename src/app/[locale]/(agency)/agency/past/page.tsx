import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PastContent } from "@/components/agency/past-content";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { PageHeader } from "@/components/ui/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AgencyPastPage");
  return { title: t("title") };
}

// Agency staff only (T5): "Pesanan selesai" (D2, after the mock Partner-Past), the jobs its cleaners
// finished, with the recording and the fee of each; ?recording= and ?q= filter the list. The title is
// prerendered; the rest renders inside the page's own role check (a layout's check would not protect it).
export default function AgencyPastPage({ searchParams }: PageProps<"/[locale]/agency/past">) {
  const t = useTranslations("AgencyPastPage");
  return (
    <>
      <PageHeader size="compact" title={t("title")} description={t("description")} />
      <Suspense fallback={<GateFallback />}>
        <RoleGate roles={["agency"]}>
          <PastContent searchParams={searchParams} />
        </RoleGate>
      </Suspense>
    </>
  );
}
