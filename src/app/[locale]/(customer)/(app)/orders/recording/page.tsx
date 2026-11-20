import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { ReplayContent } from "@/components/customer/replay-content";
import { PageContainer } from "@/components/ui/page-container";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Replay");
  return { title: t("title") };
}

// /orders/recording?order=<order id>: the customer's recordings (D5, mocks Customer-Replay and
// Phone-Replay). Customers only, like the rest of /orders: everything renders inside the page's own role
// check, which reads the orders with the customer's own session.
export default function ReplayPage({ searchParams }: PageProps<"/[locale]/orders/recording">) {
  return (
    <PageContainer wide>
      <Suspense fallback={<GateFallback />}>
        <RoleGate roles={["customer"]}>
          <ReplayContent searchParams={searchParams} />
        </RoleGate>
      </Suspense>
    </PageContainer>
  );
}
