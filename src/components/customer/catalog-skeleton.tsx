import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";

// What /services shows while step 1 loads (the <Suspense> fallback, part of the prerendered shell):
// the same blocks in the same places as the loaded page (the area card, the search and type row, the
// service cards beside the summary), so nothing jumps when the content arrives. The status line says
// it in words; the blocks are decorative and pulse only when motion is allowed.
export function CatalogSkeleton() {
  const t = useTranslations("CatalogResults");
  const bar = "rounded-full bg-sunken";
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-6">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-5 motion-safe:animate-pulse" aria-hidden="true">
          <div className="flex flex-col gap-4 rounded-lg bg-card p-5 md:flex-row md:items-end md:justify-between md:p-6">
            <div className="flex flex-col gap-1.5">
              <span className={`h-6 w-28 ${bar}`} />
              <span className={`h-4 w-56 max-w-full ${bar}`} />
            </div>
            <span className="h-12 w-full rounded-sm bg-sunken md:w-80" />
          </div>
          <div className="flex flex-col gap-4">
            <span className={`h-12 w-full md:max-w-md ${bar}`} />
            <div className="flex flex-wrap gap-2">
              <span className={`h-11 w-20 ${bar}`} />
              <span className={`h-11 w-32 ${bar}`} />
              <span className={`h-11 w-36 ${bar}`} />
              <span className={`h-11 w-44 ${bar}`} />
            </div>
          </div>
        </div>
        <div>
          <p role="status" className="flex h-7 items-center gap-2 text-sm text-ink-muted">
            <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {t("loading")}
          </p>
          <ul className="mt-3 grid gap-3 motion-safe:animate-pulse md:grid-cols-2 md:gap-4" aria-hidden="true">
            {[0, 1, 2, 3].map((index) => (
              <li key={index} className="flex h-20 flex-col gap-2 rounded-lg bg-card p-4 md:h-52 md:p-5">
                <span className={`h-5 w-3/4 ${bar}`} />
                <span className={`h-4 w-1/3 ${bar}`} />
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="hidden h-96 rounded-lg bg-card motion-safe:animate-pulse lg:block" aria-hidden="true" />
    </div>
  );
}
