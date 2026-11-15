"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { appNavigation } from "./app-navigation";
import { isActivePath } from "./is-active-path";
import type { AppTone } from "./mobile-shell";
import type { AppNavKey } from "./navigation";

type BottomNavProps = {
  nav: AppNavKey;
  tone?: AppTone;
};

// default: the T3b bar, the current item's icon in a brand-100 pill. forest: the redesign (the cleaner
// app, D4, markdown/design.md "Bottom navigation"): a white bar, the current item's icon and label
// together in a lime-wash pill with a dark-green label. The whole column stays the touch target.
const tones = {
  default: {
    bar: "border-t border-border bg-surface",
    link: "gap-1 text-ink-muted hover:text-ink active:text-brand-800 aria-[current=page]:font-semibold aria-[current=page]:text-brand-700",
    pill: "h-7 w-12 group-hover:bg-surface-sunken group-aria-[current=page]:bg-brand-100",
  },
  forest: {
    bar: "bg-card",
    link: "text-ink-muted hover:text-ink active:text-on-lime-wash aria-[current=page]:font-semibold aria-[current=page]:text-on-lime-wash",
    pill: "min-h-12 min-w-17 flex-col gap-0.5 px-3 py-1 group-hover:bg-sunken group-aria-[current=page]:bg-lime-wash",
  },
} satisfies Record<AppTone, { bar: string; link: string; pill: string }>;

// Phone navigation: fixed to the bottom, labels always visible, 44 px+ targets, clears the home indicator.
// usePathname comes without the language prefix ("/home" on /en/home), so the current item matches
// in both languages.
export function BottomNav({ nav, tone = "default" }: BottomNavProps) {
  const t = useTranslations("AppNavigation");
  const pathname = usePathname();
  const { labelKey, items } = appNavigation[nav];
  const look = tones[tone];
  const forest = tone === "forest";

  return (
    <nav
      aria-label={t(labelKey)}
      className={`fixed inset-x-0 bottom-0 z-(--z-nav) pb-safe shadow-nav md:hidden ${look.bar}`}
    >
      <ul className="mx-auto flex max-w-content px-safe">
        {items.map((item) => {
          const active = isActivePath(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group flex min-h-bottom-nav flex-col items-center justify-center text-xs font-medium transition-colors duration-150 ease-out-quart ${look.link}`}
              >
                <span
                  className={`flex items-center justify-center rounded-full transition-colors duration-150 ease-out-quart ${look.pill}`}
                >
                  <Icon className={forest ? "size-5.5" : "size-5"} aria-hidden="true" />
                  {forest ? t(item.labelKey) : null}
                </span>
                {forest ? null : t(item.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
