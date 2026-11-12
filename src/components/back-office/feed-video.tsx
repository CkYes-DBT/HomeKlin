"use client";

import { CircleAlert, CircleStop, LoaderCircle, RotateCw, Video, WifiOff, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { coveredBy, useFeedCard } from "./feed-card";

// One feed's video on the admin monitor (T25): the short-lived link the server made for this admin
// (watchStream, src/lib/stream/streams.ts), played muted, looped and inline so a whole grid plays at
// once without sound. The link works for 10 minutes, so on the first error the tile asks
// GET /api/streams/<order id> for a fresh one, once. If that fails too it says so and offers "Coba
// lagi"; if the stream has ended meanwhile (404) it says that instead. With reduced motion the video
// does not start by itself: it shows its controls and admin presses play.
// The frame (M1, the user's mock): a 16:9 pale green frame with a white icon circle until the picture
// arrives; a problem on a calm panel over it (never a black box); and, when the card's status says the
// cleaner's phone dropped or the job ended (FeedCard), a sunken panel with "Siaran terputus". It tells
// the card whether it shows the video, so "Buka" is only offered when there is a picture to enlarge.

type Problem = "failed" | "ended";

type FeedVideoProps = {
  orderId: string;
  /** The signed link, or null when the server could not make one. */
  src: string | null;
  /** Why there is no link: the stream ended, or making the link failed. */
  initialProblem?: Problem;
  /** "Siaran langsung Rina Wulandari". */
  label: string;
};

function videoUrl(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("view" in body)) return null;
  const view = body.view;
  if (!view || typeof view !== "object" || !("kind" in view) || view.kind !== "video" || !("url" in view)) return null;
  return typeof view.url === "string" ? view.url : null;
}

export function FeedVideo({ orderId, src: firstSrc, initialProblem, label }: FeedVideoProps) {
  const t = useTranslations("AdminMonitorPage");
  const { status, setVideo, setShowing } = useFeedCard();
  const video = useRef<HTMLVideoElement>(null);
  // The element is handed to the card too, so "Buka" can put it into full screen.
  const attach = useCallback(
    (element: HTMLVideoElement | null) => {
      video.current = element;
      setVideo(element);
    },
    [setVideo],
  );
  const [src, setSrc] = useState(firstSrc);
  // A new element for each fresh link, so the browser loads it even if the address is the same.
  const [load, setLoad] = useState(0);
  const [problem, setProblem] = useState<Problem | null>(initialProblem ?? (firstSrc ? null : "failed"));
  const [reloading, setReloading] = useState(false);
  const retriedOnItsOwn = useRef(false);

  async function reload() {
    setReloading(true);
    try {
      const response = await fetch(`/api/streams/${orderId}`, { cache: "no-store" });
      const url = response.ok ? videoUrl(await response.json()) : null;
      if (url) {
        setProblem(null);
        setSrc(url);
        setLoad((count) => count + 1);
      } else {
        setProblem(response.status === 404 ? "ended" : "failed");
      }
    } catch (error) {
      console.error("[monitor] could not fetch a fresh link for %s:", orderId, error);
      setProblem("failed");
    } finally {
      setReloading(false);
    }
  }

  function handleError() {
    if (retriedOnItsOwn.current) {
      setProblem("failed");
      return;
    }
    retriedOnItsOwn.current = true;
    void reload();
  }

  // An error that happened before the page came alive fired no React event: look for it once.
  const checkEarlyError = useEffectEvent(() => {
    if (video.current?.error) handleError();
  });
  useEffect(() => checkEarlyError(), []);

  // React sets `muted` as a property only, so it is set here as well before playing. With reduced
  // motion, or when the browser blocks autoplay, the video shows its controls and admin starts it.
  // The controls are set on the element, not through a prop, so React never takes them away again.
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.muted = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.pause();
      element.controls = true;
      return;
    }
    element.play().catch(() => {
      element.controls = true;
    });
  }, [load]);

  const ended = problem === "ended";
  const failed = problem === "failed";
  const cover = ended ? null : coveredBy(status);
  const showing = Boolean(src) && !ended && !failed && !reloading && !cover;
  useEffect(() => setShowing(showing), [showing, setShowing]);

  // The video element stays underneath a problem while it can still recover, so a fresh link (or the
  // phone coming back) swaps in without moving the card. The panel that says why is a polite live
  // region, as before. The status cover wins over it (the dropped phone is the fact that matters; "Coba
  // lagi" comes back with the phone) and is not a live region, because the card's chip announces it.
  return (
    <div className="relative grid aspect-video place-items-center overflow-hidden rounded-md bg-frame">
      <span aria-hidden="true" className={`${circle} text-primary`}>
        <Video className="size-5" />
      </span>
      {ended || !src ? null : (
        <video
          key={load}
          ref={attach}
          src={src}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          aria-label={label}
          aria-hidden={showing ? undefined : true}
          onError={handleError}
          className="absolute inset-0 size-full object-cover [&:fullscreen]:object-contain"
        >
          <p className="p-4 text-sm text-ink-muted">{t("unsupported")}</p>
        </video>
      )}
      <div
        aria-live="polite"
        className={cover ? "hidden" : ended ? `${panel} bg-sunken` : failed || reloading ? `${panel} bg-frame` : "sr-only"}
      >
        {reloading ? (
          <Panel Icon={LoaderCircle} spin>
            {t("retrying")}
          </Panel>
        ) : ended ? (
          <Panel Icon={CircleStop}>{t("ended")}</Panel>
        ) : failed ? (
          <>
            <Panel Icon={CircleAlert} tone="text-warning">
              {t("failed")}
            </Panel>
            <button
              type="button"
              onClick={() => void reload()}
              className="inline-flex min-h-touch items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-primary underline-offset-4 transition-colors duration-150 ease-out-quart hover:bg-card hover:underline active:bg-sunken"
            >
              <RotateCw className="size-4 shrink-0" aria-hidden="true" />
              {t("retry")}
            </button>
          </>
        ) : null}
      </div>
      {cover ? (
        <div className={`${panel} bg-sunken`}>
          {cover === "disconnected" ? (
            <Panel Icon={WifiOff} tone="text-danger">
              {t("disconnected")}
            </Panel>
          ) : (
            <Panel Icon={CircleStop}>{t("ended")}</Panel>
          )}
        </div>
      ) : null}
    </div>
  );
}

const circle = "inline-flex size-11 items-center justify-center rounded-full bg-card";
const panel = "absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-4 text-center";

/** A frame's message: the white icon circle of the mock, then a short sentence. */
function Panel({ Icon, tone = "text-primary", spin = false, children }: { Icon: LucideIcon; tone?: string; spin?: boolean; children: ReactNode }) {
  return (
    <>
      <span aria-hidden="true" className={`${circle} ${tone}`}>
        <Icon className={`size-5 ${spin ? "animate-spin" : ""}`} />
      </span>
      <p className="text-sm font-semibold text-ink">{children}</p>
    </>
  );
}
