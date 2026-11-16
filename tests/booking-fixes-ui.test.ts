import { describe, expect, it } from "vitest";
import { chosenWindow, dayHasFree, markTaken, type BookingDay } from "@/components/customer/booking-days";
import { draftFromForm, parseOrderDraft, restoreOrderDraft, saveOrderDraft } from "@/components/customer/order-draft";
import { unpaidHoldUntil } from "@/components/customer/payment-hold";
import { formatJakartaDay } from "@/lib/catalog/slots-days";

// The booking flow after the Impeccable critique (2026-11-16): step 2 marks full and just-taken
// windows the way step 1 does (shown, not choosable), "Ubah" keeps what the customer typed in this
// tab only, the day selects use short day names, and step 3 says until when an unpaid order keeps
// its time.

const days: BookingDay[] = [
  {
    date: "2026-11-16",
    label: "Besok, Senin 16 November",
    short: "Besok, Sen 16 Nov",
    windows: [
      { startsAt: "2026-11-16T01:00:00.000Z", label: "08.00-10.00", start: "08.00", end: "10.00", isFull: false },
      { startsAt: "2026-11-16T03:00:00.000Z", label: "10.00-12.00", start: "10.00", end: "12.00", isFull: true },
    ],
  },
  {
    date: "2026-11-17",
    label: "Selasa, 17 November",
    short: "Sel, 17 Nov",
    windows: [{ startsAt: "2026-11-17T01:00:00.000Z", label: "08.00-10.00", start: "08.00", end: "10.00", isFull: false }],
  },
];

describe("step 2's windows", () => {
  it("marks a window taken while the page was open as full, and keeps it on the page", () => {
    const after = markTaken(days, ["2026-11-16T01:00:00.000Z"]);
    expect(after[0].windows.map((window) => window.isFull)).toEqual([true, true]);
    expect(after[1].windows[0].isFull).toBe(false);
    // The original is left as it was.
    expect(days[0].windows[0].isFull).toBe(false);
  });

  it("knows whether a day has a free window left", () => {
    expect(dayHasFree(days[0])).toBe(true);
    expect(dayHasFree(markTaken(days, ["2026-11-16T01:00:00.000Z"])[0])).toBe(false);
  });

  it("finds the chosen window only when it is still free", () => {
    expect(chosenWindow(days, "2026-11-17T01:00:00.000Z")?.day.date).toBe("2026-11-17");
    expect(chosenWindow(days, "2026-11-16T03:00:00.000Z")).toBeUndefined();
    expect(chosenWindow(days, null)).toBeUndefined();
  });
});

describe("the order draft kept for Ubah", () => {
  const form = new FormData();
  form.set("address", "  Jl. Contoh No. 12, Gambir  ");
  form.set("note", "Pintu samping");
  form.set("phone", "0812 3456 7890");
  form.set("email", "nadia@example.com");
  form.set("consent", "on");

  it("takes the typed fields only, never the consent", () => {
    expect(draftFromForm(form)).toEqual({
      address: "  Jl. Contoh No. 12, Gambir  ",
      note: "Pintu samping",
      phone: "0812 3456 7890",
      email: "nadia@example.com",
    });
  });

  it("reads back only a well-formed draft, cut to the form's limits", () => {
    expect(parseOrderDraft(null)).toBeNull();
    expect(parseOrderDraft("not json")).toBeNull();
    expect(parseOrderDraft(JSON.stringify({ address: 12 }))).toBeNull();
    const long = parseOrderDraft(JSON.stringify({ address: "a".repeat(500), note: "", phone: "", email: "" }));
    expect(long?.address).toHaveLength(300);
  });

  it("an empty form leaves no draft behind", () => {
    const storage = memoryStorage();
    saveOrderDraft(storage, { address: "", note: "", phone: "", email: "" });
    expect(storage.length).toBe(0);
  });

  it("is read once: restoring removes it from the tab's storage", () => {
    const storage = memoryStorage();
    saveOrderDraft(storage, draftFromForm(form));
    expect(restoreOrderDraft(storage)?.phone).toBe("0812 3456 7890");
    expect(restoreOrderDraft(storage)).toBeNull();
  });

  it("works without storage (a private window that throws)", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => saveOrderDraft(broken, draftFromForm(form))).not.toThrow();
    expect(restoreOrderDraft(broken)).toBeNull();
  });
});

describe("formatJakartaDay, short", () => {
  it("writes the weekday and the month short, in both languages", () => {
    expect(formatJakartaDay("2026-11-16", "id", "short")).toEqual({ weekday: "Sen", date: "16 Nov" });
    expect(formatJakartaDay("2026-11-16", "en", "short")).toEqual({ weekday: "Mon", date: "16 Nov" });
  });

  it("keeps the long form as the default", () => {
    expect(formatJakartaDay("2026-11-16", "en")).toEqual({ weekday: "Monday", date: "16 November" });
  });
});

describe("unpaidHoldUntil", () => {
  it("is 2 hours after the order was made (release_unpaid_orders)", () => {
    expect(unpaidHoldUntil("2026-11-16T06:12:00.000Z")).toBe("2026-11-16T08:12:00.000Z");
  });
});

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}
