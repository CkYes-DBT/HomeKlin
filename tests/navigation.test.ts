import { Building2, ChartColumn, CircleHelp, History, LayoutGrid, MessageCircle, ShieldCheck, Video } from "lucide-react";
import { describe, expect, it } from "vitest";
import { isActivePath } from "@/components/shell/is-active-path";
import { appNavigation } from "@/components/shell/app-navigation";
import { backOfficeNavigation } from "@/components/shell/back-office-navigation";
import { navigation, navigationMessages, type NavKey } from "@/components/shell/navigation";
import en from "@/messages/en.json";
import id from "@/messages/id.json";

const messages = { id, en };
type Locale = keyof typeof messages;

/** The text a message key stands for, e.g. ("id", "AppNavigation", "customer.home") -> "Beranda". */
function message(locale: Locale, namespace: string, key: string): string {
  const value = `${namespace}.${key}`
    .split(".")
    .reduce<unknown>(
      (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
      messages[locale],
    );
  if (typeof value !== "string") throw new Error(`${locale} has no message ${namespace}.${key}`);
  return value;
}

/** A navigation as people read it in one language: [label, href] per item. */
function items(nav: NavKey, locale: Locale) {
  return navigation[nav].items.map((item) => [message(locale, navigationMessages[nav], item.labelKey), item.href]);
}

function landmark(nav: NavKey, locale: Locale) {
  return message(locale, navigationMessages[nav], navigation[nav].labelKey);
}

const navKeys = Object.keys(navigation) as NavKey[];

describe("isActivePath", () => {
  it("marks an exact item as active only on that exact path", () => {
    const home = { href: "/home", exact: true };
    expect(isActivePath("/home", home)).toBe(true);
    expect(isActivePath("/home/settings", home)).toBe(false);
    expect(isActivePath("/services", home)).toBe(false);
  });

  it("keeps a dashboard root inactive on its sub-pages", () => {
    const dashboard = { href: "/agency", exact: true };
    expect(isActivePath("/agency", dashboard)).toBe(true);
    expect(isActivePath("/agency/schedule", dashboard)).toBe(false);
  });

  it("marks a section as active on its own path and on deeper paths", () => {
    const services = { href: "/services" };
    expect(isActivePath("/services", services)).toBe(true);
    expect(isActivePath("/services/deep", services)).toBe(true);
  });

  it("does not treat a path that only shares a prefix as the same section", () => {
    expect(isActivePath("/order", { href: "/orders" })).toBe(false);
    expect(isActivePath("/services-old", { href: "/services" })).toBe(false);
  });

  it("also marks an item active on the extra paths it names, and their sub-pages", () => {
    const cleaners = { href: "/agency/cleaners", alsoOn: ["/agency/schedule"] };
    expect(isActivePath("/agency/schedule", cleaners)).toBe(true);
    expect(isActivePath("/agency/schedule/deep", cleaners)).toBe(true);
    expect(isActivePath("/agency/schedules", cleaners)).toBe(false);
    expect(isActivePath("/agency/orders", cleaners)).toBe(false);
  });

  it("ignores a trailing slash", () => {
    expect(isActivePath("/services/", { href: "/services" })).toBe(true);
    expect(isActivePath("/agency/", { href: "/agency", exact: true })).toBe(true);
  });
});

describe("navigation", () => {
  it("gives the customer four section links, in order, in Indonesian", () => {
    expect(items("customer", "id")).toEqual([
      ["Beranda", "/home"],
      ["Layanan", "/services"],
      ["Pesanan", "/orders"],
      ["Bantuan", "/support"],
    ]);
  });

  it("gives the customer the same four section links in English", () => {
    expect(items("customer", "en")).toEqual([
      ["Home", "/home"],
      ["Services", "/services"],
      ["Orders", "/orders"],
      ["Help", "/support"],
    ]);
  });

  // The fifth customer item is not a page: "Akun" opens a menu with the name and the way out, so the
  // customer has no account page to link to (src/components/shell/account-menu.tsx).
  it("gives the customer an account menu as the fifth item, with no address of its own", () => {
    const account = appNavigation.customer.account;
    expect(message("id", "AppNavigation", account.labelKey)).toBe("Akun");
    expect(message("en", "AppNavigation", account.labelKey)).toBe("Account");
    expect(account).not.toHaveProperty("href");
    const hrefs = appNavigation.customer.items.map((item) => item.href);
    expect(hrefs).not.toContain("/account");
  });

  it("never names or links a partner agency in the customer navigation, in either language", () => {
    for (const locale of ["id", "en"] as const) {
      const text = JSON.stringify([landmark("customer", locale), items("customer", locale)]);
      expect(text, locale).not.toMatch(/agensi|agenc|mitra|partner/i);
    }
  });

  it("keeps the back-office menus and their labels out of what the customer and cleaner pages download", () => {
    expect(Object.keys(appNavigation)).toEqual(["customer", "cleaner"]);
    expect(Object.keys(backOfficeNavigation)).toEqual(["agency", "admin", "owner"]);
    expect(navigation).toEqual({ ...appNavigation, ...backOfficeNavigation });
    expect(JSON.stringify(appNavigation)).not.toMatch(/agensi|agency|mitra|partner/i);
    // The app shells send the AppNavigation messages to the browser (src/components/shell/mobile-shell.tsx).
    expect(navigationMessages.customer).toBe("AppNavigation");
    expect(navigationMessages.cleaner).toBe("AppNavigation");
    expect(JSON.stringify([id.AppNavigation, en.AppNavigation])).not.toMatch(/agensi|agency|mitra|partner/i);
  });

  it("keeps the cleaner navigation minimal: home, jobs and account (D4; Riwayat waits for a history read)", () => {
    expect(items("cleaner", "id")).toEqual([
      ["Beranda", "/cleaner"],
      ["Pekerjaan", "/cleaner/jobs"],
      ["Akun", "/cleaner/account"],
    ]);
    expect(items("cleaner", "en")).toEqual([
      ["Home", "/cleaner"],
      ["Jobs", "/cleaner/jobs"],
      ["Account", "/cleaner/account"],
    ]);
  });

  it("gives the agency the partner mock's sections in order (D2), plus its cleaners' videos", () => {
    expect(items("agency", "id")).toEqual([
      ["Ringkasan", "/agency"],
      ["Pekerjaan masuk", "/agency/orders"],
      ["Pesanan selesai", "/agency/past"],
      ["Petugas", "/agency/cleaners"],
      ["Video petugas", "/agency/recordings"],
      ["Layanan", "/agency/services"],
    ]);
    expect(items("agency", "en")).toEqual([
      ["Summary", "/agency"],
      ["Incoming jobs", "/agency/orders"],
      ["Completed orders", "/agency/past"],
      ["Cleaners", "/agency/cleaners"],
      ["Cleaner videos", "/agency/recordings"],
      ["Services", "/agency/services"],
    ]);
  });

  it("keeps Petugas current on the schedule, which belongs to the cleaners and their availability", () => {
    const cleaners = backOfficeNavigation.agency.items.find((item) => item.href === "/agency/cleaners");
    expect(cleaners && isActivePath("/agency/schedule", cleaners)).toBe(true);
    const others = backOfficeNavigation.agency.items.filter((item) => item.href !== "/agency/cleaners");
    expect(others.some((item) => isActivePath("/agency/schedule", item))).toBe(false);
  });

  it("gives the admin the five console sections of the mock, live monitoring first, with no dashboard", () => {
    expect(items("admin", "id")).toEqual([
      ["Pemantauan langsung", "/admin/monitor"],
      ["Layanan dan harga", "/admin/services"],
      ["Obrolan bantuan", "/admin/tickets"],
      ["Pertanyaan umum", "/admin/faq"],
      ["Rekaman", "/admin/recordings"],
    ]);
    expect(items("admin", "en")).toEqual([
      ["Live monitoring", "/admin/monitor"],
      ["Services and prices", "/admin/services"],
      ["Support chats", "/admin/tickets"],
      ["FAQ", "/admin/faq"],
      ["Recordings", "/admin/recordings"],
    ]);
    // The mock's glyphs: camera, four squares, chat bubble, help circle, clock with a circular arrow.
    expect(backOfficeNavigation.admin.items.map((item) => item.icon)).toEqual([Video, LayoutGrid, MessageCircle, CircleHelp, History]);
  });

  it("gives the owner the overview, the partner agencies and the admin accounts, as in the mocks", () => {
    expect(items("owner", "id")).toEqual([
      ["Ringkasan", "/owner"],
      ["Mitra agensi", "/owner/agencies"],
      ["Akun admin", "/owner/admins"],
    ]);
    expect(items("owner", "en")).toEqual([
      ["Overview", "/owner"],
      ["Partner agencies", "/owner/agencies"],
      ["Admin accounts", "/owner/admins"],
    ]);
    // The mocks' glyphs: bar chart, office building, shield with a tick.
    expect(backOfficeNavigation.owner.items.map((item) => item.icon)).toEqual([ChartColumn, Building2, ShieldCheck]);
  });

  it("marks exactly one item as current on each item's own page", () => {
    for (const [key, { items: navItems }] of Object.entries(navigation)) {
      for (const item of navItems) {
        const current = navItems.filter((other) => isActivePath(item.href, other)).map((other) => other.href);
        expect(current, `${key} navigation on ${item.href}`).toEqual([item.href]);
      }
    }
  });

  it("names each navigation landmark differently, so screen readers can tell them apart", () => {
    for (const locale of ["id", "en"] as const) {
      const labels = navKeys.map((nav) => landmark(nav, locale));
      expect(labels[0], locale).toBe(locale === "id" ? "Navigasi utama" : "Main navigation");
      expect(new Set(labels).size, locale).toBe(labels.length);
    }
  });
});
