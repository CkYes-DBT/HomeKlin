import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { bookingSteps } from "./booking-steps";

// The three steps at the top of the booking pages (D5, mocks Main, Customer-Booking, Customer-Payment,
// Customer-Confirmed): Layanan, Pesan, Bayar, then "Langkah 2 dari 3" (or "Semua langkah selesai").
// The current step is the forest circle with its number and aria-current="step"; a finished one shows a
// check on lime-wash and says "selesai" to screen readers, so the state never rests on colour alone.
// The three steps stay on one line down to 360 px (shorter connectors on phones); "Langkah 2 dari 3"
// moves under them when there is no room beside.
export function BookingStepper({ current }: { current: 1 | 2 | 3 | "done" }) {
  const t = useTranslations("BookingSteps");
  const steps = bookingSteps(current);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <ol aria-label={t("label")} className="flex items-center gap-x-2 sm:gap-x-3">
        {steps.map((step, index) => (
          <li
            key={step.key}
            aria-current={step.state === "current" ? "step" : undefined}
            className="flex shrink-0 items-center gap-2 sm:gap-3"
          >
            {index > 0 ? <span aria-hidden="true" className="h-0.5 w-3 rounded-full bg-border-control/50 sm:w-7" /> : null}
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
                  step.state === "current"
                    ? "bg-primary text-on-primary"
                    : step.state === "done"
                      ? "bg-lime-wash text-on-lime-wash"
                      : "bg-card text-ink-muted inset-ring-[1.5px] inset-ring-border-control"
                }`}
              >
                {step.state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : step.number}
              </span>
              <span className={`text-sm whitespace-nowrap ${step.state === "current" ? "font-semibold text-ink" : step.state === "done" ? "text-ink" : "text-ink-muted"}`}>
                {t(`steps.${step.key}`)}
                {step.state === "done" ? <span className="sr-only">{t("doneSuffix")}</span> : null}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-ink-muted">{current === "done" ? t("allDone") : t("progress", { step: String(current) })}</p>
    </div>
  );
}
