import type { Locale } from "next-intl";

// The customer emails' one layout (D5, mocks Customer-Email-Order and Customer-Email-Replay), in the
// redesign's colours. Email HTML is not a web page: mail apps drop <style> blocks, scripts and web
// fonts, and many do not render CSS layout, so this is nested tables with inline styles only, Arial in
// place of the site's fonts, and a plain written-out link under the button. The hex colours are the
// site's tokens (src/app/globals.css) written out, because email cannot read CSS variables.

const colour = {
  page: "#f3f2ea", // canvas
  card: "#ffffff",
  ink: "#14271c",
  muted: "#55625a",
  line: "#e2e2d8",
  forest: "#1b3d2b", // primary
  lime: "#d8ef6b",
  onLime: "#14271c",
  limeWash: "#e6edc8",
  onLimeWash: "#1b3d2b",
  field: "#f7f6f0",
  successSurface: "#e4f3ea",
  success: "#276b49",
} as const;

const font = "font-family:Arial,Helvetica,sans-serif";

export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const words = {
  id: {
    noButton: "Tombol tidak berfungsi? Salin tautan ini ke browser Anda:",
    privateLink: "Tautan ini langsung memasukkan Anda ke akun Anda. Jangan bagikan ke orang lain.",
    help: "Butuh bantuan? Balas email ini, atau buka",
    helpLink: "Bantuan",
  },
  en: {
    noButton: "Button not working? Copy this link into your browser:",
    privateLink: "This link signs you in to your account. Do not share it.",
    help: "Need help? Reply to this email, or open",
    helpLink: "Help",
  },
} satisfies Record<Locale, Record<string, string>>;

/** A private order link (B14a) signs the customer in, so the email says not to share it. */
export const isPrivateLink = (url: string) => /\/o\/[A-Za-z0-9_-]+$/.test(url);

export type EmailSection =
  | { kind: "rows"; title: string; rows: [string, string][] }
  | { kind: "card"; html: string }
  | { kind: "note"; text: string };

export type EmailLayout = {
  locale: Locale;
  /** A small status word above the title ("Selesai"), or none. */
  badge?: string;
  title: string;
  intro: string;
  sections: EmailSection[];
  button: { label: string; url: string };
  /** The line under the button. */
  after?: string;
  /** The site's address, for the help link. */
  siteUrl: string;
};

function rowsTable(rows: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${colour.line};">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:11px 0;border-bottom:1px solid ${colour.line};${font};font-size:14px;color:${colour.muted};vertical-align:top;width:40%;">${escapeHtml(label)}</td>` +
        `<td align="right" style="padding:11px 0;border-bottom:1px solid ${colour.line};${font};font-size:14px;color:${colour.ink};font-weight:bold;vertical-align:top;text-align:right;">${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table>`;
}

/** A soft panel (the Petugas card, the recording note), for content a template builds itself. */
export function panel(inner: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colour.field};border-radius:16px;"><tr><td style="padding:18px 20px;">${inner}</td></tr></table>`;
}

/** The Petugas HomeKlin: the photo when there is one (absolute https only), else initials on lime-wash. */
export function cleanerBlock(name: string, photoUrl: string | null, role: string, facts: string[]) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("id-ID"))
    .join("");
  const face =
    photoUrl && /^https:\/\//.test(photoUrl)
      ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(name)}" width="64" height="64" style="display:block;width:64px;height:64px;border-radius:32px;">`
      : `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;border-radius:32px;background:${colour.limeWash};${font};font-size:22px;font-weight:bold;color:${colour.onLimeWash};">${escapeHtml(initials)}</td></tr></table>`;
  const factLines = facts
    .map((fact) => `<p style="margin:6px 0 0;${font};font-size:13px;line-height:19px;color:${colour.ink};">&#8226;&nbsp; ${escapeHtml(fact)}</p>`)
    .join("");
  return panel(
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>` +
      `<td valign="top" width="76" style="width:76px;">${face}</td>` +
      `<td valign="top"><p style="margin:2px 0 0;${font};font-size:18px;font-weight:bold;color:${colour.ink};">${escapeHtml(name)}</p>` +
      `<p style="margin:2px 0 0;${font};font-size:13px;color:${colour.muted};">${escapeHtml(role)}</p>${factLines}</td>` +
      `</tr></table>`,
  );
}

/** The whole email: the wordmark, the title, the sections, the lime button and the footer. */
export function emailHtml(layout: EmailLayout): string {
  const t = words[layout.locale];
  const sections = layout.sections
    .map((section) => {
      if (section.kind === "rows") {
        return `<p style="margin:24px 0 10px;${font};font-size:17px;font-weight:bold;color:${colour.ink};">${escapeHtml(section.title)}</p>${rowsTable(section.rows)}`;
      }
      if (section.kind === "card") return `<div style="margin:20px 0 0;">${section.html}</div>`;
      return `<div style="margin:20px 0 0;">${panel(`<p style="margin:0;${font};font-size:13px;line-height:20px;color:${colour.ink};">${escapeHtml(section.text)}</p>`)}</div>`;
    })
    .join("");
  const badge = layout.badge
    ? `<p style="margin:0 0 10px;"><span style="display:inline-block;background:${colour.successSurface};color:${colour.success};${font};font-size:13px;padding:5px 12px;border-radius:999px;">&#10003; ${escapeHtml(layout.badge)}</span></p>`
    : "";
  const url = escapeHtml(layout.button.url);
  const footer =
    (isPrivateLink(layout.button.url) ? `<p style="margin:0 0 6px;${font};font-size:12px;line-height:18px;color:${colour.muted};">${escapeHtml(t.privateLink)}</p>` : "") +
    `<p style="margin:0;${font};font-size:12px;line-height:18px;color:${colour.muted};">${escapeHtml(t.help)} <a href="${escapeHtml(`${layout.siteUrl}${layout.locale === "en" ? "/en" : ""}/support`)}" style="color:${colour.ink};text-decoration:underline;">${escapeHtml(t.helpLink)}</a>.</p>`;

  return `<!doctype html>
<html lang="${layout.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(layout.title)}</title>
</head>
<body style="margin:0;padding:0;background:${colour.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colour.page};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${colour.card};border-radius:20px;${font};color:${colour.ink};">
<tr><td style="padding:28px 28px 0;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="32" height="32" align="center" valign="middle" style="width:32px;height:32px;background:${colour.forest};border-radius:9px;${font};font-size:16px;font-weight:bold;color:${colour.lime};">H</td>
<td style="padding-left:9px;${font};font-size:20px;font-weight:bold;color:${colour.ink};">HomeKlin</td>
</tr></table>
</td></tr>
<tr><td style="padding:24px 28px 0;">
${badge}<p style="margin:0 0 10px;${font};font-size:26px;line-height:32px;font-weight:bold;color:${colour.ink};">${escapeHtml(layout.title)}</p>
<p style="margin:0;${font};font-size:15px;line-height:23px;color:${colour.ink};">${escapeHtml(layout.intro)}</p>
${sections}
</td></tr>
<tr><td style="padding:26px 28px 0;">
<a href="${url}" style="display:inline-block;background:${colour.lime};color:${colour.onLime};text-decoration:none;${font};font-size:16px;font-weight:bold;padding:14px 26px;border-radius:999px;">${escapeHtml(layout.button.label)} &#8594;</a>
${layout.after ? `<p style="margin:14px 0 0;${font};font-size:13px;line-height:20px;color:${colour.muted};">${escapeHtml(layout.after)}</p>` : ""}
<p style="margin:14px 0 0;${font};font-size:12px;line-height:18px;color:${colour.muted};">${escapeHtml(t.noButton)}<br><a href="${url}" style="color:${colour.ink};text-decoration:underline;word-break:break-all;">${url}</a></p>
</td></tr>
<tr><td style="padding:22px 28px 28px;"><div style="border-top:1px solid ${colour.line};padding-top:16px;">${footer}</div></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** The same email as plain text, for mail apps that show no HTML. */
export function emailText(layout: EmailLayout): string {
  const t = words[layout.locale];
  const lines = [layout.title, "", layout.intro];
  for (const section of layout.sections) {
    if (section.kind === "rows") lines.push("", section.title, ...section.rows.map(([label, value]) => `${label}: ${value}`));
    if (section.kind === "note") lines.push("", section.text);
  }
  lines.push("", `${layout.button.label}: ${layout.button.url}`);
  if (layout.after) lines.push("", layout.after);
  if (isPrivateLink(layout.button.url)) lines.push("", t.privateLink);
  return lines.join("\n");
}
