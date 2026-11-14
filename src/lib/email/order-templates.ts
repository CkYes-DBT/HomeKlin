import type { Locale } from "next-intl";
import { escapeHtml, jakartaDay, jakartaTime, type EmailMessage } from "./send";

// The order's emails after the confirmation (B9; mocks Customer-Email-Order and Customer-Email-Replay):
// the cleaner the agency assigned, and the recording that is ready to replay. Same look as the
// confirmation in send.ts (tables and inline styles only, the evergreen brand colour). They name
// HomeKlin and the cleaner, never the agency.

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

const copy = {
  id: {
    assignedSubject: (code: string) => `Petugas untuk pesanan ${code} sudah ditentukan`,
    assignedIntro: "Petugas HomeKlin yang akan datang ke rumah Anda:",
    cleaner: "Petugas",
    service: "Layanan",
    arrival: "Petugas datang",
    order: "Nomor pesanan",
    open: "Lihat pesanan",
    readySubject: (code: string) => `Rekaman pesanan ${code} siap diputar`,
    readyIntro: "Pekerjaan sudah selesai. Rekamannya bisa Anda putar ulang di halaman pesanan.",
    until: "Bisa diputar sampai",
    replay: "Putar rekaman",
    readyNote: "Rekaman dihapus otomatis setelah 7 hari.",
  },
  en: {
    assignedSubject: (code: string) => `Your cleaner for order ${code}`,
    assignedIntro: "The HomeKlin cleaner coming to your home:",
    cleaner: "Cleaner",
    service: "Service",
    arrival: "Cleaner arrives",
    order: "Order number",
    open: "View your order",
    readySubject: (code: string) => `The recording of order ${code} is ready`,
    readyIntro: "The job is done. You can replay its recording on the order page.",
    until: "Can be replayed until",
    replay: "Replay the recording",
    readyNote: "Recordings are deleted automatically after 7 days.",
  },
} as const;

function layout(locale: Locale, title: string, intro: string, rows: [string, string][], button: { label: string; url: string }, extra = "", note = "") {
  const detailRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #e3e9e6;font-size:13px;color:#5b6862;width:38%;vertical-align:top;">${escapeHtml(label)}</td>` +
        `<td style="padding:10px 0;border-bottom:1px solid #e3e9e6;font-size:15px;color:#17231e;font-weight:bold;vertical-align:top;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return `<!doctype html>
<html lang="${locale}">
<body style="margin:0;padding:0;background:#f2f6f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6f4;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;font-family:Arial,Helvetica,sans-serif;color:#17231e;">
<tr><td style="background:#1d6f55;border-radius:16px 16px 0 0;padding:20px 28px;"><span style="font-size:20px;font-weight:bold;color:#ffffff;">HomeKlin</span></td></tr>
<tr><td style="padding:28px 28px 8px;">
<p style="margin:0 0 8px;font-size:18px;font-weight:bold;">${escapeHtml(title)}</p>
<p style="margin:0 0 16px;font-size:15px;line-height:22px;color:#3d4a44;">${escapeHtml(intro)}</p>
${extra}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${detailRows}</table>
</td></tr>
<tr><td style="padding:16px 28px 8px;">
<a href="${escapeHtml(button.url)}" style="display:inline-block;background:#1d6f55;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:12px 24px;border-radius:999px;">${escapeHtml(button.label)}</a>
</td></tr>
<tr><td style="padding:12px 28px 28px;"><p style="margin:0;font-size:13px;line-height:20px;color:#5b6862;">${escapeHtml(note)}</p></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const asText = (intro: string, rows: [string, string][], button: { label: string; url: string }, note = "") =>
  [intro, "", ...rows.map(([label, value]) => `${label}: ${value}`), "", `${button.label}: ${button.url}`, ...(note ? ["", note] : [])].join("\n");

/** The cleaner the agency assigned, with their photo when there is one. */
export function cleanerAssignedEmail(info: CleanerAssignedInfo, locale: Locale): Omit<EmailMessage, "to"> {
  const t = copy[locale];
  const rows: [string, string][] = [
    [t.cleaner, info.cleanerName],
    [t.service, info.serviceName],
    [t.arrival, `${jakartaDay(info.startsAt, locale)}, ${jakartaTime(info.startsAt)} - ${jakartaTime(info.endsAt)} WIB`],
    [t.order, info.orderCode],
  ];
  const button = { label: t.open, url: info.orderUrl };
  const photo =
    info.cleanerPhotoUrl && /^https:\/\//.test(info.cleanerPhotoUrl)
      ? `<p style="margin:0 0 16px;"><img src="${escapeHtml(info.cleanerPhotoUrl)}" alt="${escapeHtml(info.cleanerName)}" width="96" height="96" style="display:block;width:96px;height:96px;border-radius:48px;object-fit:cover;"></p>`
      : "";
  const subject = t.assignedSubject(info.orderCode);
  return { subject, text: asText(t.assignedIntro, rows, button), html: layout(locale, subject, t.assignedIntro, rows, button, photo) };
}

/** The job's recording is ready to replay, until it is deleted. */
export function recordingReadyEmail(info: RecordingReadyInfo, locale: Locale): Omit<EmailMessage, "to"> {
  const t = copy[locale];
  const rows: [string, string][] = [
    [t.service, info.serviceName],
    [t.until, `${jakartaDay(info.expiresAt, locale)}, ${jakartaTime(info.expiresAt)} WIB`],
    [t.order, info.orderCode],
  ];
  const button = { label: t.replay, url: info.orderUrl };
  const subject = t.readySubject(info.orderCode);
  return { subject, text: asText(t.readyIntro, rows, button, t.readyNote), html: layout(locale, subject, t.readyIntro, rows, button, "", t.readyNote) };
}
