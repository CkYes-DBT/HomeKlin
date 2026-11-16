import { ArrowRight, CircleAlert, Hourglass, RefreshCw, Video, type LucideIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ClientMessages } from "@/i18n/client-messages";
import { Link } from "@/i18n/navigation";
import type { CustomerOrder } from "@/lib/booking/orders";
import { formatRupiah } from "@/lib/format";
import { jakartaDayOf } from "./booking-query";
import { BookingStepper } from "./booking-stepper";
import { flowCard, flowCardTitle, flowNote, flowNoteIcon, flowPageTitle, flowPrimaryButton, flowTextLink } from "./flow-styles";
import { getOrderWords, OrderStatusPill } from "./order-status";
import { PaymentForm } from "./payment-form";
import { unpaidHoldUntil } from "./payment-hold";
import { paymentMethodKey } from "./payment-method";
import { ResendEmail } from "./resend-email";
import { getSlotLabels } from "./slot-labels";

type StepProps = {
  order: CustomerOrder;
  serviceName?: string;
  areaName: string;
};

/** What happens after paying: the same three steps as the confirmation ("Yang terjadi selanjutnya"). */
const afterSteps = ["email", "dayOf", "recording"] as const;

// Step 3 of ordering, /orders?booked=<id> while the order waits for payment (T10, restyled in D5 after
// the Customer-Payment and Phone-Payment mocks): the steps, and the order with "Bayar sekarang", which
// opens Midtrans' Sandbox page (startPayment checks the customer and the price on the server). Since
// the booking-flow fixes (2026-11-16): the order card holds everything needed to pay (until when the
// time is held, that it is a simulation, the lime "Bayar sekarang", and the ways to pay as one plain
// line, because Midtrans' Snap page makes that choice; enabled_payments was not built, Phase 15 B8),
// and the main column says what happens after paying, in the confirmation's words. Back from Midtrans
// the order still waits until Midtrans' signed notification arrives (T11), so the page says the
// payment is being confirmed rather than claiming it is paid. A failed or cancelled order shows here
// with its status and no button.
export async function PaymentStep({ order, serviceName, areaName, cameBackFromPayment }: StepProps & { cameBackFromPayment: boolean }) {
  const locale = await getLocale();
  const [t, tPayment, tNext, words, labels] = await Promise.all([
    getTranslations("PaymentStep"),
    getTranslations("Payment"),
    getTranslations("PaymentConfirmed"),
    getOrderWords(locale),
    getSlotLabels(locale),
  ]);
  const awaiting = order.status === "pending_payment";
  // Until when the time is held (release_unpaid_orders, 2 hours after the order was made).
  const now = new Date();
  const holdUntil = unpaidHoldUntil(order.createdAt);
  const holdDay = jakartaDayOf(holdUntil, now);
  const holdLine =
    Date.parse(holdUntil) > now.getTime()
      ? holdDay.relative === "today"
        ? t("holdToday", { time: labels.time(holdUntil) })
        : t("holdDay", { day: labels.day(holdDay), time: labels.time(holdUntil) })
      : null;

  return (
    <div className="flex flex-col gap-6 md:gap-7">
      <BookingStepper current={3} />
      <section aria-labelledby="pembayaran" className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 id="pembayaran" className={flowPageTitle}>
            {t("title")}
          </h1>
          <p className="max-w-prose text-ink-muted md:text-body-lg">{awaiting ? t("lead") : t(`closedLead.${order.status}`)}</p>
        </header>

        {awaiting && cameBackFromPayment ? (
          <div role="status" className="flex items-start gap-3 rounded-lg bg-info-surface px-4 py-3 md:px-5">
            <RefreshCw className="mt-0.5 size-5 shrink-0 text-info" aria-hidden="true" />
            <div className="text-sm text-ink">
              <h2 className="font-semibold">{tPayment("returnedTitle")}</h2>
              <p className="mt-1">{tPayment("returnedBody")}</p>
            </div>
          </div>
        ) : null}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-6">
          {awaiting ? (
            <section aria-labelledby="setelah-membayar" className={`${flowCard} md:p-8`}>
              <h2 id="setelah-membayar" className={flowCardTitle}>
                {t("afterTitle")}
              </h2>
              <ol className="mt-5 flex flex-col gap-5">
                {afterSteps.map((step, index) => (
                  <li key={step} className="flex items-start gap-4">
                    <span
                      aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lime-wash font-semibold text-on-lime-wash tabular-nums"
                    >
                      {index + 1}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-semibold text-ink">{tNext(`next.${step}.title`)}</span>
                      <span className="text-ink-muted">{tNext(`next.${step}.body`)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ) : (
            <div className={`${flowCard} flex flex-col items-start gap-3`}>
              <p className="flex items-start gap-2 text-ink">
                <CircleAlert className="mt-1 size-4.5 shrink-0 text-ink-muted" aria-hidden="true" />
                <span>{t("closedBody")}</span>
              </p>
              <Link href="/services" className={`${flowPrimaryButton} w-auto`}>
                {t("bookAgain")}
                <ArrowRight className="size-5 shrink-0" aria-hidden="true" />
              </Link>
            </div>
          )}

          {/* On phones the order and "Bayar sekarang" come first; what happens after comes below. */}
          <aside aria-label={t("orderLabel")} className="order-first flex flex-col gap-4 lg:sticky lg:top-24 lg:order-none">
            <div className={flowCard}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className={flowCardTitle}>{t("orderTitle")}</h2>
                <OrderStatusPill status={order.status} label={words.status(order.status)} />
              </div>
              <SummaryRows
                rows={[
                  { term: t("fields.code"), value: order.orderCode },
                  { term: t("fields.service"), value: words.service(serviceName) },
                  { term: t("fields.window"), value: words.arrival(order) },
                  { term: t("fields.area"), value: areaName },
                  { term: t("fields.address"), value: order.address },
                ]}
              />
              <div className="mt-4 flex items-baseline justify-between gap-4">
                <p className="font-semibold text-ink">{t("total")}</p>
                <p className="font-display text-price font-semibold whitespace-nowrap text-ink tabular-nums">
                  {formatRupiah(order.priceIdr, locale)}
                </p>
              </div>
              {awaiting ? (
                <>
                  <div className="mt-4 flex items-start gap-2.5 rounded-md bg-warning-surface px-4 py-3 text-sm text-ink">
                    <Hourglass className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                    <p>
                      {holdLine ? <strong className="block font-semibold">{holdLine}</strong> : null}
                      {t("holdBody")}
                    </p>
                  </div>
                  <div className="mt-5">
                    <ClientMessages namespaces={["Payment"]}>
                      <PaymentForm orderId={order.id} accent />
                    </ClientMessages>
                  </div>
                  <p className="mt-3 text-sm text-ink-muted">
                    <span className="font-semibold text-ink">{t("methodsTitle")}:</span> {t("methodsLine")}
                  </p>
                </>
              ) : null}
              <Link href={`/orders?order=${order.id}`} className={`${flowTextLink} mt-3`}>
                {t("seeOrder")}
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

// The confirmation after a successful payment, /orders?booked=<id> once Midtrans' signed notification
// has marked the order paid (D5, mocks Customer-Confirmed and Phone-Confirmed): the order number, that
// the details went to the customer's email with "Kirim ulang email" (B9), what happens next, and the
// summary with how it was paid (B8).
export async function PaymentConfirmed({ order, serviceName, areaName }: StepProps) {
  const locale = await getLocale();
  const [t, tStep, tMethod, words] = await Promise.all([
    getTranslations("PaymentConfirmed"),
    getTranslations("PaymentStep"),
    getTranslations("PaymentMethod"),
    getOrderWords(locale),
  ]);
  const method = paymentMethodKey(order.paymentMethod);

  return (
    <div className="flex flex-col gap-6 md:gap-7">
      <BookingStepper current="done" />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="pembayaran" className={`${flowCard} flex flex-col items-start gap-4 md:p-8`}>
            <OrderStatusPill status={order.status} label={words.status(order.status)} />
            <h1 id="pembayaran" className={flowPageTitle}>
              {t("title")}
            </h1>
            <p className="max-w-prose text-ink md:text-body-lg">{t("body", { code: order.orderCode })}</p>
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
              <ClientMessages namespaces={["ResendEmail"]}>
                <ResendEmail orderId={order.id} />
              </ClientMessages>
              <p className="text-sm text-ink-muted sm:pt-3">
                {t.rich("spam", {
                  link: (chunks) => (
                    <Link href="/support" className="font-semibold text-primary underline underline-offset-4 hover:decoration-2">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            </div>
          </section>

          <section aria-labelledby="selanjutnya" className={`${flowCard} md:p-8`}>
            <h2 id="selanjutnya" className={flowCardTitle}>
              {t("nextTitle")}
            </h2>
            <ol className="mt-5 flex flex-col gap-5">
              {(["email", "dayOf", "recording"] as const).map((step, index) => (
                <li key={step} className="flex items-start gap-4">
                  <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lime-wash font-semibold text-on-lime-wash tabular-nums">
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-semibold text-ink">{t(`next.${step}.title`)}</span>
                    <span className="text-ink-muted">{t(`next.${step}.body`)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside aria-label={tStep("orderLabel")} className="flex flex-col gap-4 lg:sticky lg:top-24">
          <div className={flowCard}>
            <h2 className={flowCardTitle}>{t("summaryTitle")}</h2>
            <SummaryRows
              rows={[
                { term: tStep("fields.code"), value: order.orderCode },
                { term: tStep("fields.service"), value: words.service(serviceName) },
                { term: tStep("fields.window"), value: words.arrival(order) },
                { term: tStep("fields.area"), value: areaName },
                { term: tStep("fields.address"), value: order.address },
                ...(method ? [{ term: t("method"), value: tMethod(method) }] : []),
              ]}
            />
            <div className="mt-4 flex items-baseline justify-between gap-4">
              <p className="font-semibold text-ink">{t("totalPaid")}</p>
              <p className="font-display text-price font-semibold whitespace-nowrap text-ink tabular-nums">
                {formatRupiah(order.priceIdr, locale)}
              </p>
            </div>
            <Link href={`/orders?order=${order.id}`} className={`${flowPrimaryButton} mt-5`}>
              {t("seeOrder")}
              <ArrowRight className="size-5 shrink-0" aria-hidden="true" />
            </Link>
          </div>
          <p className={flowNote}>
            <NoteIcon icon={Video} />
            <span>
              <strong className="font-semibold">{t("privacyTitle")}</strong> {t("privacyBody")}
            </span>
          </p>
        </aside>
      </div>
    </div>
  );
}

function SummaryRows({ rows }: { rows: { term: string; value: ReactNode }[] }) {
  return (
    <dl className="mt-4 flex flex-col gap-3 border-b border-border pb-4 text-sm">
      {rows.map((row) => (
        <div key={row.term} className="flex items-start justify-between gap-4">
          <dt className="shrink-0 text-ink-muted">{row.term}</dt>
          <dd className="text-right font-semibold break-words text-ink tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function NoteIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className={flowNoteIcon} aria-hidden="true">
      <Icon className="size-4.5" />
    </span>
  );
}
