"use client";

import { CalendarClock, Check, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FieldError } from "./booking-controls";
import { flowInput } from "./flow-styles";

/** One day of free windows, written on the server in Jakarta time. */
export type BookingDay = {
  /** YYYY-MM-DD in Jakarta. */
  date: string;
  /** "Senin, 9 November", "Besok, Jumat 6 November". */
  label: string;
  windows: { startsAt: string; label: string }[];
};

type WindowPickerProps = {
  areaName: string;
  /** The area's free windows, by day. */
  days: BookingDay[];
  /** The chosen window as it is written, or null when none is chosen. */
  selected: { dayLabel: string; windowLabel: string } | null;
  startsAt: string | null;
  onChoose: (startsAt: string) => void;
  disabled: boolean;
  error?: string;
};

// The arrival window of an order (T9, restyled in D5 after the Customer-Booking mock): the chosen one
// up front, then the day as a native select ("Tanggal") and that day's free windows as chips, radio
// buttons named `startsAt` (the value is the window's start exactly as the catalog gave it). Only the
// shown day's chips are in the form; the chosen window's day is the one shown, so it is always sent.
// When the chosen window is taken, the same day stays open with what is left. Times are Jakarta time,
// written by the server.
export function WindowPicker({ areaName, days, selected, startsAt, onChoose, disabled, error }: WindowPickerProps) {
  const t = useTranslations("Booking");
  const chosenDay = days.find((day) => day.windows.some((window) => window.startsAt === startsAt));
  const [dayDate, setDayDate] = useState<string | null>(chosenDay?.date ?? null);
  // A newly chosen window brings its day up; when that window is taken (startsAt null) the same day
  // stays, so the customer sees what is left of it
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  const [seenStart, setSeenStart] = useState(startsAt);
  if (startsAt !== seenStart) {
    setSeenStart(startsAt);
    if (chosenDay) setDayDate(chosenDay.date);
  }
  const day = days.find((candidate) => candidate.date === dayDate) ?? chosenDay ?? days[0];
  // Looking at another day keeps the chosen window in the form until another one is picked.
  const chosenElsewhere = startsAt !== null && chosenDay !== undefined && chosenDay.date !== day?.date;

  return (
    <>
      <div
        role="group"
        aria-labelledby="booking-window-title"
        aria-describedby="booking-window-note"
        className="mt-3 flex items-start gap-3"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-lime-wash text-on-lime-wash">
          <CalendarClock className="size-5" aria-hidden="true" />
        </span>
        {selected ? (
          <p className="flex min-w-0 flex-col">
            <span className="text-base font-semibold text-ink">{selected.dayLabel}</span>
            <span className="text-sm text-ink-muted tabular-nums">{t("windowValue", { window: selected.windowLabel })}</span>
          </p>
        ) : (
          <p className="flex min-w-0 flex-col">
            <span className="text-base font-semibold text-ink">{t("noWindow")}</span>
            <span className="text-sm text-ink-muted">{t("noWindowHint")}</span>
          </p>
        )}
      </div>
      <div className="mt-2">
        <FieldError id="booking-window-error" message={error} />
      </div>
      <p id="booking-window-note" className="mt-2 text-sm text-ink-muted">
        {t("arrivalNote")}
      </p>

      {chosenElsewhere ? <input type="hidden" name="startsAt" value={startsAt ?? ""} /> : null}
      {day ? (
        <fieldset disabled={disabled} className="mt-4 flex min-w-0 flex-col gap-4">
          <legend className="sr-only">{t("windowsLegend", { area: areaName })}</legend>
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <label htmlFor="booking-day" className="text-xs font-medium text-ink-muted">
              {t("dayLabel")}
            </label>
            <span className="relative flex">
              <select
                id="booking-day"
                value={day.date}
                onChange={(event) => setDayDate(event.target.value)}
                className={`${flowInput} h-12 cursor-pointer appearance-none pr-11`}
              >
                {days.map((option) => (
                  <option key={option.date} value={option.date}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            </span>
          </div>
          <div role="group" aria-labelledby={`booking-day-${day.date}`}>
            <p id={`booking-day-${day.date}`} className="text-xs font-medium text-ink-muted">
              {day.label}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2.5">
              {day.windows.map((window) => (
                <label
                  key={window.startsAt}
                  className="relative flex min-h-touch cursor-pointer items-center justify-center gap-1.5 rounded-full bg-card px-4 text-sm font-semibold text-ink tabular-nums inset-ring-[1.5px] inset-ring-outline transition-colors duration-150 ease-out-quart hover:bg-sunken active:bg-lime-wash has-checked:bg-primary has-checked:text-on-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus has-disabled:cursor-not-allowed has-disabled:opacity-60"
                >
                  <input
                    type="radio"
                    name="startsAt"
                    value={window.startsAt}
                    checked={window.startsAt === startsAt}
                    onChange={() => onChoose(window.startsAt)}
                    aria-describedby={error ? "booking-window-error" : undefined}
                    className="peer absolute inset-0 z-10 size-full cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed"
                  />
                  <Check className="hidden size-4 shrink-0 peer-checked:block" strokeWidth={2.5} aria-hidden="true" />
                  {window.label}
                </label>
              ))}
            </div>
          </div>
        </fieldset>
      ) : null}
    </>
  );
}
