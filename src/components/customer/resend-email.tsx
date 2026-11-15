"use client";

import { CircleAlert, CircleCheck, LoaderCircle, Mail } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { resendOrderEmail } from "@/lib/booking/email-actions";
import { flowOutlineButton } from "./flow-styles";

// "Kirim ulang email" on the payment confirmation (D5, mock Customer-Confirmed; B9): the order's own
// customer asks for the order email again. The form sends only the order's id and the page's
// language; resendOrderEmail checks the signed-in customer, that the order is theirs, and allows one
// request per order every 5 minutes. The answer appears under the button, in words with an icon.
// Source: node_modules/next/dist/docs/01-app/02-guides/forms.md ("Validation errors", "Pending states")
export function ResendEmail({ orderId }: { orderId: string }) {
  const t = useTranslations("ResendEmail");
  const locale = useLocale();
  const [state, action, pending] = useActionState(resendOrderEmail, null);
  // Counts the presses, so the same answer twice is announced twice.
  const [presses, setPresses] = useState(0);

  return (
    <form action={action} onSubmit={() => setPresses((count) => count + 1)} className="flex flex-col gap-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="locale" value={locale} />
      <button type="submit" disabled={pending} className={`${flowOutlineButton} w-fit`}>
        {pending ? (
          <LoaderCircle className="size-4.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <Mail className="size-4.5 shrink-0" aria-hidden="true" />
        )}
        {pending ? t("pending") : t("submit")}
      </button>
      <div role="status" aria-atomic="true">
        {!pending && state?.ok ? (
          <p key={presses} className="flex items-start gap-2 text-sm font-medium text-success">
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{t("sent")}</span>
          </p>
        ) : null}
        {!pending && state?.formError ? (
          <p key={presses} className="flex items-start gap-2 text-sm font-medium text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{t(`errors.${state.formError}`)}</span>
          </p>
        ) : null}
      </div>
    </form>
  );
}
