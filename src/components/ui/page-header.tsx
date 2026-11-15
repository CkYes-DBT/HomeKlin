import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  /**
   * "large" for customer pages: the title grows to text-3xl from tablet width. Back office keeps
   * text-2xl. "compact" for the redesigned back office (admin, Phase 13): a 22 px title (text-title).
   */
  size?: "default" | "large" | "compact" | "flow";
  /** The page's one main action (a ButtonLink), right of the title from 640 px and under it below. */
  action?: ReactNode;
  /**
   * A way back to the list a form page belongs to ("Kembali ke mitra agensi", the owner's add pages,
   * D3): a 44 px link above the title. Page chrome, so it may sit outside a page's role check.
   */
  back?: { href: string; label: string };
  /** "center" sets the title and description in the middle, over a centred form (the owner's add pages). */
  align?: "start" | "center";
};

const sizes = {
  default: { title: "text-2xl", description: "text-sm" },
  large: { title: "text-2xl md:text-3xl md:tracking-display", description: "text-sm md:text-base" },
  compact: { title: "text-title", description: "text-sm" },
  // The customer redesign (D5): 30 px on phones, 36 px from tablets, as the booking steps' titles.
  flow: { title: "text-headline-sm md:text-4xl md:tracking-display", description: "text-base md:text-body-lg" },
};

export function PageHeader({ title, description, size = "default", action, back, align = "start" }: PageHeaderProps) {
  const centered = align === "center";
  const text = (
    <div className={`flex min-w-0 flex-col gap-1.5 ${centered ? "items-center text-center" : ""}`}>
      <h1 className={`font-display font-semibold text-ink ${sizes[size].title}`}>{title}</h1>
      {description ? (
        <p className={`max-w-prose text-ink-muted ${sizes[size].description}`}>{description}</p>
      ) : null}
    </div>
  );
  const backLink = back ? (
    <Link
      href={back.href}
      className="inline-flex min-h-touch w-fit items-center gap-1.5 rounded-sm text-sm font-semibold text-primary underline-offset-4 transition-colors duration-150 ease-out-quart hover:underline active:text-band"
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
      {back.label}
    </Link>
  ) : null;
  if (!action) {
    return (
      <header className="flex flex-col gap-2">
        {backLink}
        {text}
      </header>
    );
  }
  return (
    <header className="flex flex-col gap-2">
      {backLink}
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between sm:gap-6">
        {text}
        <div className="shrink-0">{action}</div>
      </div>
    </header>
  );
}
