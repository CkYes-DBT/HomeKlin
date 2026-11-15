import { CalendarX2, CircleAlert, MapPinOff, PackageX, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button-link";

type BookingUnavailableProps =
  | { kind: "service" | "area" | "error"; backHref: string }
  | { kind: "full"; backHref: string; areaName: string; days: number };

const icons: Record<BookingUnavailableProps["kind"], LucideIcon> = {
  service: PackageX,
  area: MapPinOff,
  full: CalendarX2,
  error: CircleAlert,
};

const linkRow = "mt-4 flex flex-wrap justify-center gap-2";

// What the booking page shows instead of the form when nothing can be booked from its address (T9):
// a service that does not exist or is switched off, an area HomeKlin does not serve, an area with
// every window of the next two weeks taken, or a read error. Each says why in plain words and leads
// back to the services list (of the same area, when there is one).
export async function BookingUnavailable(props: BookingUnavailableProps) {
  const t = await getTranslations("BookingUnavailable");
  const title =
    props.kind === "full" ? t("fullTitle", { area: props.areaName }) : t(`${props.kind}Title`);
  const body = props.kind === "full" ? t("fullBody", { days: props.days }) : t(`${props.kind}Body`);
  return (
    <EmptyState tone="forest" icon={icons[props.kind]} title={title}>
      {body}
      <span className={linkRow}>
        {props.kind === "error" ? (
          // A plain link on purpose: a full page load reads the catalog and the windows again.
          <a
            href=""
            className="inline-flex min-h-touch items-center justify-center rounded-full bg-card px-5 text-sm font-semibold text-ink inset-ring-[1.5px] inset-ring-outline transition-colors duration-150 ease-out-quart hover:bg-sunken active:bg-lime-wash"
          >
            {t("retry")}
          </a>
        ) : null}
        <ButtonLink href={props.backHref} variant="forest">
          {t("back")}
        </ButtonLink>
      </span>
    </EmptyState>
  );
}
