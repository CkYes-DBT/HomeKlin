import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { OrdersContent } from "@/components/customer/orders-content";
import { PageContainer } from "@/components/ui/page-container";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("OrdersPage");
  return { title: t("title") };
}

// Customers only (T5). Everything renders inside the role check, which every protected page makes
// itself, because a layout's check does not protect its pages
// (node_modules/next/dist/docs/01-app/02-guides/authentication.md, "Layouts and auth checks").
// Since D5 the content carries its own title, because it is three pages in one address: "Pesanan Anda"
// (the list), step 3 of ordering (/orders?booked=<order id>: the payment, then the confirmation) and an
// order's page (/orders?order=<order id>).
export default function OrdersPage({ searchParams }: PageProps<"/[locale]/orders">) {
  return (
    <PageContainer wide>
      <Suspense fallback={<GateFallback />}>
        <RoleGate roles={["customer"]}>
          <OrdersContent searchParams={searchParams} />
        </RoleGate>
      </Suspense>
    </PageContainer>
  );
}
