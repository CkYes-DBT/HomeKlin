import { ChevronLeft, UserRound } from "lucide-react";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { CustomerOrder } from "@/lib/booking/orders";
import { formatJakartaTime } from "@/lib/catalog/slots-days";
import { flowCard, flowCardTitle, flowPageTitle } from "./flow-styles";
import { initialsOf } from "./job-progress";

// The head of an order's own pages (D5, mocks Customer-Live and Customer-Replay): "‹ Pesanan HK-1042"
// back to the order, the page's title and one line about the job; and the "Petugas HomeKlin Anda" card
// beside them. The cleaner shows by name and photo (initials without one), never with the agency.

export function OrderSubpageHeader({ back, title, lead }: { back: { href: string; label: string }; title: string; lead: string }) {
  return (
    <header className="flex flex-col gap-2">
      <Link
        href={back.href}
        className="inline-flex min-h-touch w-fit items-center gap-1.5 rounded-sm text-sm font-semibold text-primary underline-offset-4 transition-colors duration-150 ease-out-quart hover:underline active:text-band"
      >
        <ChevronLeft className="size-4.5 shrink-0" aria-hidden="true" />
        {back.label}
      </Link>
      <h1 className={flowPageTitle}>{title}</h1>
      <p className="text-ink-muted md:text-body-lg">{lead}</p>
    </header>
  );
}

export async function CleanerCard({ order }: { order: Pick<CustomerOrder, "cleanerName" | "cleanerPhotoUrl" | "checkedInAt"> }) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("OrderHero")]);
  const name = order.cleanerName;
  return (
    <section aria-labelledby="petugas-anda" className={flowCard}>
      <h2 id="petugas-anda" className={flowCardTitle}>
        {t("eyebrow")}
      </h2>
      <div className="mt-4 flex items-center gap-3">
        {name && order.cleanerPhotoUrl ? (
          <Image
            src={order.cleanerPhotoUrl}
            width={112}
            height={112}
            alt={t("photoAlt", { name })}
            sizes="56px"
            unoptimized={!order.cleanerPhotoUrl.startsWith("/")}
            className="size-14 shrink-0 rounded-full bg-lime-wash object-cover"
          />
        ) : (
          <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-full bg-lime-wash font-display text-lg font-semibold text-on-lime-wash">
            {name ? initialsOf(name) : <UserRound className="size-6" />}
          </span>
        )}
        <p className="flex min-w-0 flex-col">
          <span className="text-lg font-semibold text-ink">{name ?? t("unassignedName")}</span>
          <span className="text-sm text-ink-muted">
            {order.checkedInAt ? t("checkedInFact", { time: formatJakartaTime(order.checkedInAt, locale) }) : t("role")}
          </span>
        </p>
      </div>
    </section>
  );
}
