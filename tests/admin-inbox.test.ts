import { describe, expect, it } from "vitest";
import { filterInbox, inboxCounts, parseInboxFilters } from "@/components/admin/inbox-filters";

// The support inbox's filters (D1, the user's mock "Admin-Support"): "Tampilkan" (all, waiting for an
// answer, closed) and the search for a name or an order number. Pure rules; the page renders the result.

type Row = { id: string; status: "open" | "answered" | "closed"; customerName: string | null; question: string; orderId: string | null };

const tickets: Row[] = [
  { id: "1", status: "open", customerName: "Nadia Putri", question: "Petugas belum tiba.", orderId: "order-a" },
  { id: "2", status: "answered", customerName: "Dimas Prakoso", question: "Bisakah jadwal dipindah?", orderId: null },
  { id: "3", status: "closed", customerName: null, question: "Rekaman tidak bisa diputar.", orderId: "order-b" },
  { id: "4", status: "open", customerName: "Siti Rahmawati", question: "Cara bayar dengan QRIS?", orderId: null },
];
const codes = new Map([
  ["order-a", "HK-1042"],
  ["order-b", "HK-1037"],
]);
const ids = (rows: readonly Row[]) => rows.map((row) => row.id);

describe("parseInboxFilters", () => {
  it("shows every ticket with no search by default", () => {
    expect(parseInboxFilters({})).toEqual({ show: "all", query: "" });
  });

  it("reads a known view and a trimmed search, the first value of each", () => {
    expect(parseInboxFilters({ show: ["waiting", "closed"], q: "  nadia " })).toEqual({ show: "waiting", query: "nadia" });
    expect(parseInboxFilters({ show: "closed" }).show).toBe("closed");
  });

  it("ignores an unknown view and cuts a long search", () => {
    expect(parseInboxFilters({ show: "spam" }).show).toBe("all");
    expect(parseInboxFilters({ q: "x".repeat(300) }).query).toHaveLength(80);
  });
});

describe("filterInbox", () => {
  it("keeps the order the inbox function gives", () => {
    expect(ids(filterInbox(tickets, { show: "all", query: "" }, codes))).toEqual(["1", "2", "3", "4"]);
  });

  it("Perlu dijawab keeps the tickets waiting for admin; Selesai the closed ones", () => {
    expect(ids(filterInbox(tickets, { show: "waiting", query: "" }, codes))).toEqual(["1", "4"]);
    expect(ids(filterInbox(tickets, { show: "closed", query: "" }, codes))).toEqual(["3"]);
  });

  it("finds a name, any case, or an order number, whole or in part", () => {
    expect(ids(filterInbox(tickets, { show: "all", query: "NADIA" }, codes))).toEqual(["1"]);
    expect(ids(filterInbox(tickets, { show: "all", query: "hk-1037" }, codes))).toEqual(["3"]);
    expect(ids(filterInbox(tickets, { show: "all", query: "1042" }, codes))).toEqual(["1"]);
  });

  it("also searches the question, and combines with the view", () => {
    expect(ids(filterInbox(tickets, { show: "all", query: "qris" }, codes))).toEqual(["4"]);
    expect(ids(filterInbox(tickets, { show: "closed", query: "nadia" }, codes))).toEqual([]);
  });
});

describe("inboxCounts", () => {
  it("counts every view for the select's labels", () => {
    expect(inboxCounts(tickets)).toEqual({ all: 4, waiting: 2, closed: 1 });
  });
});
