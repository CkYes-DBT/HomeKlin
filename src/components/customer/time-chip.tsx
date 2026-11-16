"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

type TimeChipProps = {
  name: string;
  /** The window's start exactly as the catalog gave it. */
  value: string;
  /** "10.00" and "12.00", Jakarta time, written by the server. */
  start: string;
  end: string;
  full: boolean;
  checked: boolean;
  onChange: () => void;
  /** Joins a form elsewhere on the page (step 1's summary). */
  form?: string;
  describedBy?: string;
};

// One arrival window as a chip, the same on step 1 (/services) and step 2 (/pesan) since the
// booking-flow fixes (2026-11-16): the range "10.00-12.00" (never the start alone), and a full window
// shown disabled with "penuh" written under it, so the state never rests on the grey fill alone. A
// real radio over the whole chip, named "10.00 sampai 12.00 WIB" (", penuh" when full); the chosen one
// turns forest with a check. At least 44 px tall.
export function TimeChip({ name, value, start, end, full, checked, onChange, form, describedBy }: TimeChipProps) {
  const t = useTranslations("TimeChip");
  return (
    <label className="relative inline-flex min-h-touch min-w-28 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-card px-4 py-1 text-sm font-semibold whitespace-nowrap text-ink tabular-nums inset-ring-[1.5px] inset-ring-outline transition-colors duration-150 ease-out-quart hover:bg-sunken active:bg-lime-wash has-checked:bg-primary has-checked:text-on-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus has-disabled:cursor-not-allowed has-disabled:bg-sunken has-disabled:font-medium has-disabled:text-ink-muted has-disabled:inset-ring-0">
      <input
        type="radio"
        name={name}
        form={form}
        value={value}
        disabled={full}
        checked={checked}
        onChange={onChange}
        aria-label={full ? t("fullLabel", { start, end }) : t("label", { start, end })}
        aria-describedby={describedBy}
        className="peer absolute inset-0 z-10 size-full cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed"
      />
      <Check className="hidden size-4 shrink-0 peer-checked:block" strokeWidth={2.5} aria-hidden="true" />
      <span aria-hidden="true" className="flex flex-col items-center leading-tight">
        <span>{t("range", { start, end })}</span>
        {full ? <span className="text-xs font-normal">{t("full")}</span> : null}
      </span>
    </label>
  );
}
