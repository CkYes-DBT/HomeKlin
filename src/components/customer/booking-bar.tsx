"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";

type BookingBarProps = {
  /** The id of the step's own button in the page: while it is on screen, the bar steps aside. */
  watchId: string;
  /** The chosen service, or what is still missing. */
  title: string;
  /** The chosen day, or what is still missing. */
  detail: string;
  /** The chosen time range ("10.00-12.00 WIB"), on the price's line. */
  time?: string;
  price?: string;
  /** The step's button (a submit button joined to the step's form with `form`). */
  action: ReactNode;
  /** Off on a view without the button (the guest's code step). */
  off?: boolean;
};

// Phones only (below md, steps 1 and 2, the booking-flow fixes of 2026-11-16): the choice so far, its
// price and the step's button in a bar at the bottom of the screen (the booking flow has no bottom
// navigation since 2026-11-17; the bar pads itself for the home indicator), so the button is in reach
// on a long page. While it shows, its height is the page's --booking-bar-height, which lifts the
// floating language switch above it (float-corner-flow, globals.css). It slides away while the step's own button is on screen, so the page never shows the
// button twice, and it is inert then (out of the tab order and the accessibility tree). A spacer the
// bar's height keeps the end of the page clear of it. Without JavaScript it never shows; the step's
// own button works as before.
export function BookingBar({ watchId, title, detail, time, price, action, off = false }: BookingBarProps) {
  const t = useTranslations("BookingBar");
  const [buttonInView, setButtonInView] = useState(true);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = document.getElementById(watchId);
    if (!target || typeof IntersectionObserver === "undefined") return;
    // The bar covers the lowest ~6 rem of the screen (rootMargin takes px or %).
    const covered = 6 * parseFloat(getComputedStyle(document.documentElement).fontSize || "16");
    const observer = new IntersectionObserver(([entry]) => setButtonInView(entry.isIntersecting), {
      rootMargin: `0px 0px -${Math.round(covered)}px 0px`,
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [watchId]);

  const shown = !off && !buttonInView;

  // The bar's height while it shows (0 on wider screens, where it is not drawn), for the language switch.
  useEffect(() => {
    const element = bar.current;
    const root = document.documentElement;
    if (!element || !shown) return;
    const publish = () => {
      const height = element.offsetHeight;
      if (height > 0) root.style.setProperty("--booking-bar-height", `${height}px`);
      else root.style.removeProperty("--booking-bar-height");
    };
    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--booking-bar-height");
    };
  }, [shown]);
  return (
    <>
      <div aria-hidden="true" className="h-24 md:hidden" />
      <div
        ref={bar}
        role="region"
        aria-label={t("label")}
        inert={!shown}
        aria-hidden={!shown}
        data-shown={shown}
        data-testid="booking-bar"
        className={`fixed inset-x-0 bottom-0 z-(--z-sticky) pb-safe border-t border-border bg-card shadow-nav transition-[translate,opacity] duration-200 ease-out-quart md:hidden ${
          shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
        }`}
      >
        <div className="mx-auto flex max-w-content items-center gap-3 px-safe py-2.5">
          {/* One fact per line, so a 360 px phone shows each one whole. */}
          <div className="flex min-w-0 flex-1 flex-col text-sm leading-tight">
            <p className="truncate font-semibold text-ink">{title}</p>
            <p className="text-ink-muted tabular-nums">{detail}</p>
            {price || time ? (
              <p className="mt-0.5 flex flex-wrap gap-x-2 tabular-nums">
                {time ? <span className="whitespace-nowrap text-ink-muted">{time}</span> : null}
                {price ? <span className="font-semibold whitespace-nowrap text-ink">{price}</span> : null}
              </p>
            ) : null}
          </div>
          {action}
        </div>
      </div>
    </>
  );
}
