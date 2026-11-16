"use client";

import { Check, Copy, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PaymentDetails } from "@/lib/payment/methods";
import { flowCard, flowCardTitle, flowOutlineButton } from "./flow-styles";

type Props = {
  details: PaymentDetails;
  /** The total as the server wrote it ("Rp 85.000"). */
  amountText: string;
  changing: boolean;
  onChange: () => void;
};

/** How often the page asks the server whether the payment has arrived (the order changes only by Midtrans' signed notification). */
const checkEveryMs = 4_000;

// What the customer does after choosing (the payment step once an attempt is charged): the account
// number, bill code or QR code Midtrans made, the amount, until when, and that this page changes by
// itself. The page reads the order again every few seconds (router.refresh), so the confirmation
// replaces this the moment Midtrans' notification marks the order paid. "Ganti cara bayar" leaves the
// method (changePaymentMethod cancels it at Midtrans) and shows the choices again. In the Sandbox the
// payment is made in Midtrans' simulator, which the card at the bottom links to.
export function PaymentWaiting({ details, amountText, changing, onChange }: Props) {
  const t = useTranslations("PaymentChooser");
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, checkEveryMs);
    return () => clearInterval(timer);
  }, [router]);

  const expiresAt = "expiresAt" in details ? details.expiresAt : null;
  const until = expiresAt
    ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(new Date(expiresAt))
    : null;

  return (
    <section aria-labelledby="menunggu" className={`${flowCard} flex flex-col gap-5 md:p-8`}>
      <header className="flex flex-col gap-1.5">
        <h2 id="menunggu" className="sr-only">
          {t("waiting.title")}
        </h2>
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-ink-muted">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {t("waiting.title")}
        </p>
        {until ? <p className="text-sm text-ink-muted">{t("waiting.expires", { time: until })}</p> : null}
      </header>

      {details.method === "qris" ? (
        <div className="flex flex-col items-start gap-4">
          <div className="flex flex-col gap-1">
            <h3 className={flowCardTitle}>{t("waiting.qris.title")}</h3>
            <p className="max-w-prose text-ink-muted">{t("waiting.qris.body")}</p>
          </div>
          <div className="rounded-md bg-white p-3 inset-ring-1 inset-ring-border">
            {/* Midtrans' QR code is a small image on its own address; scaling it up keeps it sharp. */}
            <Image unoptimized src={details.qrUrl} width={224} height={224} alt={t("waiting.qris.alt")} className="size-56 [image-rendering:pixelated]" />
          </div>
          <Copyable label={t("waiting.amount")} value={amountText} copyValue={amountText.replace(/\D/g, "")} />
        </div>
      ) : null}

      {details.method === "bank" && details.bank !== "mandiri" ? (
        <div className="flex flex-col items-start gap-4">
          <div className="flex flex-col gap-1">
            <h3 className={flowCardTitle}>{t("waiting.va.title", { bank: t(`banks.${details.bank}`) })}</h3>
            <p className="max-w-prose text-ink-muted">{t("waiting.va.body", { bank: t(`banks.${details.bank}`) })}</p>
          </div>
          <Copyable label={t("waiting.va.number")} value={details.vaNumber ?? ""} big />
          <Copyable label={t("waiting.amount")} value={amountText} copyValue={amountText.replace(/\D/g, "")} />
        </div>
      ) : null}

      {details.method === "bank" && details.bank === "mandiri" ? (
        <div className="flex flex-col items-start gap-4">
          <div className="flex flex-col gap-1">
            <h3 className={flowCardTitle}>{t("waiting.mandiri.title")}</h3>
            <p className="max-w-prose text-ink-muted">{t("waiting.mandiri.body")}</p>
          </div>
          <Copyable label={t("waiting.mandiri.biller")} value={details.billerCode ?? ""} big />
          <Copyable label={t("waiting.mandiri.key")} value={details.billKey ?? ""} big />
          <Copyable label={t("waiting.amount")} value={amountText} copyValue={amountText.replace(/\D/g, "")} />
        </div>
      ) : null}

      {details.method === "card" ? (
        <div className="flex flex-col gap-1">
          <h3 className={flowCardTitle}>{t("waiting.card.title")}</h3>
          <p className="max-w-prose text-ink-muted">{t("waiting.card.body")}</p>
        </div>
      ) : null}

      <p className="flex items-start gap-2.5 text-sm text-ink-muted">
        <RefreshCw className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>{t("waiting.auto")}</span>
      </p>

      {details.method !== "card" ? (
        <div className="flex flex-col items-start gap-2 rounded-md bg-warning-surface p-4 text-sm text-warning">
          <p>
            <strong className="font-semibold">{t("waiting.sandbox.title")}.</strong> {t("waiting.sandbox.body")}
          </p>
          <a
            href="https://simulator.sandbox.midtrans.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-touch items-center gap-1.5 font-semibold underline underline-offset-4 hover:decoration-2"
          >
            {t("waiting.sandbox.link")}
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </div>
      ) : null}

      <button type="button" onClick={onChange} disabled={changing} className={`${flowOutlineButton} w-fit`}>
        {changing ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
        {changing ? t("waiting.changing") : t("waiting.change")}
      </button>
    </section>
  );
}

/** A value to read out or copy: the account number, the bill code, the amount. */
function Copyable({ label, value, copyValue = value, big = false }: { label: string; value: string; copyValue?: string; big?: boolean }): ReactNode {
  const t = useTranslations("PaymentChooser");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2_000);
    } catch {
      // No clipboard (an old browser, or the page is not secure): the value is on the screen to read.
    }
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      <p className="text-sm text-ink-muted">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <p className={`font-display font-semibold break-all text-ink tabular-nums ${big ? "text-2xl tracking-wide" : "text-xl"}`}>{value}</p>
        <button
          type="button"
          onClick={copy}
          aria-label={`${copied ? t("waiting.copied") : t("waiting.copy")} ${label}`}
          className={`${flowOutlineButton} px-4`}
        >
          {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {copied ? t("waiting.copied") : t("waiting.copy")}
        </button>
        <span role="status" className="sr-only">
          {copied ? t("waiting.copied") : ""}
        </span>
      </div>
    </div>
  );
}
