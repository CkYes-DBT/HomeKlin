import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";

// What a protected page shows where its content goes while <RoleGate> checks who is signed in: the
// <Suspense> fallback, so it is part of the prerendered shell and appears at once. Usually only for a
// moment; a visitor with the wrong role is sent on from here and never sees the content.
// variant="action" holds the place of a header's gated action instead: an empty block the size of a
// 44 px pill (about as wide as "Tambah layanan"), hidden from screen readers, so the header does not
// move when the pill streams in. It carries no words, so the prerendered page never names the action.
export function GateFallback({ variant = "content" }: { variant?: "content" | "action" }) {
  if (variant === "action") return <span aria-hidden="true" className="block h-touch w-44" />;
  return <Loading />;
}

function Loading() {
  const t = useTranslations("GateFallback");
  return (
    <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-12">
      <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
        <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
        {t("loading")}
      </p>
    </div>
  );
}
