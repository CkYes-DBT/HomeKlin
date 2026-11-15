import { beforeEach, describe, expect, it, vi } from "vitest";

// B9: the order's emails after the confirmation (src/lib/email/order-templates.ts and
// order-emails.ts) and "Kirim ulang email" (src/lib/booking/email-actions.ts), with stand-in clients.
// Nothing is sent: sendAppEmail is replaced. The database side is in tests/integration/order-emails.test.ts.

const orderId = "0b8f3c1e-1111-4222-8333-944455556666";
const { serviceRpc, sessionRpc, sendAppEmail } = vi.hoisted(() => ({ serviceRpc: vi.fn(), sessionRpc: vi.fn(), sendAppEmail: vi.fn() }));
let user: { role: string } | null = null;

vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: () => ({ rpc: serviceRpc }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc: sessionRpc }) }));
vi.mock("@/lib/auth/dal", () => ({ authorize: async (roles: string[]) => (user && roles.includes(user.role) ? user : null) }));
vi.mock("@/lib/email/send", async (original) => ({ ...(await original<typeof import("@/lib/email/send")>()), sendAppEmail }));

const { cleanerAssignedEmail, recordingReadyEmail } = await import("@/lib/email/order-templates");
const { emailCleanerAssigned, emailRecordingReady, emailOrderAgain } = await import("@/lib/email/order-emails");
const { resendOrderEmail } = await import("@/lib/booking/email-actions");

const facts = {
  customer_email: "nadia@contoh.id",
  order_code: "HK-1042",
  service_name_id: "Pembersihan Rutin",
  service_name_en: "Regular Cleaning",
  starts_at: "2026-11-20T01:00:00Z",
  ends_at: "2026-11-20T03:00:00Z",
  address: "Jl. Melati No. 10, Jakarta",
  price_idr: 85000,
  status: "paid",
  cleaner_name: "Rina <b>Wulandari</b>",
  cleaner_photo_url: "/images/cleaner-rina.jpg",
  recording_expires_at: "2026-11-27T03:00:00Z",
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, entry] of Object.entries(values)) data.set(key, entry);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  serviceRpc.mockResolvedValue({ data: [facts], error: null });
  sessionRpc.mockResolvedValue({ data: null, error: null });
  sendAppEmail.mockResolvedValue({ sent: true });
  user = { role: "customer" };
});

describe("the templates", () => {
  const site = "https://homeklin.test";

  it("names the cleaner with a photo, the order number and the window, never an agency", () => {
    const email = cleanerAssignedEmail(
      { orderCode: "HK-1042", serviceName: "Pembersihan Rutin", startsAt: facts.starts_at, endsAt: facts.ends_at, cleanerName: "Rina <b>Wulandari</b>", cleanerPhotoUrl: `${site}/images/cleaner-rina.jpg`, orderUrl: `${site}/orders?order=${orderId}` },
      "id",
    );
    expect(email.subject).toContain("HK-1042");
    expect(email.text).toContain("Rina <b>Wulandari</b>");
    expect(email.html).toContain("Rina &lt;b&gt;Wulandari&lt;/b&gt;");
    expect(email.html).toContain(`<img src="${site}/images/cleaner-rina.jpg"`);
    expect(email.text).toContain("Jumat, 20 November 2026, 08.00 sampai 10.00 WIB");
    expect(`${email.subject}${email.text}${email.html}`).not.toMatch(/agensi|agency|mitra|partner/i);
  });

  it("leaves the photo out when there is none", () => {
    const email = cleanerAssignedEmail(
      { orderCode: "HK-1042", serviceName: "Regular Cleaning", startsAt: facts.starts_at, endsAt: facts.ends_at, cleanerName: "Rina", cleanerPhotoUrl: null, orderUrl: `${site}/en/orders` },
      "en",
    );
    expect(email.html).not.toContain("<img");
    expect(email.subject).toMatch(/cleaner/i);
  });

  it("says the recording is ready and until when it can be played", () => {
    const email = recordingReadyEmail({ orderCode: "HK-1042", serviceName: "Regular Cleaning", expiresAt: facts.recording_expires_at, orderUrl: `${site}/en/orders?order=${orderId}` }, "en");
    expect(email.subject).toMatch(/recording/i);
    expect(email.text).toContain("Friday, 27 November 2026");
    expect(email.text).toContain(`${site}/en/orders?order=${orderId}`);
  });
});

describe("the senders", () => {
  it("email the order's customer, from the server's facts", async () => {
    expect(await emailCleanerAssigned(orderId)).toEqual({ sent: true });
    expect(serviceRpc).toHaveBeenCalledWith("order_email_facts", { p_order: orderId });
    const [message] = sendAppEmail.mock.calls[0] as [{ to: string; html: string }];
    expect(message.to).toBe("nadia@contoh.id");
    // A site photo becomes an absolute address, which mail apps can load.
    expect(message.html).toMatch(/<img src="https:\/\/[^"]+\/images\/cleaner-rina\.jpg"/);

    await emailRecordingReady(orderId);
    await emailOrderAgain(orderId, "en");
    expect(sendAppEmail).toHaveBeenCalledTimes(3);
  });

  it("send nothing, and never throw, when there is nothing to send or the read fails", async () => {
    serviceRpc.mockResolvedValueOnce({ data: [{ ...facts, cleaner_name: null }], error: null });
    expect(await emailCleanerAssigned(orderId)).toEqual({ sent: false, reason: "not_ready" });
    serviceRpc.mockResolvedValueOnce({ data: [{ ...facts, recording_expires_at: null }], error: null });
    expect(await emailRecordingReady(orderId)).toEqual({ sent: false, reason: "not_ready" });
    serviceRpc.mockResolvedValueOnce({ data: [{ ...facts, customer_email: null }], error: null });
    expect(await emailOrderAgain(orderId, "id")).toEqual({ sent: false, reason: "not_ready" });
    serviceRpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await emailRecordingReady(orderId)).toEqual({ sent: false, reason: "failed" });
    serviceRpc.mockRejectedValueOnce(new Error("network"));
    expect(await emailCleanerAssigned(orderId)).toEqual({ sent: false, reason: "failed" });
    expect(sendAppEmail).not.toHaveBeenCalled();
  });
});

describe("resendOrderEmail (Kirim ulang email)", () => {
  it("claims the resend for the customer's own order, then emails the order again", async () => {
    expect(await resendOrderEmail(null, form({ orderId, locale: "en" }))).toEqual({ ok: true });
    expect(sessionRpc).toHaveBeenCalledWith("claim_order_email_resend", { p_order: orderId });
    expect(sendAppEmail).toHaveBeenCalledTimes(1);
    expect((sendAppEmail.mock.calls[0] as [{ subject: string }])[0].subject).toBe("Your HomeKlin order has been placed");
  });

  it("says when it is too soon, and sends nothing", async () => {
    sessionRpc.mockResolvedValue({ data: null, error: { message: "too_soon" } });
    expect(await resendOrderEmail(null, form({ orderId }))).toEqual({ formError: "tooSoon" });
    sessionRpc.mockResolvedValue({ data: null, error: { message: "order_not_found" } });
    expect(await resendOrderEmail(null, form({ orderId }))).toEqual({ formError: "notFound" });
    expect(sendAppEmail).not.toHaveBeenCalled();
  });

  it("refuses anyone but a customer, and a malformed order id, before the database", async () => {
    expect(await resendOrderEmail(null, form({ orderId: "x" }))).toEqual({ formError: "notFound" });
    user = { role: "agency" };
    expect(await resendOrderEmail(null, form({ orderId }))).toEqual({ formError: "notCustomer" });
    expect(sessionRpc).not.toHaveBeenCalled();
  });

  it("reports a failed send without hiding that the claim was made", async () => {
    sendAppEmail.mockResolvedValue({ sent: false, reason: "not_configured" });
    expect(await resendOrderEmail(null, form({ orderId }))).toEqual({ formError: "unavailable" });
  });
});
