"use client";

import { ChevronDown, LoaderCircle, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useResultKey } from "@/components/admin/form-fields";
import { TextField } from "@/components/auth/form-controls";
import type { AgencyFailureKey } from "@/lib/agency/actions";
import { ActionFeedback } from "./action-feedback";
import type { AgencyAction } from "./agency-action";
import { primaryButton, rowControl, secondaryButton } from "./styles";

type CleanerRowProps = {
  cleaner: { id: string; fullName: string; phone: string | null; areaId: string | null };
  /** The agency's own areas, by name: the only areas a cleaner can have (set_cleaner_details checks it too). */
  areas: readonly { id: string; name: string }[];
  /** The photo (or initials) and the status pill, rendered on the server. */
  photo: ReactNode;
  status: ReactNode;
  /** How many jobs the cleaner has this week. */
  weekJobs: number;
  updateCleanerDetails: AgencyAction;
};

type State = { formError?: AgencyFailureKey; saved?: true } | null;

const cell = "px-4 py-3 align-middle";

// One cleaner in "Petugas dan ketersediaan" (D2, after the mock Partner-Cleaners; B11): photo, name,
// phone and area, whether at work now, and this week's jobs, with "Ubah" opening a form row under it
// for the phone (0812..., stored as +628...) and the area, one of the agency's own. updateCleanerDetails
// checks the role and both fields on the server, and the database checks that the cleaner and the area
// are the caller agency's. Batal and a save close the form and put the cursor back on "Ubah".
export function CleanerRow({ cleaner, areas, photo, status, weekJobs, updateCleanerDetails }: CleanerRowProps) {
  const t = useTranslations("AgencyCleanersPage");
  const tError = useTranslations("AgencyErrors");
  const id = useId();
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const firstField = useRef<HTMLDivElement>(null);
  const areaName = cleaner.areaId ? (areas.find((area) => area.id === cleaner.areaId)?.name ?? cleaner.areaId) : null;

  const [state, formAction, pending] = useActionState(async (previous: State, formData: FormData): Promise<State> => {
    void previous;
    const result = await updateCleanerDetails(null, formData);
    return result?.ok ? { saved: true } : { formError: result?.formError ?? "unavailable" };
  }, null);
  const resultKey = useResultKey(state);

  const [handled, setHandled] = useState<State>(null);
  if (state !== handled) {
    setHandled(state);
    if (state?.saved) setEditing(false);
  }

  // The form opens with the cursor in its first field; closing it puts the cursor back on "Ubah".
  const opened = useRef(false);
  useEffect(() => {
    if (editing) firstField.current?.querySelector("input")?.focus();
    else if (opened.current) editButton.current?.focus();
    opened.current = editing;
  }, [editing]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const phone = cleaner.phone ?? <span className="text-ink-muted">{t("noPhone")}</span>;
  const area = areaName ?? <span className="text-ink-muted">{t("noArea")}</span>;

  return (
    <>
      <tr data-cleaner={cleaner.id} className="border-t border-border">
        <td className={cell}>
          <span className="flex items-center gap-3">
            {photo}
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-semibold text-ink">{cleaner.fullName}</span>
              {/* Below the desk: phone and area under the name, so nothing scrolls sideways. */}
              <span className="flex flex-col text-xs text-ink-muted lg:hidden">
                <span className="tabular-nums">{phone}</span>
                <span>{area}</span>
              </span>
              <span className="sm:hidden">{status}</span>
              <span className="text-xs text-ink tabular-nums sm:hidden">{t("weekJobsValue", { count: weekJobs })}</span>
              {!editing ? (
                <ActionFeedback done={state?.saved ? t("details.saved", { name: cleaner.fullName }) : undefined} resultKey={resultKey} size="compact" />
              ) : null}
            </span>
          </span>
        </td>
        <td className={`${cell} hidden text-ink tabular-nums lg:table-cell`}>{phone}</td>
        <td className={`${cell} hidden text-ink lg:table-cell`}>{area}</td>
        <td className={`${cell} hidden sm:table-cell`}>{status}</td>
        <td className={`${cell} hidden text-right text-ink tabular-nums sm:table-cell`}>{weekJobs}</td>
        <td className={`${cell} w-14 text-right`}>
          <button
            ref={editButton}
            type="button"
            onClick={() => setEditing(!editing)}
            aria-expanded={editing}
            aria-controls={`${id}-form`}
            aria-label={t("details.editFor", { name: cleaner.fullName })}
            className={`${secondaryButton} px-3 md:px-4`}
          >
            <Pencil className="size-4 shrink-0" aria-hidden="true" />
            <span className="hidden md:inline">{t("details.edit")}</span>
          </button>
        </td>
      </tr>
      {editing ? (
        <tr className="bg-field">
          <td colSpan={6} className="px-4 pt-2 pb-5">
            <form id={`${id}-form`} onSubmit={submit} noValidate aria-label={t("details.formLabel", { name: cleaner.fullName })} className="flex flex-col gap-4">
              <input type="hidden" name="cleanerId" value={cleaner.id} />
              <div ref={firstField} className="grid gap-4 md:grid-cols-2 md:gap-x-6">
                <TextField
                  look="panel"
                  id={`${id}-phone`}
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  label={t("details.phone")}
                  hint={t("details.phoneHint")}
                  defaultValue={cleaner.phone ?? ""}
                  aria-invalid={state?.formError === "phoneInvalid" ? true : undefined}
                />
                <div className="flex flex-col gap-2">
                  <label htmlFor={`${id}-area`} className="px-1 text-sm font-medium text-ink">
                    {t("details.area")}
                  </label>
                  <span className="relative">
                    <select
                      id={`${id}-area`}
                      name="areaId"
                      defaultValue={cleaner.areaId ?? ""}
                      aria-describedby={`${id}-area-hint`}
                      aria-invalid={state?.formError === "areaNotServed" ? true : undefined}
                      className={`${rowControl} w-full cursor-pointer appearance-none pr-10`}
                    >
                      <option value="">{t("details.noArea")}</option>
                      {areas.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
                  </span>
                  <p id={`${id}-area-hint`} className="px-1 text-sm text-ink-muted">
                    {t("details.areaHint")}
                  </p>
                </div>
              </div>
              <ActionFeedback error={state?.formError ? tError(state.formError) : undefined} resultKey={resultKey} />
              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" aria-disabled={pending || undefined} className={primaryButton}>
                  {pending ? <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                  {pending ? t("details.saving") : t("details.save")}
                </button>
                <button type="button" onClick={() => setEditing(false)} className={secondaryButton}>
                  {t("details.cancel")}
                </button>
              </div>
            </form>
          </td>
        </tr>
      ) : null}
    </>
  );
}
