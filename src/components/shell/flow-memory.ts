import { emptyFlowMemory, nextFlowMemory, type FlowMemory } from "@/components/customer/booking-flow";

// How the customer came into the booking flow in this browser tab (src/components/customer/
// booking-flow.ts). It is kept in the tab's sessionStorage, because some moves inside the flow are full
// page loads (step 1's summary is a plain GET form to step 2); a page opened from another site starts
// it afresh, and then step 1's "Kembali" leads to the customer home. Storage can be missing or throw (a
// private window), so every call is guarded and the tab's memory stands in.
// flow-entry-tracker.tsx records every page; booking-header.tsx reads it when "Kembali" is pressed.

type Stored = { memory: FlowMemory; last: string | null };

const key = "homeklin:flow-memory";
let fallback: Stored = { memory: emptyFlowMemory, last: null };

function parse(text: string | null): Stored | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as { memory?: { exit?: unknown; moves?: unknown }; last?: unknown };
    const exit = value.memory?.exit;
    const moves = value.memory?.moves;
    const last = value.last;
    if ((typeof exit !== "string" && exit !== null) || typeof moves !== "number" || (typeof last !== "string" && last !== null)) {
      return null;
    }
    return { memory: { exit, moves }, last };
  } catch {
    return null;
  }
}

function read(): Stored {
  try {
    return parse(window.sessionStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(stored: Stored): void {
  fallback = stored;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // No storage in this browser: the tab's memory above keeps it until the next full page load.
    return;
  }
}

/**
 * Records a page (its path without the language prefix, with its query), opened from `from`: the page
 * before it on this site, or null when there is none (opened from another site, or typed in).
 */
export function recordVisit(href: string, from: string | null): void {
  if (href === from) return;
  const { memory } = read();
  write({ memory: nextFlowMemory(from === null ? emptyFlowMemory : memory, from, href), last: href });
}

/** The last page recorded in this tab, or null. */
export function lastVisit(): string | null {
  return read().last;
}

export function currentFlowMemory(): FlowMemory {
  return read().memory;
}
