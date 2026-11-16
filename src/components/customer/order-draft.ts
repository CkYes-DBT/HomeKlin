// What the customer typed on step 2 (address, note, phone, guest email), kept while they go back to
// step 1 with "Ubah" and restored when step 2 opens again. It lives in the tab's sessionStorage only:
// never on the server and never in the address (an address in the URL ends up in the history and in
// logs). It is read once and then removed, and the consent is never kept: it is given again on the
// form. Storage can be missing or throw (a private window), so every call is guarded.

export type OrderDraft = { address: string; note: string; phone: string; email: string };

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const orderDraftKey = "homeklin:order-draft";

/** The form's limits (src/lib/validation/booking.ts): anything longer is cut, never trusted. */
const limits: Record<keyof OrderDraft, number> = { address: 300, note: 300, phone: 30, email: 254 };
const fields = Object.keys(limits) as (keyof OrderDraft)[];

export function draftFromForm(data: Pick<FormData, "get">): OrderDraft {
  const read = (name: keyof OrderDraft) => {
    const value = data.get(name);
    return typeof value === "string" ? value : "";
  };
  return { address: read("address"), note: read("note"), phone: read("phone"), email: read("email") };
}

export function parseOrderDraft(text: string | null): OrderDraft | null {
  if (!text) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!fields.every((field) => typeof record[field] === "string")) return null;
  return Object.fromEntries(fields.map((field) => [field, (record[field] as string).slice(0, limits[field])])) as OrderDraft;
}

export function saveOrderDraft(storage: DraftStorage, draft: OrderDraft): void {
  try {
    if (fields.every((field) => draft[field].trim() === "")) storage.removeItem(orderDraftKey);
    else storage.setItem(orderDraftKey, JSON.stringify(draft));
  } catch {
    // No storage in this browser: going back to step 1 then starts the form empty, as before.
    return;
  }
}

/** The kept draft, removed from storage as it is read. */
export function restoreOrderDraft(storage: DraftStorage): OrderDraft | null {
  try {
    const draft = parseOrderDraft(storage.getItem(orderDraftKey));
    storage.removeItem(orderDraftKey);
    return draft;
  } catch {
    return null;
  }
}
