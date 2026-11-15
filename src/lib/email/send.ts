import nodemailer from "nodemailer";
import type { Locale } from "next-intl";
import { formatRupiah } from "@/lib/format";
import { emailHtml, emailText, type EmailLayout } from "./layout";

// Email from the app (T9b): the order confirmation, sent over SMTP with nodemailer, through the same
// Gmail account that Supabase Auth uses for the sign-in codes (scripts/supabase.mjs smtp). Gmail needs
// an app password (Google account > Security > 2-Step Verification > App passwords), not the account
// password itself. Without SMTP settings (tests, CI) nothing is sent and the caller is told so: an
// order never fails because an email could not go.
// Sources: https://nodemailer.com/smtp/ and https://support.google.com/a/answer/176600

export type EmailMessage = { to: string; subject: string; html: string; text: string };

export type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "undeliverable" | "failed" };

/** example.com/.net/.org and the .test, .invalid, .example and .localhost top-level domains. */
const reservedDomain = /@(?:[^@]*\.)?(?:example\.(?:com|net|org)|[^@]*\.(?:test|invalid|example|localhost))$/i;

export type SmtpSettings = { host: string; port: number; user: string; pass: string };

type Mail = { from: string; to: string; subject: string; html: string; text: string };
type Transport = { sendMail: (mail: Mail) => Promise<unknown> };
type CreateTransport = (options: Record<string, unknown>) => Transport;

type SendOptions = {
  smtp: SmtpSettings | undefined;
  /** "Name <address>": for Gmail, the Gmail address itself. */
  from: string;
  createTransport?: CreateTransport;
};

const defaultTransport: CreateTransport = (options) => nodemailer.createTransport(options);

export async function sendEmail(
  message: EmailMessage,
  { smtp, from, createTransport = defaultTransport }: SendOptions,
): Promise<SendResult> {
  if (!smtp) return { sent: false, reason: "not_configured" };
  // Test and demo accounts use reserved domains (RFC 2606), which can never receive mail: sending
  // there would only bounce back into the sender's inbox.
  if (reservedDomain.test(message.to)) return { sent: false, reason: "undeliverable" };
  try {
    // Port 587 with STARTTLS: the connection is upgraded to TLS before the login is sent.
    const transport = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      requireTLS: smtp.port !== 465,
      auth: { user: smtp.user, pass: smtp.pass },
      connectionTimeout: 10_000,
    });
    await transport.sendMail({ from, to: message.to, subject: message.subject, html: message.html, text: message.text });
    return { sent: true };
  } catch {
    return { sent: false, reason: "failed" };
  }
}

/** The SMTP settings from the environment (server only), or undefined when they are not set. */
function smtpFromEnv(): SmtpSettings | undefined {
  const { SMTP_USER: user, SMTP_PASS: pass } = process.env;
  if (!user || !pass) return undefined;
  return { host: process.env.SMTP_HOST ?? "smtp.gmail.com", port: Number(process.env.SMTP_PORT ?? 587), user, pass };
}

/** Sends with the settings from the environment (server only). */
export function sendAppEmail(message: EmailMessage): Promise<SendResult> {
  const smtp = smtpFromEnv();
  return sendEmail(message, { smtp, from: senderOf(process.env.EMAIL_FROM, smtp?.user) });
}

/**
 * The From header. Gmail sends only from the account's own address, so the address is always the SMTP
 * user; EMAIL_FROM gives the display name ("HomeKlin", or "HomeKlin <address>" whose address is ignored).
 */
export function senderOf(emailFrom: string | undefined, smtpUser: string | undefined): string {
  const value = (emailFrom ?? "").trim();
  const named = /^(.*?)\s*<[^>]*>$/.exec(value);
  const name = (named ? named[1] : value.includes("@") ? "" : value) || "HomeKlin";
  return `${name} <${smtpUser ?? "no-reply@homeklin.invalid"}>`;
}

export type ConfirmationOrder = {
  serviceName: string;
  startsAt: string;
  endsAt: string;
  address: string;
  priceIdr: number;
  orderUrl: string;
};

export { escapeHtml } from "./layout";

/** "Senin, 26 Oktober 2026" / "Monday, 26 October 2026", in Jakarta time. */
export function jakartaDay(iso: string, locale: Locale): string {
  const parts = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("weekday")}, ${part("day")} ${part("month")} ${part("year")}`;
}

/** "08.00", in Jakarta time, the Indonesian way in both languages (as on the site). */
export function jakartaTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("hour")}.${part("minute")}`;
}

const copy = {
  id: {
    subject: "Pesanan HomeKlin Anda sudah dibuat",
    intro: "Terima kasih. Pesanan Anda sudah dibuat dan menunggu pembayaran.",
    details: "Detail pesanan",
    service: "Layanan",
    date: "Tanggal",
    time: "Jam",
    window: (start: string, end: string) => `${start} sampai ${end} WIB`,
    address: "Alamat",
    total: "Total",
    open: "Lihat pesanan",
    note: "Bayar dari halaman pesanan. Setelah itu, nama dan foto Petugas HomeKlin dikirim ke email ini.",
  },
  en: {
    subject: "Your HomeKlin order has been placed",
    intro: "Thank you. Your order has been placed and is awaiting payment.",
    details: "Order details",
    service: "Service",
    date: "Date",
    time: "Time",
    window: (start: string, end: string) => `${start} to ${end} WIB`,
    address: "Address",
    total: "Total",
    open: "View your order",
    note: "Pay from the order page. After that, your HomeKlin cleaner's name and photo are sent to this email.",
  },
} as const;

/** The order confirmation in the customer's language, in the layout of ./layout.ts. Names HomeKlin only. */
export function orderConfirmationEmail(order: ConfirmationOrder, locale: Locale): Omit<EmailMessage, "to"> {
  const t = copy[locale];
  const layout: EmailLayout = {
    locale,
    title: t.subject,
    intro: t.intro,
    sections: [
      {
        kind: "rows",
        title: t.details,
        rows: [
          [t.service, order.serviceName],
          [t.date, jakartaDay(order.startsAt, locale)],
          [t.time, t.window(jakartaTime(order.startsAt), jakartaTime(order.endsAt))],
          [t.address, order.address],
          [t.total, formatRupiah(order.priceIdr, locale)],
        ],
      },
    ],
    button: { label: t.open, url: order.orderUrl },
    after: t.note,
    siteUrl: (process.env.SITE_URL ?? "https://home-klin.vercel.app").replace(/\/+$/, ""),
  };
  return { subject: t.subject, html: emailHtml(layout), text: emailText(layout) };
}
