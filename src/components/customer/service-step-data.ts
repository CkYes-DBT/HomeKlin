import type { SlotWindow } from "@/lib/catalog/catalog";
import { groupSlotsByJakartaDay, type SlotDay } from "@/lib/catalog/slots-days";

// Step 1's time chips (D5, mock Main "Jam kosong"): the area's windows for the chosen service from
// slot_windows (B11, full ones included), by their day in Jakarta. A full window stays on the page as
// "15.00, penuh" (disabled), so the customer sees the day is not empty by mistake; a day with only
// full windows still shows, marked as having nothing free.

export type WindowDay = Omit<SlotDay, "windows"> & { windows: SlotWindow[]; hasFree: boolean };

export function windowDays(windows: readonly SlotWindow[], now: Date): WindowDay[] {
  const full = new Map(windows.map((window) => [window.startsAt, window.isFull]));
  return groupSlotsByJakartaDay(windows, now).map((day) => {
    const dayWindows = day.windows.map((window) => ({ ...window, isFull: full.get(window.startsAt) === true }));
    return { ...day, windows: dayWindows, hasFree: dayWindows.some((window) => !window.isFull) };
  });
}
