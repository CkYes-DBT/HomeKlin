import { CircleAlert, Play, Trash2, Video } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { listMyOrders, type CustomerOrder } from "@/lib/booking/orders";
import { getCatalogServices } from "@/lib/catalog/cached";
import type { Service } from "@/lib/catalog/catalog";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jakartaDayOf, parseOpenedOrderId } from "./booking-query";
import { flowCard, flowCardTitle, flowOutlineButton, flowPageTitle } from "./flow-styles";
import { HelpCard } from "./order-details";
import { OrderRecording } from "./order-recording";
import { getOrderWords } from "./order-status";
import { OrderSubpageHeader } from "./order-subpage";
import { recordingTimeLeft } from "./recording-time";
import { replayList, type ReplayItem } from "./replay-list";
import { getSlotLabels } from "./slot-labels";

type SearchParams = Record<string, string | string[] | undefined>;

// "Rekaman pekerjaan", /orders/recording?order=<order id> (D5, mocks Customer-Replay and Phone-Replay):
// one recording with the browser's own player (OrderRecording: the private link is made on the server
// with the customer's own session, T15), and beside it "Rekaman Anda", every recording of the
// customer's own finished jobs, kept or already deleted after its 7 days (T16). Read with the customer's
// own session (listMyOrders), so another customer's id in the address simply opens the newest of their
// own; a deleted one has no player and no link to a file.
export async function ReplayContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const wanted = parseOpenedOrderId(await searchParams);
  const locale = await getLocale();
  const [t, words, labels] = await Promise.all([getTranslations("Replay"), getOrderWords(locale), getSlotLabels(locale)]);

  let orders: CustomerOrder[];
  let services: Service[];
  try {
    const client = await createSupabaseServerClient({ writeCookies: false });
    [orders, services] = await Promise.all([listMyOrders(client), getCatalogServices()]);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return (
      <div className="flex flex-col gap-6">
        <h1 className={flowPageTitle}>{t("title")}</h1>
        <EmptyState tone="forest" icon={CircleAlert} title={t("errorTitle")}>
          {t("errorBody")}
          <span className="mt-4 flex justify-center">
            {/* A plain link on purpose: a full page load reads the recordings again. */}
            <a href="" className={flowOutlineButton}>
              {t("retry")}
            </a>
          </span>
        </EmptyState>
      </div>
    );
  }

  const now = new Date();
  const { items, selected } = replayList(orders, wanted ?? null, now.getTime());
  const serviceName = (order: CustomerOrder) => words.service(services.find((service) => service.id === order.serviceId)?.name[locale]);

  if (!selected) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className={flowPageTitle}>{t("title")}</h1>
        <EmptyState tone="forest" icon={Video} title={t("emptyTitle")}>
          {t("emptyBody")}
          <span className="mt-4 flex justify-center">
            <ButtonLink href="/orders" variant="outline">
              {t("toOrders")}
            </ButtonLink>
          </span>
        </EmptyState>
      </div>
    );
  }

  const order = selected.order;
  const day = (iso: string) => labels.day({ date: jakartaDayOf(iso, now).date, relative: null });
  const span =
    order.checkedInAt && order.completedAt
      ? t("lead", {
          service: serviceName(order),
          day: day(order.checkedInAt),
          start: labels.time(order.checkedInAt),
          end: labels.time(order.completedAt),
        })
      : `${serviceName(order)}, ${words.arrival(order)}`;

  return (
    <div className="flex flex-col gap-6 md:gap-7">
      <OrderSubpageHeader back={{ href: `/orders?order=${order.id}`, label: t("backToCode", { code: order.orderCode }) }} title={t("title")} lead={span} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-6">
        <div className="overflow-hidden rounded-lg bg-card [&>section]:border-t-0">
          <OrderRecording recordingId={order.recordingId} state={selected.state} now={now} />
        </div>
        <aside aria-label={t("asideLabel")} className="flex flex-col gap-4 lg:sticky lg:top-24">
          <section aria-labelledby="rekaman-anda" className={flowCard}>
            <h2 id="rekaman-anda" className={flowCardTitle}>
              {t("listTitle")}
            </h2>
            <ul aria-labelledby="rekaman-anda" className="mt-4 flex flex-col gap-2.5">
              {items.map((item) => (
                <li key={item.order.id}>
                  <ReplayRow item={item} name={serviceName(item.order)} when={day(item.order.completedAt ?? item.order.startsAt)} now={now} />
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-ink-muted">{t("listNote")}</p>
          </section>
          <HelpCard />
        </aside>
      </div>
    </div>
  );
}

async function ReplayRow({ item, name, when, now }: { item: ReplayItem; name: string; when: string; now: Date }) {
  const t = await getTranslations("Replay");
  const { order, state, selected } = item;
  const left = order.recordingExpiresAt ? recordingTimeLeft(order.recordingExpiresAt, now.getTime()) : null;
  const detail = selected
    ? t("rowSelected")
    : state === "expired"
      ? t("rowDeleted")
      : left && left.unit === "days"
        ? t("rowDaysLeft", { days: left.days })
        : t("rowSoon");
  const body = (
    <>
      <span
        aria-hidden="true"
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
          selected ? "bg-primary text-lime" : state === "expired" ? "bg-card text-ink-muted" : "bg-sunken text-primary"
        }`}
      >
        {state === "expired" ? <Trash2 className="size-4.5" /> : <Play className="size-4 fill-current" />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={`font-semibold ${state === "expired" ? "text-ink-muted" : "text-ink"}`}>{name}</span>
        <span className="text-sm text-ink-muted">{t("rowLine", { code: order.orderCode, day: when, detail })}</span>
      </span>
    </>
  );
  const box = "flex min-h-touch items-center gap-3 rounded-md px-3 py-2.5";
  if (state === "expired" && !selected) return <div className={`${box} bg-sunken`}>{body}</div>;
  return (
    <Link
      href={`/orders/recording?order=${order.id}`}
      aria-current={selected ? "page" : undefined}
      className={`${box} transition-colors duration-150 ease-out-quart ${
        selected ? "bg-lime-wash" : "bg-card ring-1 ring-border hover:bg-sunken active:bg-lime-wash"
      }`}
    >
      {body}
    </Link>
  );
}
