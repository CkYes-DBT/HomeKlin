import { Check } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { CustomerOrder } from "@/lib/booking/orders";
import { jakartaDayOf } from "./booking-query";
import { flowCard, flowCardTitle } from "./flow-styles";
import { orderTimeline, type TimelineState } from "./order-timeline";
import { getSlotLabels } from "./slot-labels";

type TimelineOrder = Parameters<typeof orderTimeline>[0];

// "Status pekerjaan" on an order's page (D5, mock Customer-Orders): from the order to the finished job
// (./order-timeline.ts), on a vertical line. Each step says its state in words for screen readers
// ("Sudah:", "Sekarang:", "Berikutnya:") and shows it with a check, a filled dot or an empty ring, so it
// never rests on colour alone; a step that happened carries its day and time in Jakarta time.
export async function OrderTimelineCard({ order }: { order: TimelineOrder & Pick<CustomerOrder, "startsAt"> }) {
  const locale = await getLocale();
  const [t, labels] = await Promise.all([getTranslations("OrderTimeline"), getSlotLabels(locale)]);
  const steps = orderTimeline(order);
  if (steps.length === 0) return null;
  const now = new Date();
  const when = (iso: string) => t("when", { day: labels.day(jakartaDayOf(iso, now)), time: labels.time(iso) });

  return (
    <section aria-labelledby="status-pekerjaan" className={flowCard}>
      <h2 id="status-pekerjaan" className={flowCardTitle}>
        {t("title")}
      </h2>
      <ol aria-label={t("listLabel")} className="mt-4 flex flex-col">
        {steps.map((step, index) => {
          const time = step.at ? labels.time(step.at) : "";
          const sub = step.estimate
            ? t("estimate", { time })
            : step.at && step.key !== "checkedIn" && step.key !== "completed"
              ? when(step.at)
              : null;
          return (
            <li
              key={step.key}
              aria-current={step.state === "current" ? "step" : undefined}
              className="relative flex gap-4 pb-5 last:pb-0"
            >
              {index < steps.length - 1 ? (
                <span aria-hidden="true" className="absolute top-7 bottom-0 left-3.5 w-0.5 -translate-x-1/2 bg-border-control/40" />
              ) : null}
              <Marker state={step.state} />
              <div className="flex min-w-0 flex-col pt-0.5">
                <p className={step.state === "upcoming" ? "text-ink-muted" : "font-semibold text-ink"}>
                  <span className="sr-only">{t(`state.${step.state}`)} </span>
                  {t(`steps.${step.key}.${step.state}`, { time })}
                </p>
                {sub ? <p className="text-sm text-ink-muted tabular-nums">{sub}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Marker({ state }: { state: TimelineState }) {
  if (state === "done") {
    return (
      <span aria-hidden="true" className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-lime-wash text-on-lime-wash">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span aria-hidden="true" className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-primary">
        <span className="size-2.5 rounded-full bg-lime motion-safe:animate-breathe" />
      </span>
    );
  }
  return <span aria-hidden="true" className="relative size-7 shrink-0 rounded-full bg-card inset-ring-[1.5px] inset-ring-border-control" />;
}
