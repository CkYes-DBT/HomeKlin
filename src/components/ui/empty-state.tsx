import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  /** Say what will appear here and how it gets there; no "coming soon". */
  children: ReactNode;
  /**
   * "forest" inside the redesigned admin console (Phase 13, markdown/design.md "Empty state"): a white
   * lg card with a dashed edge and a lime-wash icon well. The T3b pages keep the default.
   */
  tone?: "default" | "forest";
};

const tones = {
  default: { box: "rounded-xl bg-surface", well: "bg-brand-50 text-brand-700" },
  forest: { box: "rounded-lg bg-card", well: "bg-lime-wash text-on-lime-wash" },
};

export function EmptyState({ icon: Icon, title, children, tone = "default" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center border border-dashed border-border px-6 py-12 text-center ${tones[tone].box}`}>
      <span className={`flex size-12 items-center justify-center rounded-full ${tones[tone].well}`}>
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 font-display text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 max-w-prose text-sm text-ink-muted">{children}</p>
    </div>
  );
}
