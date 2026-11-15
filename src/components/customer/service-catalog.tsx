import { CircleAlert, MapPinOff, SearchX, Video } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ServiceRating } from "@/components/reviews/service-rating";
import { EmptyState } from "@/components/ui/empty-state";
import { ClientMessages } from "@/i18n/client-messages";
import { getPathname, Link } from "@/i18n/navigation";
import { getCatalogServices, getServiceAreas } from "@/lib/catalog/cached";
import type { CatalogFilters, Service, ServiceArea } from "@/lib/catalog/catalog";
import { splitDuration } from "@/lib/catalog/customer-duration";
import { catalogQuery, defaultAreaId, resolveArea } from "@/lib/catalog/customer-filters";
import { formatJakartaDay } from "@/lib/catalog/slots-days";
import { formatRupiah } from "@/lib/format";
import { parseCatalogFilters } from "@/lib/validation/catalog";
import { AreaPicker } from "./area-picker";
import { CatalogForm } from "./catalog-form";
import { CatalogSearch, CatalogTypeFilter } from "./catalog-filters";
import { flowCard, flowCardTitle, flowNote, flowTextLink } from "./flow-styles";
import { freeWindowDays, loadSlotWindows } from "./free-slots";
import { parseOrderQuery } from "./order-query";
import { ServiceDuration } from "./service-duration";
import { ServiceRadio, ServiceStepProvider, StepSummary, WindowChooser, type StepDay, type StepService } from "./service-step";
import { windowDays } from "./service-step-data";
import { ServiceTypeIcon } from "./service-visual";
import { getSlotLabels } from "./slot-labels";

type SearchParams = Record<string, string | string[] | undefined>;

const areaLink =
  "inline-flex min-h-touch items-center rounded-full bg-card px-4 text-sm font-semibold text-ink inset-ring-[1.5px] inset-ring-outline transition-[background-color,transform] duration-150 ease-out-quart hover:bg-sunken active:scale-[0.98] active:bg-lime-wash motion-reduce:active:scale-100";

/** A link inside the catalog with the given filters, e.g. /services?area=jakarta-timur (Link adds /en). */
const catalogHref = (filters: CatalogFilters) => `/services${catalogQuery(filters)}`;

/** The step's one form (the summary); the service cards and time chips join it with form="...". */
const stepFormId = "pilih-layanan-jam";

// Step 1 of ordering on /services (D5, mocks Main and Phone-Services), built on the T8 catalog: the
// filters from the address (area, keyword, type), HomeKlin's services with their one full price, and the
// area's times for the chosen service, beside a summary that leads to step 2 (/pesan). It reads the
// address, so it renders at request time inside the page's <Suspense>; the services and areas come from
// the cache (src/lib/catalog/cached.ts), the windows fresh (loadSlotWindows). Nothing here names who
// provides the cleaners (markdown/PRODUCT.md principle 6): the windows are times only.
export async function ServiceCatalog({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filters = parseCatalogFilters(params);
  const wanted = parseOrderQuery(params).serviceId;
  const [locale, t, tFilters, tStep, tDuration] = await Promise.all([
    getLocale(),
    getTranslations("CatalogResults"),
    getTranslations("CatalogFilters"),
    getTranslations("ServiceStep"),
    getTranslations("Service"),
  ]);
  const action = getPathname({ href: "/services", locale });

  let areas: ServiceArea[];
  let services: Service[];
  let everyService: Service[];
  try {
    [areas, services, everyService] = await Promise.all([
      getServiceAreas(),
      getCatalogServices({ category: filters.category, query: filters.query }),
      getCatalogServices(),
    ]);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <CatalogError retryHref={`${action}${catalogQuery(filters)}`} />;
  }

  const area = resolveArea(areas, filters.areaId);
  if (!area) return <CatalogError retryHref={`${action}${catalogQuery(filters)}`} />;
  const areaName = area.name[locale];
  // Links name the area unless it is the default, so the default address stays plain (as the form does).
  const areaId = area.id === defaultAreaId ? undefined : area.id;

  const areaCard = (
    <section aria-labelledby="area-anda" className={`${flowCard} flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6`}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id="area-anda" className={flowCardTitle}>
          {tStep("areaTitle")}
        </h2>
        <p className="text-sm text-ink-muted">{tStep("areaLead")}</p>
      </div>
      <div className="md:w-80">
        <AreaPicker areas={areas} value={area.id} layout="stacked" />
      </div>
    </section>
  );

  if (!area.isServed) {
    return (
      <CatalogForm
        action={action}
        defaultArea={defaultAreaId}
        pendingLabel={tFilters("pending")}
        filters={
          <>
            {areaCard}
            {/* No search or type filter where nothing can be booked; a new area keeps them. */}
            <input type="hidden" name="type" value={filters.category ?? ""} />
            <input type="hidden" name="q" value={filters.query ?? ""} />
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <EmptyState tone="forest" icon={MapPinOff} title={t("unservedTitle", { area: areaName })}>
            {t("unservedBody")}
          </EmptyState>
          <div>
            <h3 id="area-dilayani" className="text-sm font-medium text-ink-muted">
              {t("servedAreas")}
            </h3>
            <ul aria-labelledby="area-dilayani" className="mt-2 flex flex-wrap gap-2">
              {areas
                .filter((other) => other.isServed)
                .map((other) => (
                  <li key={other.id}>
                    <Link
                      href={catalogHref({
                        areaId: other.id === defaultAreaId ? undefined : other.id,
                        category: filters.category,
                        query: filters.query,
                      })}
                      scroll={false}
                      className={areaLink}
                    >
                      {other.name[locale]}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </CatalogForm>
    );
  }

  // Each listed service's windows (B12: only agencies offering it), the one in the address too when a
  // filter hides it, and the area's windows over every service (key "") before one is chosen.
  const initial = everyService.find((service) => service.id === wanted);
  const shown = initial && !services.some((service) => service.id === initial.id) ? [...services, initial] : services;
  // The windows are read at request time (connection() inside loadSlotWindows), so the clock is read after.
  const [labels, ...found] = await Promise.all([
    getSlotLabels(locale),
    loadSlotWindows(area.id),
    ...shown.map((service) => loadSlotWindows(area.id, service.id)),
  ]);
  const now = new Date();
  const toDays = (windows: Awaited<ReturnType<typeof loadSlotWindows>>): StepDay[] | null =>
    windows === null
      ? null
      : windowDays(windows, now).map((day) => {
          const parts = formatJakartaDay(day.date, locale);
          return {
            date: day.date,
            label: labels.day(day),
            short: tStep("dayShort", parts),
            hasFree: day.hasFree,
            windows: day.windows.map((window) => ({
              startsAt: window.startsAt,
              start: labels.time(window.startsAt),
              end: labels.time(window.endsAt),
              isFull: window.isFull,
            })),
          };
        });
  const windows: Record<string, StepDay[] | null> = Object.fromEntries(
    ["", ...shown.map((service) => service.id)].map((key, index) => [key, toDays(found[index])]),
  );
  const durationText = (minutes: number) => {
    const { hours, minutes: rest } = splitDuration(minutes);
    if (hours === 0) return tDuration("durationMinutes", { minutes: rest });
    if (rest === 0) return tDuration("durationHours", { hours });
    return tDuration("durationHoursMinutes", { hours, minutes: rest });
  };
  const stepServices: StepService[] = shown.map((service) => ({
    id: service.id,
    name: service.name[locale],
    price: formatRupiah(service.priceIdr, locale),
    duration: durationText(service.durationMinutes),
  }));

  return (
    <ClientMessages namespaces={["ServiceStep"]}>
      <ServiceStepProvider formId={stepFormId} initialServiceId={initial?.id ?? ""} windows={windows}>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-6">
          <CatalogForm
            action={action}
            defaultArea={defaultAreaId}
            pendingLabel={tFilters("pending")}
            filters={
              <>
                {areaCard}
                <div className="flex flex-col gap-4">
                  <div className="md:max-w-md">
                    <CatalogSearch query={filters.query} />
                  </div>
                  <CatalogTypeFilter current={filters.category} />
                </div>
              </>
            }
          >
            <div className="flex flex-col gap-5">
              <section aria-labelledby="daftar-layanan">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 id="daftar-layanan" className={flowCardTitle}>
                    {t("title")}
                  </h2>
                  <p className="flex flex-wrap items-center gap-x-3 text-sm text-ink-muted">
                    <span>
                      {filters.query
                        ? t("countForQuery", { count: services.length, query: filters.query })
                        : t("count", { count: services.length })}
                    </span>
                    {filters.query ? (
                      <Link href={catalogHref({ areaId, category: filters.category })} scroll={false} className={flowTextLink}>
                        {t("clearSearch")}
                      </Link>
                    ) : null}
                  </p>
                </div>
                {services.length > 0 ? (
                  <ul aria-labelledby="daftar-layanan" className="mt-3 grid gap-3 md:grid-cols-2 md:gap-4">
                    {services.map((service) => (
                      <li key={service.id} className="flex">
                        <ServiceChoiceCard
                          service={service}
                          rating={
                            // Each card's rating streams in on its own; a card without reviews shows none.
                            <Suspense fallback={null}>
                              <ServiceRating serviceId={service.id} serviceName={service.name[locale]} />
                            </Suspense>
                          }
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-3">
                    <EmptyState tone="forest" icon={SearchX} title={t("noMatchTitle")}>
                      {t("noMatchBody")}
                      <span className="mt-4 flex justify-center">
                        <Link href={catalogHref({ areaId })} scroll={false} className={areaLink}>
                          {t("showAll")}
                        </Link>
                      </span>
                    </EmptyState>
                  </div>
                )}
              </section>
              <WindowChooser windows={windows} services={stepServices} areaName={areaName} lookAheadDays={freeWindowDays} />
            </div>
          </CatalogForm>

          <aside aria-label={tStep("asideLabel")} className="flex flex-col gap-4 lg:sticky lg:top-24">
            <StepSummary
              action={getPathname({ href: "/pesan", locale })}
              areaId={area.id}
              areaName={areaName}
              services={stepServices}
              windows={windows}
            />
            <p className={flowNote}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-primary" aria-hidden="true">
                <Video className="size-4.5" />
              </span>
              <span>
                <strong className="font-semibold">{tStep("liveNoteTitle")}</strong> {tStep("liveNoteBody")}
              </span>
            </p>
          </aside>
        </div>
      </ServiceStepProvider>
    </ClientMessages>
  );
}

/**
 * One service to choose: what it covers, its one full price (never "from") and about how long it
 * takes. The whole card is the radio's target; the chosen card turns forest green with a lime dot. On
 * phones it is a compact row (dot, name and duration, price) whose description shows once chosen; from
 * tablets a card with the type's icon, as in the mock. The rating (T30) stays clickable above the radio.
 */
async function ServiceChoiceCard({ service, rating }: { service: Service; rating: React.ReactNode }) {
  const locale = await getLocale();
  const name = service.name[locale];
  const nameId = `layanan-${service.id}`;
  const priceId = `layanan-${service.id}-harga`;
  const durationId = `layanan-${service.id}-durasi`;
  return (
    <article className="group/card relative flex w-full rounded-lg bg-card p-4 transition-colors duration-150 ease-out-quart hover:inset-ring-1 hover:inset-ring-border-control has-checked:bg-primary has-checked:inset-ring-0 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus md:p-5">
      <ServiceRadio serviceId={service.id} labelledBy={nameId} describedBy={`${priceId} ${durationId}`} />
      <div className="pointer-events-none relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 md:grid-cols-[minmax(0,1fr)_auto] md:grid-rows-[auto_auto_1fr_auto_auto] md:gap-x-4">
        <ServiceTypeIcon
          service={service}
          className="hidden size-11 items-center justify-center rounded-md bg-lime-wash text-on-lime-wash group-has-checked/card:bg-primary-container group-has-checked/card:text-lime md:col-start-1 md:row-start-1 md:flex"
        />
        <span
          aria-hidden="true"
          className="col-start-1 row-span-4 row-start-1 mt-0.5 flex size-6 items-center justify-center rounded-full bg-card inset-ring-[1.5px] inset-ring-border-control group-has-checked/card:bg-transparent group-has-checked/card:inset-ring-2 group-has-checked/card:inset-ring-lime md:col-start-2 md:row-span-1 md:mt-2.5"
        >
          <span className="hidden size-3 rounded-full bg-lime group-has-checked/card:block" />
        </span>
        <h3
          id={nameId}
          className="col-start-2 row-start-1 text-base font-semibold text-ink group-has-checked/card:text-on-primary md:col-span-2 md:col-start-1 md:row-start-2 md:mt-4 md:text-title"
        >
          {name}
        </h3>
        <p id={durationId} className="col-start-2 row-start-2 text-sm text-ink-muted group-has-checked/card:text-on-band-muted md:col-start-2 md:row-start-5 md:mt-4 md:self-end md:text-right">
          <ServiceDuration minutes={service.durationMinutes} />
        </p>
        <p className="col-start-2 row-start-3 mt-1 text-sm text-ink-muted group-has-checked/card:text-on-band-muted max-md:hidden max-md:group-has-checked/card:block md:col-span-2 md:col-start-1 md:mt-2">
          {service.description[locale]}
        </p>
        <div className="pointer-events-auto relative z-10 col-start-2 row-start-4 w-fit group-has-checked/card:mt-2 group-has-checked/card:rounded-md group-has-checked/card:bg-card group-has-checked/card:px-2 md:col-span-2 md:col-start-1">
          {rating}
        </div>
        <p id={priceId} className="col-start-3 row-start-1 font-display text-lg font-semibold whitespace-nowrap text-ink tabular-nums group-has-checked/card:text-lime md:col-start-1 md:row-start-5 md:mt-4 md:text-price">
          {formatRupiah(service.priceIdr, locale)}
        </p>
      </div>
    </article>
  );
}

/** When the catalog cannot be read: say so, and offer a full reload of the same address. */
async function CatalogError({ retryHref }: { retryHref: string }) {
  const t = await getTranslations("CatalogResults");
  return (
    <EmptyState tone="forest" icon={CircleAlert} title={t("errorTitle")}>
      {t("errorBody")}
      <span className="mt-4 flex justify-center">
        {/* A plain link on purpose: a full page load reads the catalog again. */}
        <a href={retryHref} className={areaLink}>
          {t("retry")}
        </a>
      </span>
    </EmptyState>
  );
}
