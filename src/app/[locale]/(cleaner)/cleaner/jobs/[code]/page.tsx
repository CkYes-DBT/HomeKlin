import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { CleanerJobContent } from "@/components/cleaner/cleaner-job-content";
import { PageContainer } from "@/components/ui/page-container";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CleanerJobPage");
  return { title: t("title") };
}

// One sample order number, so the build can prerender the page's shell: the cleaner shell reads the
// address in client components (usePathname), which needs the params known at build time. Every real
// order number is rendered on request; for the sample only the shell is built (all content is behind
// the role check and read at request time) (node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/dynamic-routes.md, "With Cache Components").
export function generateStaticParams() {
  return [{ code: "HK-1001" }];
}

type Params = PageProps<"/[locale]/cleaner/jobs/[code]">["params"];

// Cleaners only (T5): one of the cleaner's jobs (D4, mocks Cleaner-Job and Cleaner-Live) with check-in,
// the live stream and check-out (T18, T22). The title is the service's name, so everything renders
// inside the page's own role check. The params are runtime data, so they are read inside <Suspense>.
export default function CleanerJobPage({ params }: PageProps<"/[locale]/cleaner/jobs/[code]">) {
  return (
    <PageContainer>
      <Suspense fallback={<GateFallback />}>
        <RoleGate roles={["cleaner"]}>
          <JobFromParams params={params} />
        </RoleGate>
      </Suspense>
    </PageContainer>
  );
}

async function JobFromParams({ params }: { params: Params }) {
  const { code } = await params;
  return <CleanerJobContent code={code} />;
}
