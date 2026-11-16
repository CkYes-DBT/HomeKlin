"use client";

import { CircleCheck, CircleMinus, Info, LoaderCircle, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { startTransition, useActionState, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useResultKey } from "@/components/admin/form-fields";
import { StatusPill } from "@/components/back-office/status-pill";
import type { AgencyFailureKey } from "@/lib/agency/actions";
import { ActionFeedback } from "./action-feedback";
import type { AgencyAction } from "./agency-action";
import { panel, primaryButton, secondaryButton } from "./styles";
import { collapseExitMilliseconds, usePresence } from "./use-presence";

export type ServiceChoiceRow = {
  id: string;
  name: string;
  /** "Jenis: Seluruh rumah". */
  type: string;
  /** "Sekitar 2 jam". */
  duration: string;
  /** The customer price, written as rupiah. */
  price: string;
  /** The service's picture, rendered on the server. */
  visual: ReactNode;
  offered: boolean;
};

type ServicesChoiceProps = {
  rows: readonly ServiceChoiceRow[];
  /** False while the agency has never chosen: it then offers every service, also new ones. */
  restricted: boolean;
  saveAgencyServices: AgencyAction;
};

type State = { formError?: AgencyFailureKey; saved?: true } | null;

const cell = "px-4 py-3 align-middle";
const headCell = "px-4 py-3 text-left text-xs font-semibold text-ink-muted";

// "Layanan" (D2, after the mock Partner-Services; B12): HomeKlin's active services and whether the
// agency offers each. "Ubah pilihan" turns the last column into checkboxes ("Tawarkan <layanan>") with
// "Simpan pilihan" and "Batal"; a box above them offers every service, also the ones HomeKlin adds
// later (the agency's state before it ever chose). saveAgencyServices checks the role and the ids on
// the server, and the database saves the choice for the caller's own agency only; customers are then
// routed only to agencies that offer the service. Batal puts the boxes back as they were saved. The
// edit note opens and closes smoothly (motion.css, .partner-collapse) and the boxes and the words swap
// with a short fade.
export function ServicesChoice({ rows, restricted, saveAgencyServices }: ServicesChoiceProps) {
  const t = useTranslations("AgencyServicesPage");
  const tError = useTranslations("AgencyErrors");
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set(rows.filter((row) => row.offered).map((row) => row.id)));
  const [offerAll, setOfferAll] = useState(!restricted);
  const editButton = useRef<HTMLButtonElement>(null);
  const note = usePresence(editing, collapseExitMilliseconds);

  const [state, formAction, pending] = useActionState(async (previous: State, formData: FormData): Promise<State> => {
    void previous;
    const result = await saveAgencyServices(null, formData);
    return result?.ok ? { saved: true } : { formError: result?.formError ?? "unavailable" };
  }, null);
  const resultKey = useResultKey(state);

  // A saved choice closes the edit mode; the page then shows what the server stored.
  const [handled, setHandled] = useState<State>(null);
  if (state !== handled) {
    setHandled(state);
    if (state?.saved) setEditing(false);
  }

  function start() {
    setChosen(new Set(rows.filter((row) => row.offered).map((row) => row.id)));
    setOfferAll(!restricted);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    // Back to the button that opened the edit mode, so a keyboard user stays in place.
    requestAnimationFrame(() => editButton.current?.focus());
  }

  function toggle(serviceId: string, on: boolean) {
    const next = new Set(chosen);
    if (on) next.add(serviceId);
    else next.delete(serviceId);
    setChosen(next);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    // Built from the choice, not the boxes: a phone and a desk draw each row's box in a different
    // place, and only one of the two is shown.
    const formData = new FormData();
    if (offerAll) formData.set("offerAll", "on");
    else for (const serviceId of chosen) formData.append("serviceId", serviceId);
    startTransition(() => formAction(formData));
  }

  const offeredPill = (
    <span className="partner-swap-in">
      <StatusPill Icon={CircleCheck} pill="bg-success-surface text-success" label={t("offered")} />
    </span>
  );
  const notOfferedPill = (
    <span className="partner-swap-in">
      <StatusPill Icon={CircleMinus} pill="bg-sunken text-ink-muted" label={t("notOffered")} />
    </span>
  );

  function status(row: ServiceChoiceRow) {
    if (!editing) return row.offered ? offeredPill : notOfferedPill;
    const checked = offerAll || chosen.has(row.id);
    return (
      <label className="inline-flex min-h-touch cursor-pointer items-center gap-2.5 text-sm font-medium text-ink has-disabled:cursor-not-allowed has-disabled:text-ink-muted partner-swap-in">
        <input
          type="checkbox"
          value={row.id}
          checked={checked}
          disabled={offerAll}
          onChange={(event) => toggle(row.id, event.target.checked)}
          aria-label={t("offerService", { name: row.name })}
          className="size-5 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
        />
        <span aria-hidden="true">{checked ? t("offered") : t("notOffered")}</span>
      </label>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="font-display text-lg font-semibold text-ink">
          {t("listTitle")}
        </h2>
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={cancel} className={secondaryButton}>
              {t("cancel")}
            </button>
            <button type="submit" aria-disabled={pending || undefined} className={primaryButton}>
              {pending ? <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              {pending ? t("saving") : t("save")}
            </button>
          </div>
        ) : (
          <button ref={editButton} type="button" onClick={start} className={secondaryButton}>
            <Pencil className="size-4 shrink-0" aria-hidden="true" />
            {t("edit")}
          </button>
        )}
      </div>

      {/* -mb-4 and pb-4 cancel the form's gap while the note is closed, so nothing jumps. */}
      {note.mounted ? (
        <div className="partner-collapse -mb-4" data-closing={note.leaving || undefined} inert={note.leaving}>
          <div>
            <div className="pb-4">
              <div className="flex flex-col gap-3 rounded-md bg-lime-wash px-4 py-3 text-sm text-on-lime-wash">
                <p className="flex items-start gap-2">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{t("editing")}</span>
                </p>
                <label className="inline-flex min-h-touch cursor-pointer items-center gap-2.5 font-medium">
                  <input
                    type="checkbox"
                    checked={offerAll}
                    onChange={(event) => setOfferAll(event.target.checked)}
                    className="size-5 shrink-0 cursor-pointer accent-primary"
                  />
                  {t("offerAll")}
                </label>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ActionFeedback
        error={state?.formError ? tError(state.formError) : undefined}
        done={state?.saved && !editing ? t("saved") : undefined}
        resultKey={resultKey}
      />

      <div className={`${panel} overflow-hidden`}>
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead className="hidden bg-sunken md:table-header-group">
            <tr>
              <th scope="col" className={headCell}>
                {t("table.service")}
              </th>
              <th scope="col" className={headCell}>
                {t("table.duration")}
              </th>
              <th scope="col" className={`${headCell} text-right`}>
                {t("table.price")}
              </th>
              <th scope="col" className={headCell}>
                {t("table.offered")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-service={row.id} className="border-t border-border">
                <td className={cell}>
                  <span className="flex items-center gap-3">
                    {row.visual}
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold text-ink">{row.name}</span>
                      <span className="text-xs text-ink-muted">{row.type}</span>
                      {/* Phones: duration, price and the choice under the name, so nothing scrolls sideways. */}
                      <span className="mt-2 flex flex-col items-start gap-1.5 md:hidden">
                        <span className="text-ink tabular-nums">
                          {row.duration}, <span className="font-semibold">{row.price}</span>
                        </span>
                        {status(row)}
                      </span>
                    </span>
                  </span>
                </td>
                <td className={`${cell} hidden text-ink md:table-cell`}>{row.duration}</td>
                <td className={`${cell} hidden text-right font-semibold whitespace-nowrap text-ink tabular-nums md:table-cell`}>{row.price}</td>
                <td className={`${cell} hidden md:table-cell`}>{status(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
