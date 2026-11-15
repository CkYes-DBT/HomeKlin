import { CircleAlert, CircleCheck, Lock, VideoOff } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { listMyOrders, type CustomerOrder } from "@/lib/booking/orders";
import { getCatalogServices } from "@/lib/catalog/cached";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseOpenedOrderId } from "./booking-query";
import { flowCard, flowOutlineButton, flowPageTitle } from "./flow-styles";
import { HelpCard } from "./order-details";
import { OrderLive } from "./order-live";
import { CleanerCard, OrderSubpageHeader } from "./order-subpage";
import { OrderTimelineCard } from "./order-timeline-card";

type SearchParams = Record<string, string | string[] | undefined>;

// The content of /orders/live?order=<order id> for a signed-in customer (T23, restyled in D5 after the
// Customer-Live and Phone-Live mocks): the live view of one of their own jobs, with the Petugas
// HomeKlin, the job's status steps and the way to help beside it. The order is looked up among the
// customer's own orders (listMyOrders, with their own session), so another customer's id, a made-up
// one, an unpaid order or a missing id all get the same "Siaran tidak tersedia", with nothing from the
// order and no link to any video. A finished job says so and points to its recording; a paid job not
// yet streaming says the cleaner has not started (./order-live.tsx, which asks the server again). The
// stream rules are unchanged: watchStream decides on the server.
export async function LiveContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const orderId = parseOpenedOrderId(await searchParams);
  const [locale, t] = await Promise.all([getLocale(), getTranslations("LiveStream")]);

  let orders: CustomerOrder[];
  let serviceName: string | undefined;
  try {
    const client = await createSupabaseServerClient({ writeCookies: false });
    const [own, services] = await Promise.all([listMyOrders(client), getCatalogServices()]);
    orders = own;
    serviceName = services.find((service) => service.id === own.find((order) => order.id === orderId)?.serviceId)?.name[locale];
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <LiveError />;
  }

  const order = orders.find((candidate) => candidate.id === orderId);
  if (!order || order.status !== "paid") return <LiveRefused />;

  return (
    <div className="flex flex-col gap-6 md:gap-7">
      <OrderSubpageHeader
        back={{ href: `/orders?order=${order.id}`, label: t("backToCode", { code: order.orderCode }) }}
        title={t("pageTitle")}
        lead={t("lead", { service: serviceName ?? t("serviceFallback"), address: order.address })}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <div className={flowCard}>{order.completedAt ? <JobFinished orderId={order.id} /> : <OrderLive orderId={order.id} variant="page" />}</div>
          <p className="flex items-start gap-3 rounded-lg bg-card p-4 text-sm text-ink md:p-5">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-lime-wash text-on-lime-wash">
              <Lock className="size-4" />
            </span>
            <span>
              <strong className="font-semibold">{t("privacyTitle")}</strong> {t("privacyBody")}
            </span>
          </p>
        </div>
        <aside aria-label={t("asideLabel")} className="flex flex-col gap-4 lg:sticky lg:top-24">
          <CleanerCard order={order} />
          <OrderTimelineCard order={order} />
          <HelpCard />
        </aside>
      </div>
    </div>
  );
}

async function JobFinished({ orderId }: { orderId: string }) {
  const t = await getTranslations("LiveStream");
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-surface text-success">
          <CircleCheck className="size-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-display text-lg font-semibold text-ink">{t("completedTitle")}</h2>
          <p className="text-sm text-ink-muted">{t("completedBody")}</p>
        </div>
      </div>
      <ButtonLink href={`/orders/recording?order=${orderId}`} variant="forest">
        {t("seeRecording")}
      </ButtonLink>
    </div>
  );
}

async function LiveRefused() {
  const t = await getTranslations("LiveStream");
  return (
    <div className="flex flex-col gap-6">
      <h1 className={flowPageTitle}>{t("pageTitle")}</h1>
      <EmptyState tone="forest" icon={VideoOff} title={t("unavailableTitle")}>
        {t("unavailableBody")}
        <span className="mt-4 flex justify-center">
          <ButtonLink href="/orders" variant="outline">
            {t("toOrders")}
          </ButtonLink>
        </span>
      </EmptyState>
    </div>
  );
}

async function LiveError() {
  const t = await getTranslations("LiveStream");
  return (
    <div className="flex flex-col gap-6">
      <h1 className={flowPageTitle}>{t("pageTitle")}</h1>
      <EmptyState tone="forest" icon={CircleAlert} title={t("errorTitle")}>
        {t("errorBody")}
        <span className="mt-4 flex justify-center">
          {/* A plain link on purpose: a full page load reads the order again. */}
          <a href="" className={flowOutlineButton}>
            {t("retry")}
          </a>
        </span>
      </EmptyState>
    </div>
  );
}
