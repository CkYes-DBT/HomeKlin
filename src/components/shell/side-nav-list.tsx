"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { backOfficeNavigation } from "./back-office-navigation";
import { isActivePath } from "./is-active-path";
import type { BackOfficeNavKey, ShellTone } from "./navigation";

type SideNavListProps = {
  nav: BackOfficeNavKey;
  /** Called when a link starts a client-side navigation (the narrow-screen menu closes itself). */
  onNavigate?: () => void;
  /** default: the light T3b sidebar. forest: the redesign's dark band (the admin console, Phase 13). */
  tone?: ShellTone;
};

// default keeps the T3b pills. forest (markdown/design.md, Layout, sidebar): `sm` items in on-band-muted,
// a quiet band-raised on hover, and the current section on band-raised with lime text and icon and a
// 3 px lime marker on the left edge. on-band-muted is 8.3:1 on band and 5.9:1 on band-raised, lime 8.4:1
// on band-raised (design.md, Accessibility).
const tones = {
  default: {
    link: "group flex min-h-touch items-center gap-3 rounded-full px-4 text-sm font-medium text-ink-muted transition-colors duration-150 ease-out-quart hover:bg-surface-sunken hover:text-ink active:bg-brand-50 aria-[current=page]:bg-brand-100 aria-[current=page]:font-semibold aria-[current=page]:text-brand-800",
    icon: "size-4.5 shrink-0 text-ink-faint transition-colors duration-150 group-hover:text-ink-muted group-aria-[current=page]:text-brand-700",
  },
  forest: {
    link: "group relative flex min-h-touch items-center gap-3 rounded-sm px-4 text-sm font-medium text-on-band-muted transition-colors duration-150 ease-out-quart hover:bg-band-raised/60 hover:text-on-band active:bg-band-raised aria-[current=page]:bg-band-raised aria-[current=page]:font-semibold aria-[current=page]:text-lime",
    icon: "size-4.5 shrink-0 text-on-band-muted transition-colors duration-150 group-hover:text-on-band group-aria-[current=page]:text-lime",
  },
};

// The back-office sections, used by the desktop sidebar and by the narrow-screen menu.
export function SideNavList({ nav, onNavigate, tone = "default" }: SideNavListProps) {
  const t = useTranslations("BackOfficeNavigation");
  const pathname = usePathname();
  const { labelKey, items } = backOfficeNavigation[nav];
  const look = tones[tone];

  return (
    <nav aria-label={t(labelKey)}>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const current = isActivePath(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onNavigate={onNavigate}
                aria-current={current ? "page" : undefined}
                className={look.link}
              >
                {tone === "forest" && current ? (
                  <span aria-hidden="true" className="absolute inset-y-2.5 left-0 w-0.75 rounded-full bg-lime" />
                ) : null}
                <Icon className={look.icon} aria-hidden="true" />
                {t(item.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
