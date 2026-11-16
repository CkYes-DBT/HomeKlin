"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { UserAvatar } from "@/components/auth/user-avatar";
import { Link, usePathname } from "@/i18n/navigation";
import { appNavigation } from "./app-navigation";
import type { AppTone } from "./mobile-shell";

type AccountMenuProps = {
  /** bottom: the phone bar's fifth column, the menu opens above it. top: the app bar's last section, it opens below. */
  variant: "bottom" | "top";
  tone?: AppTone;
  /**
   * Who is signed in: their name ("" when the profile has none), or null for a visitor. Left out while
   * the session is read (the Suspense fallback): the trigger shows, disabled.
   */
  user?: { name: string } | null;
};

// The customer's "Akun" (markdown/design.md, Navigation): not a page but a menu that shows who is signed
// in and the way out. It follows the menu button pattern: a real <button> with aria-haspopup and
// aria-expanded; Enter, Space or the arrow keys open it and put the focus on its first item; Escape
// closes it and gives the focus back to the button; Tab closes it and moves on; a click outside, and
// any change of page (signing out ends in one), close it too. The items are 44 px rows.
// Source: https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/
const triggers = {
  bottom: {
    default:
      "group flex min-h-bottom-nav w-full flex-col items-center justify-center gap-1 text-xs font-medium text-ink-muted transition-colors duration-150 ease-out-quart hover:text-ink active:text-brand-800 aria-expanded:font-semibold aria-expanded:text-brand-700 disabled:cursor-progress",
    forest:
      "group flex min-h-bottom-nav w-full flex-col items-center justify-center text-xs font-medium text-ink-muted transition-colors duration-150 ease-out-quart hover:text-ink active:text-on-lime-wash aria-expanded:font-semibold aria-expanded:text-on-lime-wash disabled:cursor-progress",
  },
  top: {
    default:
      "group flex min-h-touch items-center gap-2 rounded-full px-3.5 text-sm font-medium whitespace-nowrap text-ink-muted transition-colors duration-150 ease-out-quart hover:bg-surface-sunken hover:text-ink active:bg-brand-50 aria-expanded:bg-brand-100 aria-expanded:font-semibold aria-expanded:text-brand-800 disabled:cursor-progress",
    forest:
      "group flex min-h-touch items-center gap-2 rounded-full px-3.5 text-sm font-medium whitespace-nowrap text-ink-muted transition-colors duration-150 ease-out-quart hover:bg-sunken hover:text-ink active:bg-lime-wash aria-expanded:bg-lime-wash aria-expanded:font-semibold aria-expanded:text-on-lime-wash disabled:cursor-progress",
  },
} satisfies Record<AccountMenuProps["variant"], Record<AppTone, string>>;

// The bottom bar's icon sits in a pill that turns lime-wash while the menu is open (forest) or brand-100.
const pills = {
  default: "h-7 w-12 group-hover:bg-surface-sunken group-aria-expanded:bg-brand-100",
  forest: "min-h-12 min-w-17 flex-col gap-0.5 px-3 py-1 group-hover:bg-sunken group-aria-expanded:bg-lime-wash",
} satisfies Record<AppTone, string>;

// Where the menu opens: above the phone bar (it is fixed to the bottom), below the app bar. Right
// edges line up, so it grows leftwards into the screen; the width never passes the side gutters.
const panelPlacement = {
  bottom: "bottom-full mb-2",
  top: "top-full mt-2",
} satisfies Record<AccountMenuProps["variant"], string>;

function menuItems(root: HTMLElement | null): HTMLElement[] {
  return [...(root?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
}

export function AccountMenu({ variant, tone = "forest", user }: AccountMenuProps) {
  const t = useTranslations("AppNavigation");
  const tSummary = useTranslations("AccountSummary");
  const tChip = useTranslations("AccountChip");
  const pathname = usePathname();
  const item = appNavigation.customer.account;
  const Icon = item.icon;
  const forest = tone === "forest";

  // Open means "opened on this page": moving to another page closes the menu without an effect.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = user !== undefined && openedAt === pathname;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const triggerId = useId();
  const menuId = useId();

  const close = () => setOpenedAt(null);

  // The focus goes to the first item whenever the menu opens (by pointer or keyboard).
  useEffect(() => {
    if (open) menuItems(root.current)[0]?.focus();
  }, [open]);

  // A press outside closes it. Focus is left where the press put it.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpenedAt(pathname);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const entries = menuItems(root.current);
    const at = entries.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close();
        trigger.current?.focus();
        break;
      case "Tab":
        // Back on the button first, so Tab carries on from the menu's place in the page.
        trigger.current?.focus();
        close();
        break;
      case "ArrowDown":
        event.preventDefault();
        entries[(at + 1) % entries.length]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        entries[(at - 1 + entries.length) % entries.length]?.focus();
        break;
      case "Home":
        event.preventDefault();
        entries[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        entries[entries.length - 1]?.focus();
        break;
    }
  }

  const label = t(item.labelKey);
  const name = user?.name || tSummary("noName");

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={user === undefined}
        onClick={() => setOpenedAt(open ? null : pathname)}
        onKeyDown={onTriggerKeyDown}
        className={triggers[variant][tone]}
      >
        {variant === "bottom" ? (
          <>
            <span
              className={`flex items-center justify-center rounded-full transition-colors duration-150 ease-out-quart ${pills[tone]}`}
            >
              <Icon className={forest ? "size-5.5" : "size-5"} aria-hidden="true" />
              {forest ? label : null}
            </span>
            {forest ? null : label}
          </>
        ) : (
          <>
            <Icon className="hidden size-4.5 lg:block" aria-hidden="true" />
            {label}
            <ChevronDown
              className="hidden size-4 transition-transform duration-150 ease-out-quart group-aria-expanded:rotate-180 lg:block"
              aria-hidden="true"
            />
          </>
        )}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          onKeyDown={onMenuKeyDown}
          className={`absolute right-0 z-(--z-overlay) w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-2 shadow-raised ${panelPlacement[variant]}`}
        >
          {user ? (
            <>
              <div role="none" className="flex items-center gap-3 px-3 py-2">
                <UserAvatar name={user.name} size="md" palette="forest" />
                <p className="flex min-w-0 flex-col">
                  <span className="text-xs text-ink-muted">{tSummary("signedInAs")}</span>
                  <span className="truncate text-sm font-semibold text-ink">{name}</span>
                </p>
              </div>
              <div role="separator" className="mx-3 my-1 h-px bg-border" />
              <SignOutButton look="menu" />
            </>
          ) : (
            <Link
              href="/login"
              role="menuitem"
              className="flex min-h-touch w-full items-center rounded-md px-3 text-sm font-semibold text-ink transition-colors duration-150 ease-out-quart hover:bg-sunken active:bg-lime-wash"
            >
              {tChip("signIn")}
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}
