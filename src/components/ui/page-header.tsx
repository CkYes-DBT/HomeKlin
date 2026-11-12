import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  /**
   * "large" for customer pages: the title grows to text-3xl from tablet width. Back office keeps
   * text-2xl. "compact" for the redesigned back office (admin, Phase 13): a 22 px title (text-title).
   */
  size?: "default" | "large" | "compact";
  /** The page's one main action (a ButtonLink), right of the title from 640 px and under it below. */
  action?: ReactNode;
};

const sizes = {
  default: { title: "text-2xl", description: "text-sm" },
  large: { title: "text-2xl md:text-3xl md:tracking-display", description: "text-sm md:text-base" },
  compact: { title: "text-title", description: "text-sm" },
};

export function PageHeader({ title, description, size = "default", action }: PageHeaderProps) {
  const text = (
    <div className="flex min-w-0 flex-col gap-1.5">
      <h1 className={`font-display font-semibold text-ink ${sizes[size].title}`}>{title}</h1>
      {description ? (
        <p className={`max-w-prose text-ink-muted ${sizes[size].description}`}>{description}</p>
      ) : null}
    </div>
  );
  if (!action) return <header className="flex flex-col">{text}</header>;
  return (
    <header className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between sm:gap-6">
      {text}
      <div className="shrink-0">{action}</div>
    </header>
  );
}
