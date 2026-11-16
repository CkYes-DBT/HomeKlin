"use client";

import { CircleAlert, LoaderCircle, Lock, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { startPayment } from "@/lib/payment/actions";
import { flowAccentButton, flowPrimaryButton } from "./flow-styles";

// "Bayar sekarang" on the order confirmation (T10). The form sends only the order's id and the page's
// language; startPayment checks the signed-in customer and reads the price from their own order on the
// server, then sends the browser to Midtrans' Sandbox payment page (a payment started before is opened
// again, not made twice). When it cannot, the reason appears in the alert above the button and the
// button works again. The button stays busy until the browser has left for Midtrans.
// Sources: node_modules/next/dist/docs/01-app/02-guides/forms.md ("Validation errors", "Pending
// states"), node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md (absolute
// URLs) and https://react.dev/reference/react/useActionState
// On the payment step (step 3) the button is the lime pill, the strongest in the flow: paying is the
// one thing left to do there (the booking-flow fixes, 2026-11-16). Elsewhere it stays forest.
export function PaymentForm({ orderId, sandboxNote = true, accent = false }: { orderId: string; sandboxNote?: boolean; accent?: boolean }) {
  const t = useTranslations("Payment");
  const locale = useLocale();
  const [state, action, pending] = useActionState(startPayment, null);
  // Counts the presses, so the same refusal twice is announced twice.
  const [presses, setPresses] = useState(0);
  const error = state?.formError;

  return (
    <form action={action} onSubmit={() => setPresses((count) => count + 1)} className="flex flex-col gap-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="locale" value={locale} />
      <p className="flex items-start gap-2.5 text-sm text-ink-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>
          {t("secureNote")}
          {sandboxNote ? <span className="font-medium text-ink"> {t("sandboxNote")}</span> : null}
        </span>
      </p>
      <div role="alert" aria-atomic="true">
        {error && !pending ? (
          <p
            key={presses}
            className="flex items-start gap-2.5 rounded-sm bg-danger-surface px-4 py-3 text-sm font-medium text-danger"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{t(`errors.${error}`)}</span>
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending}
        className={
          accent
            ? `${flowAccentButton} w-full ${pending ? "cursor-progress disabled:bg-lime disabled:text-on-lime disabled:brightness-95" : ""}`
            : `${flowPrimaryButton} ${pending ? "cursor-progress disabled:bg-primary-container disabled:text-on-primary" : ""}`
        }
      >
        {pending ? (
          <LoaderCircle className="size-5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <Lock className="size-4.5 shrink-0" aria-hidden="true" />
        )}
        {pending ? t("pending") : t("submit")}
      </button>
    </form>
  );
}
