import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { JobDetail } from "@/components/agency/job-detail";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AgencyJobPage");
  return { title: t("title") };
}

// Agency staff only (T5): one of the agency's jobs, opened from "Pesanan selesai" (D2, after the mock
// Partner-Job-Done); ?order=<id> names it. Its title is the service, read with the job, so the whole page
// renders inside the page's own role check (a layout's check would not protect it).
export default function AgencyPastJobPage({ searchParams }: PageProps<"/[locale]/agency/past/job">) {
  return (
    <Suspense fallback={<GateFallback />}>
      <RoleGate roles={["agency"]}>
        <JobDetail searchParams={searchParams} from="past" />
      </RoleGate>
    </Suspense>
  );
}
