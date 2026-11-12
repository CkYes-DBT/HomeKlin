import type { LucideIcon } from "lucide-react";

/**
 * A status chip on the admin live monitor (M1): an icon and a word, never colour alone. Used by the
 * live chip (FeedStatus, a client component) and by the "Belum check-in" chip of a waiting card (on
 * the server), so it carries no directive of its own.
 */
export function StatusPill({ Icon, pill, label }: { Icon: LucideIcon; pill: string; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${pill}`}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
