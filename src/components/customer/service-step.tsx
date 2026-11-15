"use client";

import { ArrowRight, Check, CircleAlert, CalendarX2, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, use, useState, type ReactNode } from "react";
import { flowAccentButton, flowCard, flowCardTitle, flowInput } from "./flow-styles";

// Step 1 of ordering (D5, mocks Main and Phone-Services): choose a service, then a free time in the
// area, with the summary beside them. The choice is one GET form to the order page (/pesan?layanan=
// &area=&starts=): its fields sit in the service cards and the time chips, tied to the form in the
// summary by the `form` attribute, so the page's filter form (area, search, type) stays its own form.
// The address is only a suggestion: /pesan checks every value again, and so does booking.
// The windows of each service came with the page (B12: only agencies offering that service), so a new
// service shows its own times at once; a full window stays visible as "15.00, penuh" and cannot be
// chosen. Times are Jakarta time, written by the server.

export type StepWindow = { startsAt: string; start: string; end: string; isFull: boolean };
export type StepDay = { date: string; label: string; short: string; windows: StepWindow[]; hasFree: boolean };
export type StepService = { id: string; name: string; price: string; duration: string };

type StepState = {
  formId: string;
  serviceId: string;
  setServiceId: (id: string) => void;
  startsAt: string | null;
  setStartsAt: (startsAt: string | null) => void;
};

const StepContext = createContext<StepState | null>(null);

function useStep(): StepState {
  const state = use(StepContext);
  if (!state) throw new Error("A step 1 field must sit inside ServiceStepProvider.");
  return state;
}

type ProviderProps = {
  formId: string;
  initialServiceId: string;
  /** Each service's windows (key ""), or null when they could not be read. */
  windows: Record<string, StepDay[] | null>;
  children: ReactNode;
};

export function ServiceStepProvider({ formId, initialServiceId, windows, children }: ProviderProps) {
  const [serviceId, setServiceIdState] = useState(initialServiceId);
  const [startsAt, setStartsAt] = useState<string | null>(null);

  // A new service keeps the chosen time only when that service has it free too.
  function setServiceId(id: string) {
    setServiceIdState(id);
    const days = windows[id] ?? [];
    const stillFree = days.some((day) => day.windows.some((window) => window.startsAt === startsAt && !window.isFull));
    if (!stillFree) setStartsAt(null);
  }

  return <StepContext value={{ formId, serviceId, setServiceId, startsAt, setStartsAt }}>{children}</StepContext>;
}

/**
 * The service card's radio: invisible over the whole card (the card is the target), named by the
 * card's heading and described by its price and duration. The card shows the choice with its fill,
 * its radio dot and a check, never by colour alone.
 */
export function ServiceRadio({ serviceId, labelledBy, describedBy }: { serviceId: string; labelledBy: string; describedBy: string }) {
  const { formId, serviceId: chosen, setServiceId } = useStep();
  return (
    <input
      type="radio"
      name="layanan"
      form={formId}
      value={serviceId}
      checked={chosen === serviceId}
      onChange={() => setServiceId(serviceId)}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="absolute inset-0 z-0 size-full cursor-pointer appearance-none rounded-lg opacity-0"
    />
  );
}

type WindowsProps = {
  windows: Record<string, StepDay[] | null>;
  services: StepService[];
  areaName: string;
  lookAheadDays: number;
};

/** "Jam kosong": the day as a native select, that day's times as chips. */
export function WindowChooser({ windows, services, areaName, lookAheadDays }: WindowsProps) {
  const t = useTranslations("ServiceStep");
  const { formId, serviceId, startsAt, setStartsAt } = useStep();
  const days = windows[serviceId] ?? (serviceId ? null : windows[""]);
  const service = services.find((candidate) => candidate.id === serviceId);
  const firstFree = days?.find((day) => day.hasFree) ?? days?.[0];
  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const day = days?.find((candidate) => candidate.date === chosenDate) ?? firstFree;

  return (
    <section aria-labelledby="jam-kosong" className={flowCard}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="jam-kosong" className={flowCardTitle}>
            {t("windowsTitle", { area: areaName })}
          </h2>
          <p className="text-sm text-ink-muted">{service ? t("windowsLead", { duration: service.duration }) : t("windowsLeadNoService")}</p>
        </div>
        {days && days.length > 0 && day ? (
          <div className="flex flex-col gap-1.5 md:w-72">
            <label htmlFor="tanggal" className="text-xs font-medium text-ink-muted">
              {t("dayLabel")}
            </label>
            <span className="relative flex">
              <select
                id="tanggal"
                value={day.date}
                onChange={(event) => {
                  setChosenDate(event.target.value);
                  setStartsAt(null);
                }}
                className={`${flowInput} h-12 cursor-pointer appearance-none pr-11`}
              >
                {days.map((option) => (
                  <option key={option.date} value={option.date}>
                    {option.hasFree ? option.label : t("dayFull", { day: option.label })}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            </span>
          </div>
        ) : null}
      </div>

      {days === null ? (
        <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{t("windowsError")}</span>
        </p>
      ) : days.length === 0 || !day ? (
        <p className="mt-4 flex items-start gap-2 text-sm text-ink-muted">
          <CalendarX2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{t("windowsEmpty", { area: areaName, days: lookAheadDays })}</span>
        </p>
      ) : (
        <fieldset className="mt-4 min-w-0">
          <legend className="sr-only">{t("chipsLegend", { day: day.label })}</legend>
          <div className="flex flex-wrap gap-2.5">
            {day.windows.map((window) => (
              <label
                key={window.startsAt}
                className="relative inline-flex min-h-touch min-w-24 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-card px-5 text-sm font-semibold text-ink tabular-nums inset-ring-[1.5px] inset-ring-outline transition-colors duration-150 ease-out-quart hover:bg-sunken active:bg-lime-wash has-checked:bg-primary has-checked:text-on-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus has-disabled:cursor-not-allowed has-disabled:bg-sunken has-disabled:font-medium has-disabled:text-ink-muted has-disabled:inset-ring-0"
              >
                <input
                  type="radio"
                  name="starts"
                  form={formId}
                  value={window.startsAt}
                  disabled={window.isFull}
                  checked={window.startsAt === startsAt}
                  onChange={() => setStartsAt(window.startsAt)}
                  aria-label={window.isFull ? t("chipFullLabel", { start: window.start, end: window.end }) : t("chipLabel", { start: window.start, end: window.end })}
                  className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed"
                />
                <Check className="hidden size-4 shrink-0 peer-checked:block" strokeWidth={2.5} aria-hidden="true" />
                <span aria-hidden="true">{window.isFull ? t("chipFull", { start: window.start }) : window.start}</span>
              </label>
            ))}
          </div>
          <p className="mt-3 text-sm text-ink-muted">{t("timeNote")}</p>
        </fieldset>
      )}
    </section>
  );
}

type SummaryProps = {
  action: string;
  areaId: string;
  areaName: string;
  services: StepService[];
  windows: Record<string, StepDay[] | null>;
};

/** "Ringkasan": what is chosen so far, the full price and "Pesan sekarang" (the step's one form). */
export function StepSummary({ action, areaId, areaName, services, windows }: SummaryProps) {
  const t = useTranslations("ServiceStep");
  const { formId, serviceId, startsAt } = useStep();
  const service = services.find((candidate) => candidate.id === serviceId);
  const day = (windows[serviceId] ?? []).find((candidate) => candidate.windows.some((window) => window.startsAt === startsAt));
  const window = day?.windows.find((candidate) => candidate.startsAt === startsAt);

  return (
    <form id={formId} method="get" action={action} aria-labelledby="ringkasan" className={`${flowCard} flex flex-col`}>
      <input type="hidden" name="area" value={areaId} />
      <h2 id="ringkasan" className={flowCardTitle}>
        {t("summaryTitle")}
      </h2>
      <dl className="mt-4 flex flex-col gap-3 border-b border-border pb-4 text-sm">
        <SummaryRow term={t("summaryService")}>{service?.name ?? <Missing>{t("summaryNoService")}</Missing>}</SummaryRow>
        <SummaryRow term={t("summaryArea")}>{areaName}</SummaryRow>
        <SummaryRow term={t("summarySchedule")}>
          {day && window ? (
            <>
              {day.short}
              <br />
              {t("summaryWindow", { start: window.start, end: window.end })}
            </>
          ) : (
            <Missing>{t("summaryNoWindow")}</Missing>
          )}
        </SummaryRow>
      </dl>
      <div className="mt-4 flex items-baseline justify-between gap-4">
        <p className="text-base font-semibold text-ink">{t("total")}</p>
        <p className="font-display text-price font-semibold whitespace-nowrap text-ink tabular-nums" aria-live="polite">
          {service?.price ?? ""}
        </p>
      </div>
      <p className="mt-2 text-sm text-ink-muted">{t("totalNote")}</p>
      <button
        type="submit"
        disabled={!service}
        aria-describedby={service ? "langkah-berikut" : "pilih-layanan-dulu"}
        className={`${flowAccentButton} mt-5 w-full`}
      >
        {t("submit")}
        <ArrowRight className="size-5 shrink-0" aria-hidden="true" />
      </button>
      {service ? null : (
        <p id="pilih-layanan-dulu" className="mt-2 text-center text-sm text-ink-muted">
          {t("chooseServiceFirst")}
        </p>
      )}
      <p id="langkah-berikut" className="mt-3 text-sm text-ink-muted">
        {t("nextNote")}
      </p>
    </form>
  );
}

function SummaryRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-ink-muted">{term}</dt>
      <dd className="text-right font-semibold text-ink tabular-nums">{children}</dd>
    </div>
  );
}

function Missing({ children }: { children: ReactNode }) {
  return <span className="font-normal text-ink-muted">{children}</span>;
}
