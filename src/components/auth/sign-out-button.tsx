"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { signOut } from "@/lib/auth/actions";

type SignOutButtonProps = {
  /** Layout only (width); the look comes from `look`. */
  className?: string;
  /**
   * button: the outlined pill (every shell so far). linkOnDark: an underlined text button on the
   * redesign's dark band (the admin sidebar, Phase 13), still a 44 px target. outline: the redesign's
   * 52 px outlined pill on cream (the cleaner's account page, D4).
   */
  look?: Look;
};

type Look = "button" | "linkOnDark" | "outline";

const looks: Record<Look, string> = {
  button:
    "inline-flex min-h-touch w-full items-center justify-center gap-2 rounded-full border border-border-control bg-surface px-5 text-sm font-semibold whitespace-nowrap text-ink transition-[background-color,transform] duration-150 ease-out-quart hover:bg-surface-sunken active:scale-[0.98] active:bg-brand-50 disabled:cursor-progress disabled:bg-surface-sunken disabled:text-ink-muted disabled:active:scale-100",
  // on-band-muted is 8.3:1 on band; hover and press brighten it to on-band (13.6:1). The box is only the
  // 20 px text line, so it sits inside the avatar's height; the ::before stretches the hit area to 44 px
  // (8 px up into the gap and the name's empty leading, 16 px down into the padding below).
  linkOnDark:
    "relative -mx-1 inline-flex min-w-touch items-center before:absolute before:inset-x-0 before:-top-2 before:-bottom-4 before:content-[''] gap-1.5 rounded-sm px-1 text-sm font-medium whitespace-nowrap text-on-band-muted underline decoration-1 underline-offset-4 transition-colors duration-150 ease-out-quart hover:text-on-band active:text-lime disabled:cursor-progress disabled:no-underline",
  outline:
    "inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-card px-6 text-base font-semibold whitespace-nowrap text-ink inset-ring-[1.5px] inset-ring-outline transition-[background-color,transform] duration-150 ease-out-quart hover:bg-sunken active:scale-[0.98] active:bg-lime-wash motion-reduce:active:scale-100 disabled:cursor-progress disabled:bg-sunken disabled:text-ink-muted disabled:active:scale-100",
};

// Signing out (T5): a form that posts to the signOut Server Action, which ends the session in this
// browser and opens the landing page in the same language (the hidden locale field: root params do not
// reach Server Actions). A real form, so it works before JavaScript loads.
// Source: node_modules/next/dist/docs/01-app/02-guides/forms.md ("Pending states", useFormStatus)
export function SignOutButton({ className = "", look = "button" }: SignOutButtonProps) {
  const locale = useLocale();
  return (
    <form action={signOut} className={className}>
      <input type="hidden" name="locale" value={locale} />
      <SignOutSubmit look={look} />
    </form>
  );
}

function SignOutSubmit({ look }: { look: Look }) {
  const t = useTranslations("SignOut");
  const { pending } = useFormStatus();
  // The text button shows an icon only while it works; the pill always carries one.
  const icon = pending ? (
    <LoaderCircle className="size-4.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
  ) : look !== "linkOnDark" ? (
    <LogOut className="size-4.5 shrink-0" aria-hidden="true" />
  ) : null;
  return (
    <button type="submit" disabled={pending} className={looks[look]}>
      {icon}
      {pending ? t("pending") : t("submit")}
    </button>
  );
}
