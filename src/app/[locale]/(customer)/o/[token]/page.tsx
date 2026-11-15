import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { GateFallback } from "@/components/auth/gate-fallback";
import { OrderLinkContent } from "@/components/customer/order-link-content";
import { PageContainer } from "@/components/ui/page-container";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("OrderLinkPage");
  // A private link: never indexed, and the token never leaves in a Referer header.
  return { title: t("metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

// A sample token, so the build can prerender the page's shell (the customer shell reads the address in
// client components); every real token is read on request
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md,
// "With Cache Components").
export function generateStaticParams() {
  return [{ token: "contoh" }];
}

// /o/<token> (B14a): the private link in the order emails opens that one order's page without
// signing in. Public on purpose; the token is the key, checked by the database (getOrderByLink). The
// params are runtime data, so the content renders inside <Suspense>.
export default function OrderLinkPage({ params }: PageProps<"/[locale]/o/[token]">) {
  return (
    <PageContainer wide>
      <Suspense fallback={<GateFallback />}>
        <OrderLinkContent params={params} />
      </Suspense>
    </PageContainer>
  );
}
