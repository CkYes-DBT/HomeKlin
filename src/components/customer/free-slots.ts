import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { listFreeSlots, listSlotWindows, type FreeSlot, type SlotWindow } from "@/lib/catalog/catalog";
import { createSupabasePublicClient } from "@/lib/supabase/public";

// The free arrival windows of an area as the customer pages read them: at request time, never cached
// (every booking changes them; connection() keeps them out of every prerender), and once per request
// and area (React's cache), so the windows panel on /services and the "Pesan" buttons on its cards
// share one read. Callers sit behind <Suspense>. Null when they could not be read; the caller says so.
// The windows are combined over everyone serving the area: times only, never who provides them.

/** How far ahead the customer pages look for free windows. */
export const freeWindowDays = 14;

export const loadFreeSlots = cache(async (areaId: string, serviceId?: string): Promise<FreeSlot[] | null> => {
  await connection();
  try {
    // With a service, only the windows of agencies offering it (B12); book_slot checks the same again.
    return await listFreeSlots(createSupabasePublicClient(), areaId, { days: freeWindowDays, now: new Date(), serviceId });
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return null;
  }
});

/**
 * Step 1's windows (D5, mock Main "Jam kosong"): the area's windows for one service, the full ones
 * included (slot_windows, B11), only from agencies offering that service (B12). Without a service, the
 * area's windows over every service. The same rules as loadFreeSlots: at request time, once per request.
 */
export const loadSlotWindows = cache(async (areaId: string, serviceId?: string): Promise<SlotWindow[] | null> => {
  await connection();
  try {
    return await listSlotWindows(createSupabasePublicClient(), areaId, { days: freeWindowDays, now: new Date(), serviceId });
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return null;
  }
});
