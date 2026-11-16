import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { FreeSlot } from "@/lib/catalog/catalog";
import { formatJakartaDay, formatJakartaTime, type SlotDay } from "@/lib/catalog/slots-days";

// How the customer pages write an arrival window, in Jakarta time whatever the browser's time zone:
// its day ("Besok, Jumat 6 November", "Senin, 9 November") and its span ("15.00-17.00"). Shared by
// the free windows on /services, the booking page and the booking confirmation (server only).

export type SlotLabels = {
  day: (day: Pick<SlotDay, "date" | "relative">) => string;
  /** The same day short ("Besok, Sen 16 Nov"), for the day selects of steps 1 and 2. */
  dayShort: (day: Pick<SlotDay, "date" | "relative">) => string;
  window: (slot: FreeSlot) => string;
  time: (iso: string) => string;
};

export async function getSlotLabels(locale: Locale): Promise<SlotLabels> {
  const t = await getTranslations({ locale, namespace: "FreeWindows" });
  const time = (iso: string) => formatJakartaTime(iso, locale);
  const dayWith = (style: "long" | "short") => (day: Pick<SlotDay, "date" | "relative">) => {
    const parts = formatJakartaDay(day.date, locale, style);
    if (day.relative === "today") return t("today", parts);
    if (day.relative === "tomorrow") return t("tomorrow", parts);
    return t("day", parts);
  };
  return {
    day: dayWith("long"),
    dayShort: dayWith("short"),
    window: (slot) => t("window", { start: time(slot.startsAt), end: time(slot.endsAt) }),
    time,
  };
}
