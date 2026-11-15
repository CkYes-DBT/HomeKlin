"use client";

import { CircleCheck, Clock, MapPin, MapPinCheck, TimerOff, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { checkInState, type CheckInState } from "@/lib/jobs/check-in";
import { pillBase } from "./cleaner-views";

export type JobTimesOnly = { startsAt: string; endsAt: string; checkedInAt: string | null; completedAt: string | null };

// A job's state as a word with an icon on its own tint, never colour alone (markdown/PRODUCT.md,
// Accessibility), on the redesign's status containers.
const pills: Record<CheckInState, { Icon: LucideIcon; tone: string }> = {
  early: { Icon: Clock, tone: "bg-sunken text-ink" },
  open: { Icon: MapPin, tone: "bg-info-surface text-info" },
  late: { Icon: TimerOff, tone: "bg-warning-surface text-warning" },
  checkedIn: { Icon: MapPinCheck, tone: "bg-live-surface text-live" },
  completed: { Icon: CircleCheck, tone: "bg-success-surface text-success" },
};

/** The pill for a state already worked out (the job page, which keeps its own clock). */
export function StatePill({ state }: { state: CheckInState }) {
  const t = useTranslations("CleanerJobActions");
  const { Icon, tone } = pills[state];
  return (
    <span className={`${pillBase} ${tone}`}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {t(`status.${state}`)}
    </span>
  );
}

/**
 * The pill on a job in the list (/cleaner/jobs): it follows the clock (checkInState, the rule the
 * database enforces too), so a list left open says "Siap check-in" once check-in opens.
 */
export function JobStatePill({ job, renderedAt }: { job: JobTimesOnly; renderedAt: string }) {
  const now = useNow(renderedAt);
  return <StatePill state={checkInState(job, new Date(now))} />;
}

/** The time now, from the server's render time at first, then from the browser every 20 seconds. */
export function useNow(renderedAt: string): number {
  const [now, setNow] = useState(() => Date.parse(renderedAt));
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  return now;
}
