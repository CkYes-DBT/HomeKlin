"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { coveredBy, useFeedCard } from "./feed-card";

// "Buka" on a live card (M1): puts that card's <video> into full screen with the Fullscreen API, or
// on iPhone Safari, which has no element full screen, with the video's own full-screen player. A
// browser with neither never shows the button. It is a real button drawn as an underlined link, a full
// 44 px target, and it is disabled while the frame has no picture to enlarge (loading failed, the
// phone dropped, the job ended).

type WebKitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

const noChanges = () => () => {};
const canEnlarge = () => document.fullscreenEnabled || "webkitEnterFullscreen" in HTMLVideoElement.prototype;

export function FeedOpen({ name }: { name: string }) {
  const t = useTranslations("AdminMonitorPage");
  const { video, status, showing } = useFeedCard();
  // Assumed on the server and in the first render, so the page hydrates as it was sent.
  const supported = useSyncExternalStore(noChanges, canEnlarge, () => true);
  if (!supported) return null;

  function open() {
    const element: WebKitVideo | null = video;
    if (!element) return;
    if (element.requestFullscreen && document.fullscreenEnabled) {
      element.requestFullscreen().catch((error: unknown) => console.error("[monitor] could not open full screen:", error));
    } else {
      element.webkitEnterFullscreen?.();
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={!showing || coveredBy(status) !== null}
      aria-label={t("openLabel", { name })}
      className="inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full px-1.5 text-sm font-semibold text-primary underline decoration-1 underline-offset-4 transition-colors duration-150 ease-out-quart hover:bg-sunken hover:decoration-2 active:bg-lime-wash disabled:cursor-not-allowed disabled:bg-transparent disabled:text-ink-muted disabled:no-underline"
    >
      {t("open")}
    </button>
  );
}
