import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { PaymentContent } from "@/components/customer/orders-content";
import { PageContainer } from "@/components/ui/page-container";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("PaymentStep");
  return { title: t("title") };
}

// Step 3 of ordering (2026-11-17, in the booking flow's layout): /orders/pay?order=<order id>, the
// payment and then its confirmation (src/components/customer/orders-content.tsx, PaymentContent).
// Customers only: the proxy refuses anyone else under /orders (src/lib/auth/roles.ts), and the page
// checks again, because a layout's check does not protect its pages
// (node_modules/next/dist/docs/01-app/02-guides/authentication.md, "Layouts and auth checks"). The
// content reads the session and the address, so it streams in behind <Suspense>.
export default function PaymentPage({ searchParams }: PageProps<"/[locale]/orders/pay">) {
  return (
    <PageContainer wide>
      <Suspense fallback={<GateFallback />}>
        <RoleGate roles={["customer"]}>
          <PaymentContent searchParams={searchParams} />
        </RoleGate>
      </Suspense>
    </PageContainer>
  );
}
