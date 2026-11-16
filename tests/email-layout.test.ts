import { describe, expect, it } from "vitest";
import { cleanerAssignedEmail, recordingReadyEmail } from "@/lib/email/order-templates";
import { orderConfirmationEmail } from "@/lib/email/send";

// D5 pass 5b: the order emails in the redesign's look (mocks Customer-Email-Order and
// Customer-Email-Replay), and still email-safe: tables and inline styles only, no <style> block, no
// script, no web font to download (Arial stands in), no agency. A private order link (/o/<token>,
// B14a) comes with the note that it is the customer's own; every email has the link written out too,
// for a mail app that does not show buttons.

const site = "https://homeklin.test";
const privateUrl = `${site}/o/${"a".repeat(43)}`;
const assigned = cleanerAssignedEmail(
  {
    orderCode: "HK-1042",
    serviceName: "Pembersihan Rutin",
    startsAt: "2026-11-20T01:00:00Z",
    endsAt: "2026-11-20T03:00:00Z",
    cleanerName: "Wulan Anggraeni",
    cleanerPhotoUrl: null,
    orderUrl: privateUrl,
  },
  "id",
);
const ready = recordingReadyEmail(
  { orderCode: "HK-1042", serviceName: "Regular Cleaning", expiresAt: "2026-11-27T03:00:00Z", orderUrl: `${site}/en/orders?order=x` },
  "en",
);
const confirmation = orderConfirmationEmail(
  { serviceName: "Pembersihan Rutin", startsAt: "2026-11-20T01:00:00Z", endsAt: "2026-11-20T03:00:00Z", address: "Jl. Melati", priceIdr: 85000, orderUrl: privateUrl },
  "id",
);

describe("the order emails' layout", () => {
  for (const [name, email] of [
    ["cleaner", assigned],
    ["recording", ready],
    ["confirmation", confirmation],
  ] as const) {
    it(`${name}: email-safe HTML in the forest look`, () => {
      expect(email.html).toContain('role="presentation"');
      expect(email.html).not.toMatch(/<style|<script|<link|@import|fonts\.googleapis/i);
      expect(email.html).toContain("font-family:Arial,Helvetica,sans-serif");
      // The forest wordmark tile, the cream page and the one lime button.
      expect(email.html).toContain("#1b3d2b");
      expect(email.html).toContain("#f3f2ea");
      expect(email.html).toMatch(/background:#d8ef6b[^"]*"[^>]*>/);
      expect(`${email.subject}${email.text}${email.html}`).not.toMatch(/agensi|agency|mitra|partner/i);
      expect(email.text).not.toMatch(/[–—]/);
    });
  }

  it("writes the button's link out for mail apps without buttons", () => {
    expect(assigned.html).toContain("Tombol tidak berfungsi?");
    expect(assigned.html).toContain(`>${privateUrl}</a>`);
    expect(ready.html).toContain("Button not working?");
  });

  it("says a private link is the customer's own, and only then", () => {
    expect(assigned.html).toContain("Tautan ini langsung memasukkan Anda ke akun Anda");
    expect(assigned.text).toContain("Tautan ini langsung memasukkan Anda ke akun Anda");
    expect(ready.html).not.toContain("This link signs you in to your account");
  });

  it("shows the Petugas HomeKlin by initials when there is no photo, with the time as words", () => {
    expect(assigned.html).toContain(">WA<");
    expect(assigned.html).toContain("Petugas HomeKlin");
    expect(assigned.text).toContain("08.00 sampai 10.00 WIB");
    expect(ready.text).toContain("Friday, 27 November 2026");
  });
});
