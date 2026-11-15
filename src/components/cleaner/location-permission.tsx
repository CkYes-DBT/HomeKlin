"use client";

import { CircleCheck, CircleHelp, CircleX, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type Permission = "granted" | "prompt" | "denied";

// The word with an icon on its own tint, never colour alone.
const looks: Record<Permission, { Icon: LucideIcon; tone: string }> = {
  granted: { Icon: CircleCheck, tone: "bg-success-surface text-success" },
  prompt: { Icon: CircleHelp, tone: "bg-sunken text-ink" },
  denied: { Icon: CircleX, tone: "bg-danger-surface text-danger" },
};

// Whether this browser lets the site read the location that check-in records (D4, mock
// Cleaner-Account "Izin kamera dan lokasi"; the camera is not used while the stream comes from the
// clip library, docs/adr/0002). Read from the Permissions API and followed while the page is open; a
// browser without it, or the server's render, says the browser asks at check-in, which is what happens.
// Source: https://developer.mozilla.org/docs/Web/API/Permissions/query
export function LocationPermission() {
  const t = useTranslations("CleanerPermission");
  const [permission, setPermission] = useState<Permission>("prompt");

  useEffect(() => {
    let status: PermissionStatus | null = null;
    let gone = false;
    const follow = () => {
      if (status) setPermission(status.state);
    };
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((result) => {
        if (gone) return;
        status = result;
        follow();
        result.addEventListener("change", follow);
      })
      .catch((error: unknown) => {
        console.warn("[permission] could not read the location permission:", error);
      });
    return () => {
      gone = true;
      status?.removeEventListener("change", follow);
    };
  }, []);

  const { Icon, tone } = looks[permission];
  return (
    <span className="flex flex-col items-end gap-1 text-right">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${tone}`}>
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {t(permission)}
      </span>
      {permission === "denied" ? <span className="max-w-56 text-xs text-ink-muted">{t("deniedHint")}</span> : null}
    </span>
  );
}
