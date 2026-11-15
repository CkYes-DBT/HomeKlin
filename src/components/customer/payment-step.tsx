import { ArrowRight, Building2, CircleAlert, CreditCard, Info, Mail, QrCode, RefreshCw, Video, Wallet, type LucideIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ClientMessages } from "@/i18n/client-messages";
import { Link } from "@/i18n/navigation";
import type { CustomerOrder } from "@/lib/booking/orders";
import { formatRupiah } from "@/lib/format";
import { BookingStepper } from "./booking-stepper";
import { flowCard, flowCardTitle, flowNote, flowPageTitle, flowPrimaryButton, flowTextLink } from "./flow-styles";
import { getOrderWords, OrderStatusPill } from "./order-status";
import { PaymentForm } from "./payment-form";
import { paymentMethodKey } from "./payment-method";
import { ResendEmail } from "./resend-email";

type StepProps = {
  order: CustomerOrder;
  serviceName?: string;
  areaName: string;
};

/** The ways Midtrans Snap offers, shown as information: the customer chooses on Midtrans' page. */
const methods: { key: "qris" | "bankTransfer" | "card" | "ewallet"; Icon: LucideIcon }[] = [
  { key: "qris", Icon: QrCode },
  { key: "bankTransfer", Icon: Building2 },
  { key: "card", Icon: CreditCard },
  { key: "ewallet", Icon: Wallet },
];

// Step 3 of ordering, /orders?booked=<id> while the order waits for payment (T10, restyled in D5 after
// the Customer-Payment and Phone-Payment mocks): the steps, that it is a simulation, the ways to pay,
// and beside them the order with "Bayar sekarang", which opens Midtrans' Sandbox page (startPayment
// checks the customer and the price on the server). Midtrans' Snap page still lets the customer choose
// the method (enabled_payments was not built, Phase 15 B8), so the methods here are information, not a
// choice. Back from Midtrans the order still waits until Midtrans' signed notification arrives (T11),
// so the page says the payment is being confirmed rather than claiming it is paid. A failed or
// cancelled order shows here with its status and no button.
export async function PaymentStep({ order, serviceName, areaName, cameBackFromPayment }: StepProps & { cameBackFromPayment: boolean }) {
  const locale = await getLocale();
  const [t, tPayment, tMethod, words] = await Promise.all([
    getTranslations("PaymentStep"),
    getTranslations("Payment"),
    getTranslations("PaymentMethod"),
    getOrderWords(locale),
  ]);
  const awaiting = order.status === "pending_payment";

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
        {awaiting ? (
          <p className="flex items-start gap-3 rounded-lg bg-warning-surface px-4 py-3 text-sm text-warning md:px-5">
            <Info className="mt-0.5 size-4.5 shrink-0" aria-hidden="true" />
            <span>
              <strong className="font-semibold">{tPayment("sandboxNote")}</strong> {t("sandboxBody")}
            </span>
          </p>
        ) : null}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-6">
          {awaiting ? (
            <div className="flex flex-col gap-3">
              <h2 className={flowCardTitle}>{t("methodsTitle")}</h2>
              <p className="text-sm text-ink-muted">{t("methodsLead")}</p>
              <ul className="flex flex-col gap-3">
                {methods.map(({ key, Icon }) => (
                  <li key={key} className="flex items-center gap-4 rounded-lg bg-card p-4 md:px-6 md:py-5">
                    <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-md bg-lime-wash text-on-lime-wash">
                      <Icon className="size-5" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold text-ink">{tMethod(key)}</span>
                      <span className="text-sm text-ink-muted">{t(`methods.${key}`)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
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

          {/* On phones the order and "Bayar sekarang" come first; the ways to pay are background. */}
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
                <div className="mt-5">
                  <ClientMessages namespaces={["Payment"]}>
                    <PaymentForm orderId={order.id} sandboxNote={false} />
                  </ClientMessages>
                </div>
              ) : null}
              <Link href={`/orders?order=${order.id}`} className={`${flowTextLink} mt-3`}>
                {t("seeOrder")}
              </Link>
            </div>
            {awaiting ? (
              <p className={flowNote}>
                <NoteIcon icon={Mail} />
                <span>
                  <strong className="font-semibold">{t("emailNoteTitle")}</strong> {t("emailNoteBody")}
                </span>
              </p>
            ) : null}
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
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-primary" aria-hidden="true">
      <Icon className="size-4.5" />
    </span>
  );
}
