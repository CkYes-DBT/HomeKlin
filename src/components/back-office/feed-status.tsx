"use client";

import { CircleStop, WifiHigh, WifiOff, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import type { StreamStatus } from "@/lib/stream/streams";
import { useFeedCard } from "./feed-card";
import { StatusPill } from "./status-pill";

// A live feed's status on the admin monitor (T25), kept current: every 10 seconds the tile asks
// GET /api/streams/<order id>?status=1 (which checks the viewer again) and shows what the cleaner's
// phone last reported. A 404 means the stream has ended (check-out) and polling stops. A failed poll
// keeps the last known status; the next one tries again. The chip is a word with an icon or the calm
// breathing dot, never colour alone, and a polite live region, so a change is announced once. The
// status lives in the card (FeedCard), so the video frame follows it too (M1).

export const statusPollMilliseconds = 10_000;

const statuses: readonly StreamStatus[] = ["active", "weak", "disconnected", "ended"];

const styles: Record<Exclude<StreamStatus, "active">, { Icon: LucideIcon; pill: string }> = {
  weak: { Icon: WifiHigh, pill: "bg-warning-surface text-warning" },
  disconnected: { Icon: WifiOff, pill: "bg-danger-surface text-danger" },
  ended: { Icon: CircleStop, pill: "bg-sunken text-ink-muted" },
};

function isStatus(value: unknown): value is StreamStatus {
  return typeof value === "string" && (statuses as readonly string[]).includes(value);
}

export function FeedStatus({ orderId }: { orderId: string }) {
  const t = useTranslations("AdminMonitorPage");
  const { status, setStatus } = useFeedCard();
  const ended = status === "ended";

  useEffect(() => {
    if (ended) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/streams/${orderId}?status=1`, { cache: "no-store" });
        if (response.status === 404) {
          setStatus("ended");
          return;
        }
        if (!response.ok) return;
        const body: unknown = await response.json();
        if (body && typeof body === "object" && "status" in body && isStatus(body.status)) setStatus(body.status);
      } catch (error) {
        console.error("[monitor] could not poll the stream status of %s:", orderId, error);
      }
    }, statusPollMilliseconds);
    return () => window.clearInterval(timer);
  }, [orderId, ended, setStatus]);

  const label = t(`status.${status}`);
  return (
    <span role="status" className="shrink-0">
      {status === "active" ? (
        <span className="inline-flex items-center gap-2 rounded-full bg-live-surface px-3 py-1 text-xs font-medium whitespace-nowrap text-live">
          <span aria-hidden="true" data-dot className="size-2 animate-breathe rounded-full bg-live-dot" />
          {label}
        </span>
      ) : (
        <StatusPill {...styles[status]} label={label} />
      )}
    </span>
  );
}
