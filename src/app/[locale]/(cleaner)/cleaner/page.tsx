import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { CleanerHomeContent } from "@/components/cleaner/cleaner-home-content";
import { PageContainer } from "@/components/ui/page-container";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CleanerHomePage");
  return { title: t("title") };
}

// Cleaners only (T5): the cleaner's home (D4, mock Cleaner-Home), where signing in lands. The welcome
// carries the cleaner's name, so everything renders inside the page's own role check (a layout's check
// would not protect it).
export default function CleanerHomePage() {
  return (
    <PageContainer>
      <Suspense fallback={<GateFallback />}>
        <RoleGate roles={["cleaner"]}>
          <CleanerHomeContent />
        </RoleGate>
      </Suspense>
    </PageContainer>
  );
}
