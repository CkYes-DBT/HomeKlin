// The arrival windows on step 2 (/pesan), by their day in Jakarta, written on the server. Since the
// booking-flow fixes (2026-11-16) step 2 follows step 1's rule: a full window stays on the page,
// marked "penuh" and not choosable, and so does one that someone else took while the page was open.
// Pure, so the rules are unit tested (tests/booking-fixes-ui.test.ts).

export type BookingWindow = {
  /** The window's start exactly as the catalog gave it (the value sent as `startsAt`). */
  startsAt: string;
  /** "10.00-12.00", the same range as on step 1. */
  label: string;
  start: string;
  end: string;
  isFull: boolean;
};

export type BookingDay = {
  /** YYYY-MM-DD in Jakarta. */
  date: string;
  /** "Besok, Senin 16 November": the group's name and the summaries. */
  label: string;
  /** "Besok, Sen 16 Nov": the day select, short enough for a 360 px phone. */
  short: string;
  windows: BookingWindow[];
};

/** The days with the windows taken while the page was open marked full (a new copy). */
export function markTaken(days: readonly BookingDay[], taken: readonly string[]): BookingDay[] {
  return days.map((day) => ({
    ...day,
    windows: day.windows.map((window) => (taken.includes(window.startsAt) ? { ...window, isFull: true } : window)),
  }));
}

export function dayHasFree(day: BookingDay): boolean {
  return day.windows.some((window) => !window.isFull);
}

/** The chosen window and its day, when it is on the page and still free. */
export function chosenWindow(days: readonly BookingDay[], startsAt: string | null) {
  if (!startsAt) return undefined;
  for (const day of days) {
    const window = day.windows.find((candidate) => candidate.startsAt === startsAt && !candidate.isFull);
    if (window) return { day, window };
  }
  return undefined;
}
