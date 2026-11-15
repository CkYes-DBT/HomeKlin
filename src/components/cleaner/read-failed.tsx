import { CircleAlert } from "lucide-react";

type ReadFailedProps = {
  title: string;
  body: string;
  retry: string;
  /** h1 when the failure replaces the whole page (its own title was data), h2 inside a page. */
  heading?: "h1" | "h2";
};

// A cleaner page that could not read its data (D4): what failed, what to do, and a reload. A plain
// link on purpose: a full page load reads everything again.
export function ReadFailed({ title, body, retry, heading = "h2" }: ReadFailedProps) {
  const Heading = heading;
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-surface text-danger">
        <CircleAlert className="size-6" aria-hidden="true" />
      </span>
      <Heading className="font-display text-lg font-semibold text-ink">{title}</Heading>
      <p className="max-w-prose text-sm text-ink-muted">{body}</p>
      <a
        href=""
        className="mt-1 inline-flex min-h-touch items-center justify-center rounded-full bg-card px-5 text-sm font-semibold text-ink inset-ring-[1.5px] inset-ring-outline transition-[background-color,transform] duration-150 ease-out-quart hover:bg-sunken active:scale-[0.98] active:bg-lime-wash"
      >
        {retry}
      </a>
    </div>
  );
}
