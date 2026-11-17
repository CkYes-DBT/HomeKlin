import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PageContainer } from "@/components/ui/page-container";
import { GateFallback } from "@/components/auth/gate-fallback";
import { BookingStepper } from "@/components/customer/booking-stepper";
import { BookingTrust } from "@/components/customer/booking-trust";
import { flowPageTitle } from "@/components/customer/flow-styles";
import { OrderContent } from "@/components/customer/order-content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("OrderPage");
  return { title: t("title") };
}

// Step 2 of ordering (T9b, restyled in D5 after the Customer-Booking and Phone-Booking mocks), public:
// /pesan?layanan=<id>&area=<id>&starts=<window start>, opened from step 1 (/services), the landing
// page's service cards and the old /book address. Ordering needs no account first: a guest gets a
// 6-digit code by email, and the code places the order (and makes the account). A signed-in customer
// orders straight away; both then go on to step 3, the payment. The steps and the title are the
// prerendered shell; the form renders at request time behind <Suspense>, because it reads the
// address, the session and the free windows. Every order action checks the role and the input on the
// server (src/lib/booking/actions.ts).
// Source: node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md ("Working with runtime APIs")
export default function OrderPage({ searchParams }: PageProps<"/[locale]/pesan">) {
  const t = useTranslations("OrderPage");
  return (
    <PageContainer wide>
      <BookingStepper current={2} />
      <header className="flex flex-col gap-2">
        <h1 className={flowPageTitle}>{t("title")}</h1>
        <p className="max-w-prose text-ink-muted md:text-body-lg">{t("description")}</p>
        <BookingTrust />
      </header>
      <Suspense fallback={<GateFallback />}>
        <OrderContent searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}
