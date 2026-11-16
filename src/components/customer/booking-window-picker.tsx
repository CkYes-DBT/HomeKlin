"use client";

import { CalendarClock, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FieldError } from "./booking-controls";
import { dayHasFree, type BookingDay } from "./booking-days";
import { flowInput } from "./flow-styles";
import { TimeChip } from "./time-chip";

export type { BookingDay } from "./booking-days";

type WindowPickerProps = {
  areaName: string;
  /** The area's windows by day, the full ones (and any taken while the page was open) marked. */
  days: BookingDay[];
  /** The chosen window as it is written, or null when none is chosen. */
  selected: { dayLabel: string; windowLabel: string } | null;
  startsAt: string | null;
  onChoose: (startsAt: string) => void;
  disabled: boolean;
  /** The times are being read again for a new service. */
  loading: boolean;
  /** The day to open when no window is chosen (the day of one just taken). */
  openDate?: string | null;
  error?: string;
};

// The arrival window of an order (T9, restyled in D5 after the Customer-Booking mock): the chosen one
// up front, then the day as a native select ("Tanggal", short day names so it fits a 360 px phone) and
// that day's windows as chips, radio buttons named `startsAt` (the value is the window's start exactly
// as the catalog gave it). Since the booking-flow fixes (2026-11-16) the chips are step 1's
// (./time-chip.tsx): the range, and a full window shown disabled with "penuh". Only the shown day's
// chips are in the form; the chosen window's day is the one shown, so it is always sent. When the
// chosen window is taken, the same day stays open with that window marked full. Times are Jakarta
// time, written by the server.
export function WindowPicker({ areaName, days, selected, startsAt, onChoose, disabled, loading, openDate, error }: WindowPickerProps) {
  const t = useTranslations("Booking");
  const tOrder = useTranslations("Order");
  const tStep = useTranslations("TimeChip");
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
  const day =
    days.find((candidate) => candidate.date === dayDate) ??
    chosenDay ??
    days.find((candidate) => candidate.date === openDate) ??
    days.find(dayHasFree) ??
    days[0];
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
            <span className="text-sm whitespace-nowrap text-ink-muted tabular-nums">{t("windowValue", { window: selected.windowLabel })}</span>
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
        <fieldset disabled={disabled || loading} aria-busy={loading} className="mt-4 flex min-w-0 flex-col gap-4">
          <legend className="sr-only">{t("windowsLegend", { area: areaName })}</legend>
          <div className="flex flex-col gap-1.5 sm:max-w-sm">
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
                    {dayHasFree(option) ? option.short : `${option.short} (${tStep("full")})`}
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
            {loading ? (
              <p role="status" className="mt-1.5 text-sm text-ink-muted">
                {tOrder("windowsLoading")}
              </p>
            ) : null}
            <div className={`mt-1.5 flex flex-wrap gap-2.5 transition-opacity duration-150 ${loading ? "opacity-60" : ""}`}>
              {day.windows.map((window) => (
                <TimeChip
                  key={window.startsAt}
                  name="startsAt"
                  value={window.startsAt}
                  start={window.start}
                  end={window.end}
                  full={window.isFull}
                  checked={window.startsAt === startsAt}
                  onChange={() => onChoose(window.startsAt)}
                  describedBy={error ? "booking-window-error" : undefined}
                />
              ))}
            </div>
          </div>
        </fieldset>
      ) : null}
    </>
  );
}
