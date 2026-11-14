import { Check } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getPathname } from "@/i18n/navigation";
import type { MonitorFilters, MonitorView } from "./admin-console";
import { SubmitOnChangeSelect } from "./submit-on-change";

type MonitorFiltersFormProps = {
  filters: MonitorFilters;
  /** The served areas, named in the page's language. */
  areas: readonly { id: string; name: string }[];
};

const views: readonly MonitorView[] = ["all", "troubled"];

// The live monitor's filters (M2, after the user's mock "Admin-Live"): the segmented toggle
// "Semua / Terkendala" and the "Area layanan" select, in one plain GET form (?view=&area=), so they
// work without JavaScript and the choice survives a reload. The toggle's buttons send their own view;
// the hidden field after them carries the current one when the select sends the form. The pressed
// button is filled and carries a check and aria-pressed, never colour alone.
export async function MonitorFiltersForm({ filters, areas }: MonitorFiltersFormProps) {
  const [t, locale] = await Promise.all([getTranslations("AdminMonitorPage.filters"), getLocale()]);
  const action = getPathname({ href: "/admin/monitor", locale });

  return (
    <form method="get" action={action} aria-label={t("label")} className="flex flex-wrap items-end gap-3">
      <div role="group" aria-label={t("viewLabel")} className="inline-flex rounded-full bg-card inset-ring inset-ring-border-control">
        {views.map((view) => {
          const pressed = filters.view === view;
          return (
            <button
              key={view}
              type="submit"
              name="view"
              value={view}
              aria-pressed={pressed}
              className={`inline-flex min-h-touch items-center gap-1.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-[background-color,color,transform] duration-150 ease-out-quart active:scale-[0.98] ${
                pressed ? "bg-primary text-on-primary hover:bg-primary-container" : "text-ink hover:bg-sunken active:bg-lime-wash"
              }`}
            >
              {pressed ? <Check className="size-4 shrink-0" strokeWidth={2.5} aria-hidden="true" /> : null}
              {t(`views.${view}`)}
            </button>
          );
        })}
      </div>
      <input type="hidden" name="view" value={filters.view} />

      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor="monitor-area" className="text-xs font-medium text-ink-muted">
          {t("areaLabel")}
        </label>
        <SubmitOnChangeSelect
          id="monitor-area"
          name="area"
          value={filters.area ?? ""}
          options={[{ value: "", label: t("allAreas") }, ...areas.map((area) => ({ value: area.id, label: area.name }))]}
          className="h-11 min-w-44 rounded-full bg-card pr-10 pl-4 text-sm font-medium text-ink inset-ring inset-ring-border-control transition-colors duration-150 ease-out-quart hover:inset-ring-primary"
        />
      </div>

      {/* Without JavaScript a changed select needs a button to send it; with it, the change sends itself. */}
      <noscript>
        <button
          type="submit"
          className="inline-flex min-h-touch items-center rounded-full border-[1.5px] border-outline px-4 text-sm font-semibold text-ink hover:bg-card"
        >
          {t("apply")}
        </button>
      </noscript>
    </form>
  );
}
