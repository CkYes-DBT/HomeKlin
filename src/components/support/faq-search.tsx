import { Search } from "lucide-react";
import Form from "next/form";
import { getLocale, getTranslations } from "next-intl/server";
import { getPathname } from "@/i18n/navigation";

// The FAQ's search box (T19): a GET form to /support?q=<words>, so a search is in the address, survives
// a reload and works without JavaScript; with it, next/form opens the results without a full page load.
// The search button comes after the field, so Enter in the field searches.
// Source: node_modules/next/dist/docs/01-app/03-api-reference/02-components/form.md
export async function FaqSearch({ query }: { query: string }) {
  const [t, locale] = await Promise.all([getTranslations("SupportPage"), getLocale()]);
  return (
    <Form action={getPathname({ href: "/support", locale })} role="search" aria-label={t("search.formLabel")}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cari-bantuan" className="text-sm font-medium text-ink-muted">
          {t("search.label")}
        </label>
        <div className="flex gap-2">
          <span className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            {/* Keyed by the words, so "Tampilkan semua pertanyaan" empties the field too. */}
            <input
              key={query}
              id="cari-bantuan"
              name="q"
              type="search"
              defaultValue={query}
              placeholder={t("search.placeholder")}
              maxLength={100}
              autoComplete="off"
              enterKeyHint="search"
              className="h-12 w-full rounded-full bg-card inset-ring-1 inset-ring-border-control pr-4 pl-10 text-base text-ink caret-primary transition-colors duration-150 ease-out-quart placeholder:text-ink-muted hover:inset-ring-primary"
            />
          </span>
          <button
            type="submit"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-on-primary transition-[background-color,transform] duration-150 ease-out-quart hover:bg-primary-container active:scale-[0.98] active:bg-band"
          >
            {t("search.submit")}
          </button>
        </div>
      </div>
    </Form>
  );
}
