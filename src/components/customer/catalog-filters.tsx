import { Check, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { serviceCategories, type ServiceCategory } from "@/lib/catalog/catalog";

// The keyword search and the service-type filter of /services. Both are fields of the catalog form
// (src/components/customer/catalog-form.tsx): `q`, and `type` from the pressed type button. Order
// matters: the search button comes first, so Enter in the search field searches (a form's default
// button is its first), and the hidden `type` field comes after the type buttons, so a pressed
// button's value wins (the first value of a field counts).

/** A keyword in both languages (the catalog searches names and descriptions in Indonesian and English). */
export function CatalogSearch({ query }: { query?: string }) {
  const t = useTranslations("CatalogFilters");
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="cari-layanan" className="text-xs font-medium text-ink-muted">
        {t("searchLabel")}
      </label>
      <div className="flex gap-2">
        <span className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          {/* Keyed by the keyword, so clearing the search from a link empties the field too. */}
          <input
            key={query ?? ""}
            id="cari-layanan"
            name="q"
            type="search"
            defaultValue={query}
            placeholder={t("searchPlaceholder")}
            maxLength={60}
            autoComplete="off"
            enterKeyHint="search"
            className="h-12 w-full rounded-full bg-card pr-4 pl-10 text-base text-ink caret-primary inset-ring-1 inset-ring-border-control transition-shadow duration-150 ease-out-quart placeholder:text-ink-muted hover:inset-ring-primary"
          />
        </span>
        <button
          type="submit"
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-on-primary transition-[background-color,transform] duration-150 ease-out-quart hover:bg-primary-container active:scale-[0.98] active:bg-band motion-reduce:active:scale-100"
        >
          {t("searchSubmit")}
        </button>
      </div>
    </div>
  );
}

const chip =
  "inline-flex min-h-touch items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-[background-color,color,transform] duration-150 ease-out-quart active:scale-[0.98] motion-reduce:active:scale-100";
const chipStates = {
  pressed: "bg-primary text-on-primary hover:bg-primary-container",
  idle: "bg-card text-ink inset-ring-1 inset-ring-border-control hover:bg-sunken active:bg-lime-wash",
};

/**
 * The type filter: one toggle button per type and "Semua". The pressed one is filled and carries a
 * check icon and aria-pressed, so the state never rests on colour alone. The buttons wrap onto a
 * second row at 360 px instead of scrolling sideways.
 */
export function CatalogTypeFilter({ current }: { current?: ServiceCategory }) {
  const t = useTranslations("CatalogFilters");
  const options = [undefined, ...serviceCategories] as const;
  return (
    <>
      <div role="group" aria-label={t("typeLabel")} className="flex flex-wrap gap-2">
        {options.map((category) => {
          const pressed = category === current;
          return (
            <button
              key={category ?? "all"}
              type="submit"
              name="type"
              value={category ?? ""}
              aria-pressed={pressed}
              className={`${chip} ${pressed ? chipStates.pressed : chipStates.idle}`}
            >
              {pressed ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
              {t(`types.${category ?? "all"}`)}
            </button>
          );
        })}
      </div>
      <input type="hidden" name="type" value={current ?? ""} />
    </>
  );
}
