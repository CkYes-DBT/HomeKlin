"use client";

import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { LanguageSwitch } from "./language-switch";
import type { BackOfficeNavKey, ShellTone } from "./navigation";
import { RoleBadge } from "./role-badge";
import { SideNavList } from "./side-nav-list";

type BackOfficeTopBarProps = {
  nav: BackOfficeNavKey;
  roleLabel: string;
  /** Who is signed in and the sign-out button, rendered on the server (sidebar-shell.tsx). */
  account?: ReactNode;
  /** default: the light T3b bar. forest: the redesign's dark band (the admin console, Phase 13). */
  tone?: ShellTone;
};

// default keeps the T3b bar exactly. forest: the same bar on `band`, with the lime focus ring
// (on-dark-focus), band-raised dividers and fills, and the sidebar's dark items in the menu.
const tones = {
  default: {
    header: "sticky top-0 z-(--z-sticky) border-b border-border bg-surface lg:hidden",
    button:
      "-mr-2 inline-flex min-h-touch items-center gap-2 rounded-full px-4 text-sm font-semibold text-ink transition-colors duration-150 ease-out-quart hover:bg-surface-sunken active:bg-brand-50 aria-expanded:bg-surface-sunken",
    menu: "border-t border-border px-safe py-3",
    footer: "mt-3 flex flex-col gap-4 border-t border-border px-1 pt-4",
  },
  forest: {
    header: "on-dark-focus sticky top-0 z-(--z-sticky) bg-band text-on-band lg:hidden",
    button:
      "-mr-2 inline-flex min-h-touch items-center gap-2 rounded-full px-4 text-sm font-semibold text-on-band transition-colors duration-150 ease-out-quart hover:bg-band-raised/60 active:bg-band-raised aria-expanded:bg-band-raised",
    menu: "border-t border-band-raised px-safe py-3",
    footer: "mt-3 flex flex-col gap-4 border-t border-band-raised px-1 pt-4",
  },
};

const menuId = "back-office-menu";

// Below desktop width the sidebar collapses into this bar. The menu opens in the page flow
// (pushing content down), so nothing is covered and no focus trap is needed. The account and the
// language switch sit in the menu, under the sections: at 360 px the bar has no room next to the
// wordmark, the role and the Menu button.
export function BackOfficeTopBar({ nav, roleLabel, account, tone = "default" }: BackOfficeTopBarProps) {
  const t = useTranslations("BackOfficeShell");
  // The address as the browser shows it (with /en), so switching the language also counts as
  // navigating; next-intl's usePathname would return the same path in both languages.
  const pathname = usePathname();
  const button = useRef<HTMLButtonElement>(null);
  // Remember which page the menu was opened on: any navigation (link, back button) closes it.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;

  // Next.js keeps hidden pages mounted (Activity); close the menu when this layout is hidden.
  useLayoutEffect(() => () => setOpenedOn(null), []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && open) {
      setOpenedOn(null);
      button.current?.focus();
    }
  }

  const look = tones[tone];
  const forest = tone === "forest";

  return (
    <header onKeyDown={handleKeyDown} className={look.header}>
      <div className="flex h-top-bar items-center justify-between gap-3 px-safe">
        <span className="flex min-w-0 items-center gap-2">
          {forest ? <Wordmark palette="forest" onDark /> : <Wordmark />}
          <RoleBadge label={roleLabel} onDark={forest} />
        </span>
        <button
          ref={button}
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpenedOn(open ? null : pathname)}
          className={look.button}
        >
          {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          {t("menu")}
        </button>
      </div>
      <div id={menuId} hidden={!open} className={look.menu}>
        <SideNavList nav={nav} tone={tone} onNavigate={() => setOpenedOn(null)} />
        {/* In the forest tone the switch comes first, as at the foot of the dark sidebar. */}
        <div className={look.footer}>
          {forest ? null : account}
          <div>{forest ? <LanguageSwitch palette="forest" onDark /> : <LanguageSwitch />}</div>
          {forest ? account : null}
        </div>
      </div>
    </header>
  );
}
