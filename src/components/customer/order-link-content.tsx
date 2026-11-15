import { CircleAlert, Link2Off, LogIn, ShieldCheck, Video } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { getCatalogServices, getServiceAreas } from "@/lib/catalog/cached";
import { formatJakartaTime } from "@/lib/catalog/slots-days";
import { formatRupiah } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { getOrderByLink, type OrderLinkView } from "@/lib/orders/order-link";
import { jakartaDayOf } from "./booking-query";
import { flowCard, flowCardTitle, flowNote, flowOutlineButton, flowPageTitle } from "./flow-styles";
import { HelpCard } from "./order-details";
import { OrderHero } from "./order-hero";
import { getOrderWords, OrderStatusPill } from "./order-status";
import { OrderTimelineCard } from "./order-timeline-card";
import { paymentMethodKey } from "./payment-method";
import { ServiceDuration } from "./service-duration";
import { getSlotLabels } from "./slot-labels";

type Params = Promise<{ token: string }>;

/** Signing in leads to the customer's own orders, where the live view and the recording are. */
const signInHref = "/login?next=%2Forders";

// The order page behind a private email link, /o/<token> (B14a, from the Customer-Email-Order and
// Customer-Email-Replay mocks), without signing in. getOrderByLink returns only that one order and
// nothing that identifies the household: no address, no phone, no email, never the agency. So the page
// shows the order number, the service and time, the area, the status steps, the Petugas HomeKlin by name
// and photo, how it was paid, and whether its recording is still kept. Watching live, replaying and help
// need the customer's own session, so those lead to sign-in. An unknown, revoked or expired token gets
// one plain answer, which says nothing about any order.
export async function OrderLinkContent({ params }: { params: Params }) {
  const { token } = await params;
  // The link is read at request time only, never while the build prerenders the page's shell.
  await connection();
  let order: OrderLinkView | null;
  try {
    order = await getOrderByLink(token);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[order-link] could not read the link:", error);
    return <LinkProblem kind="error" />;
  }
  if (!order) return <LinkProblem kind="invalid" />;

  const locale = await getLocale();
  const [t, tDetails, tMethod, words, labels, services, areas] = await Promise.all([
    getTranslations("OrderLinkPage"),
    getTranslations("OrderConfirmation"),
    getTranslations("PaymentMethod"),
    getOrderWords(locale),
    getSlotLabels(locale),
    getCatalogServices(),
    getServiceAreas(),
  ]);
  const now = new Date();
  const service = services.find((candidate) => candidate.id === order.serviceId);
  const serviceName = words.service(service?.name[locale]);
  const areaName = areas.find((candidate) => candidate.id === order.areaId)?.name[locale] ?? order.areaId;
  const paid = order.status === "paid";
  const method = paymentMethodKey(order.paymentMethod);
  const price = formatRupiah(order.priceIdr, locale);
  const day = (iso: string) => labels.day(jakartaDayOf(iso, now));
  const recording = order.completedAt
    ? order.recordingDeleted || !order.recordingExpiresAt || Date.parse(order.recordingExpiresAt) <= now.getTime()
      ? t("recordingGone")
      : t("recordingKept", { day: day(order.recordingExpiresAt), time: formatJakartaTime(order.recordingExpiresAt, locale) })
    : null;

  const facts: { term: string; value: ReactNode }[] = [
    { term: tDetails("fields.code"), value: <span className="tabular-nums">{order.orderCode}</span> },
    { term: tDetails("fields.service"), value: service ? <>{serviceName}, <ServiceDuration minutes={service.durationMinutes} /></> : serviceName },
    { term: tDetails("fields.window"), value: words.arrival(order) },
    { term: tDetails("fields.area"), value: areaName },
    { term: tDetails("fields.payment"), value: paid && method ? tDetails("paidWith", { method: tMethod(method), price }) : price },
  ];

  return (
    <div className="flex flex-col gap-5">
      <p className={flowNote}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-primary" aria-hidden="true">
          <ShieldCheck className="size-4.5" />
        </span>
        <span>
          <strong className="font-semibold">{t("privateTitle")}</strong>{" "}
          {t("privateBody", { day: day(order.linkExpiresAt) })}
        </span>
      </p>

      {paid ? (
        <OrderHero order={order} serviceName={serviceName} arrival={words.arrival(order)} watchHref={signInHref} />
      ) : (
        <header className="flex flex-col gap-2">
          <h1 className={flowPageTitle}>{t("title", { code: order.orderCode })}</h1>
          <p className="text-ink-muted md:text-body-lg">{tDetails(`detailsLead.${order.status}`)}</p>
        </header>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-5">
          {order.status === "paid" || order.status === "pending_payment" ? <OrderTimelineCard order={order} /> : null}
          <section aria-labelledby="detail-pesanan" className={flowCard}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 id="detail-pesanan" className={flowCardTitle}>
                {tDetails("detailsTitle")}
              </h2>
              <OrderStatusPill status={order.status} label={words.status(order.status)} />
            </div>
            <dl className="mt-4 flex flex-col border-t border-border">
              {facts.map((fact) => (
                <div
                  key={fact.term}
                  className="flex flex-col gap-0.5 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                >
                  <dt className="shrink-0 text-sm text-ink-muted">{fact.term}</dt>
                  <dd className="font-semibold break-words text-ink sm:text-right">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <aside aria-label={t("asideLabel")} className="flex flex-col gap-4 lg:sticky lg:top-24">
          <section aria-labelledby="masuk-untuk-lebih" className={`${flowCard} flex flex-col items-start gap-3`}>
            <h2 id="masuk-untuk-lebih" className={flowCardTitle}>
              {t("signInTitle")}
            </h2>
            {recording ? (
              <p className="flex items-start gap-2 text-sm text-ink">
                <Video className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{recording}</span>
              </p>
            ) : null}
            <p className="text-sm text-ink-muted">{t("signInBody")}</p>
            <Link href={signInHref} className={flowOutlineButton}>
              <LogIn className="size-4.5 shrink-0" aria-hidden="true" />
              {t("signIn")}
            </Link>
          </section>
          <HelpCard />
        </aside>
      </div>
    </div>
  );
}

async function LinkProblem({ kind }: { kind: "invalid" | "error" }) {
  const t = await getTranslations("OrderLinkPage");
  const Icon = kind === "invalid" ? Link2Off : CircleAlert;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
      <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-lime-wash text-on-lime-wash">
        <Icon className="size-6" />
      </span>
      <h1 className="font-display text-title font-semibold text-ink">{t(`${kind}Title`)}</h1>
      <p className="max-w-prose text-ink-muted">{t(`${kind}Body`)}</p>
      {kind === "invalid" ? (
        <Link href={signInHref} className={flowOutlineButton}>
          <LogIn className="size-4.5 shrink-0" aria-hidden="true" />
          {t("signIn")}
        </Link>
      ) : (
        // A plain link on purpose: a full page load reads the link again.
        <a href="" className={flowOutlineButton}>
          {t("retry")}
        </a>
      )}
    </div>
  );
}
