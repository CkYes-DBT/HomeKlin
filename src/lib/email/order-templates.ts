import type { Locale } from "next-intl";
import { cleanerBlock, emailHtml, emailText, escapeHtml, type EmailLayout } from "./layout";
import { jakartaDay, jakartaTime, type EmailMessage } from "./send";

// The order's emails after the confirmation (B9), in the redesign's look since D5 (mocks
// Customer-Email-Order and Customer-Email-Replay, ./layout.ts): the cleaner the agency assigned, and
// the recording that is ready to replay. They name HomeKlin and the Petugas HomeKlin, never the
// agency. The button opens the order's private page (/o/<token>, B14a) when the backend made a link.

export type CleanerAssignedInfo = {
  orderCode: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  cleanerName: string;
  /** An absolute https address, or null for none. */
  cleanerPhotoUrl: string | null;
  orderUrl: string;
};

export type RecordingReadyInfo = { orderCode: string; serviceName: string; expiresAt: string; orderUrl: string };

const siteUrl = () => (process.env.SITE_URL ?? "https://home-klin.vercel.app").replace(/\/+$/, "");

const copy = {
  id: {
    assignedSubject: (code: string) => `Petugas HomeKlin untuk pesanan ${code} sudah ditentukan`,
    assignedTitle: "Petugas HomeKlin Anda sudah ditentukan",
    assignedIntro: "Berikut detail pesanan Anda dan Petugas HomeKlin yang akan datang ke rumah Anda.",
    details: "Detail pesanan",
    order: "Nomor pesanan",
    service: "Layanan",
    date: "Tanggal",
    time: "Jam",
    window: (start: string, end: string) => `${start} sampai ${end} WIB`,
    yourCleaner: "Petugas HomeKlin Anda",
    role: "Petugas HomeKlin",
    facts: (code: string) => [
      `Ditugaskan untuk pesanan ${code}`,
      "Check-in di alamat Anda pada hari pekerjaan",
      "Siaran langsung hanya dapat ditonton Anda dan tim pemantau HomeKlin",
    ],
    open: "Lihat pesanan",
    openAfter: "Di halaman pesanan, Anda melihat status dan menonton siaran langsung setelah Petugas check-in.",
    readySubject: (code: string) => `Pesanan ${code} selesai: rekaman tersedia 7 hari`,
    readyBadge: "Selesai",
    readyTitle: "Pekerjaan sudah selesai",
    readyIntro: "Petugas HomeKlin sudah check-out. Rekaman pekerjaan di rumah Anda sudah siap diputar.",
    summary: "Ringkasan pekerjaan",
    readyNote: (day: string, time: string) =>
      `Rekaman tersedia 7 hari. Dihapus otomatis pada ${day}, ${time} WIB. Hanya Anda dan tim HomeKlin yang dapat menontonnya.`,
    replay: "Putar rekaman",
  },
  en: {
    assignedSubject: (code: string) => `Your HomeKlin cleaner for order ${code}`,
    assignedTitle: "Your HomeKlin cleaner is assigned",
    assignedIntro: "Here are your order details and the HomeKlin cleaner who will come to your home.",
    details: "Order details",
    order: "Order number",
    service: "Service",
    date: "Date",
    time: "Time",
    window: (start: string, end: string) => `${start} to ${end} WIB`,
    yourCleaner: "Your HomeKlin cleaner",
    role: "HomeKlin cleaner",
    facts: (code: string) => [
      `Assigned to order ${code}`,
      "Checks in at your address on the day",
      "Only you and the HomeKlin monitoring team can watch the live stream",
    ],
    open: "View your order",
    openAfter: "On the order page you see the status, and watch live once your cleaner checks in.",
    readySubject: (code: string) => `Order ${code} is done: the recording is kept for 7 days`,
    readyBadge: "Done",
    readyTitle: "The job is done",
    readyIntro: "Your HomeKlin cleaner has checked out. The recording of the work at your home is ready to play.",
    summary: "Job summary",
    readyNote: (day: string, time: string) =>
      `The recording is kept for 7 days. It is deleted automatically on ${day}, ${time} WIB. Only you and the HomeKlin team can watch it.`,
    replay: "Play the recording",
  },
} as const;

const message = (subject: string, layout: EmailLayout, extraText: string[] = []): Omit<EmailMessage, "to"> => ({
  subject,
  html: emailHtml(layout),
  text: [emailText(layout), ...extraText].join("\n"),
});

/** The cleaner the agency assigned, with their photo when there is one (initials otherwise). */
export function cleanerAssignedEmail(info: CleanerAssignedInfo, locale: Locale): Omit<EmailMessage, "to"> {
  const t = copy[locale];
  const heading = `<p style="margin:4px 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;color:#14271c;">${escapeHtml(t.yourCleaner)}</p>`;
  const layout: EmailLayout = {
    locale,
    title: t.assignedTitle,
    intro: t.assignedIntro,
    sections: [
      {
        kind: "rows",
        title: t.details,
        rows: [
          [t.order, info.orderCode],
          [t.service, info.serviceName],
          [t.date, jakartaDay(info.startsAt, locale)],
          [t.time, t.window(jakartaTime(info.startsAt), jakartaTime(info.endsAt))],
        ],
      },
      { kind: "card", html: heading + cleanerBlock(info.cleanerName, info.cleanerPhotoUrl, t.role, t.facts(info.orderCode)) },
    ],
    button: { label: t.open, url: info.orderUrl },
    after: t.openAfter,
    siteUrl: siteUrl(),
  };
  const when = `${jakartaDay(info.startsAt, locale)}, ${t.window(jakartaTime(info.startsAt), jakartaTime(info.endsAt))}`;
  return message(t.assignedSubject(info.orderCode), layout, ["", `${t.yourCleaner}: ${info.cleanerName}`, when]);
}

/** The job's recording is ready to replay, until it is deleted. */
export function recordingReadyEmail(info: RecordingReadyInfo, locale: Locale): Omit<EmailMessage, "to"> {
  const t = copy[locale];
  const layout: EmailLayout = {
    locale,
    badge: t.readyBadge,
    title: t.readyTitle,
    intro: t.readyIntro,
    sections: [
      { kind: "rows", title: t.summary, rows: [[t.order, info.orderCode], [t.service, info.serviceName]] },
      { kind: "note", text: t.readyNote(jakartaDay(info.expiresAt, locale), jakartaTime(info.expiresAt)) },
    ],
    button: { label: t.replay, url: info.orderUrl },
    siteUrl: siteUrl(),
  };
  return message(t.readySubject(info.orderCode), layout);
}
