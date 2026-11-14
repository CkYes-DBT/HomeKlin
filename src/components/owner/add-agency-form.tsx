"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { useResultKey } from "@/components/admin/form-fields";
import { secondaryButton } from "@/components/agency/styles";
import { TextField } from "@/components/auth/form-controls";
import { Link } from "@/i18n/navigation";
import { addAgency, type OwnerFailureKey } from "@/lib/owner/actions";
import { FormFeedback } from "./form-feedback";
import { OwnerSubmitButton } from "./submit-button";

const partnerRefusals = ["notAllowed", "nameInvalid", "areaNotFound", "agencyNotFound", "statusInvalid"] as const;

/** The refusals addAgency can give; any other reads as "not saved". */
function partnerRefusal(key: OwnerFailureKey): (typeof partnerRefusals)[number] | "unavailable" {
  return (partnerRefusals as readonly string[]).includes(key) ? (key as (typeof partnerRefusals)[number]) : "unavailable";
}

type AddAgencyFormProps = {
  /** Every service area, in the page's language. */
  areas: readonly { id: string; name: string }[];
};

// "Tambah mitra agensi" (T29c; its own page since D3, after the mock Owner-PartnerNew): the partner's
// name and the areas it serves. addAgency checks the owner role and the input on the server. The form
// keeps what was typed when the server refuses it (it is sent with startTransition, so React does not
// clear it) and empties itself once the partner is added, saying so with a link back to the list.
// Source: node_modules/next/dist/docs/01-app/02-guides/forms.md ("Validation errors", "Pending states")
export function AddAgencyForm({ areas }: AddAgencyFormProps) {
  const t = useTranslations("OwnerAgenciesPage");
  const [state, formAction, pending] = useActionState(addAgency, null);
  const [sentName, setSentName] = useState("");
  const resultKey = useResultKey(state);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) form.current?.reset();
    else if (state?.formError === "nameInvalid") form.current?.querySelector<HTMLElement>("#mitra-nama")?.focus();
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setSentName(String(data.get("name") ?? "").trim());
    startTransition(() => formAction(data));
  }

  const error = state?.formError && !pending ? t(`errors.${partnerRefusal(state.formError)}`) : null;
  const nameError = state?.formError === "nameInvalid" && !pending ? (error ?? undefined) : undefined;
  const added = state?.ok && !pending;

  return (
    <form ref={form} action={formAction} onSubmit={onSubmit} noValidate aria-labelledby="mitra-form-title" className="flex flex-col gap-5">
      <h2 id="mitra-form-title" className="sr-only">
        {t("form.submit")}
      </h2>
      <TextField
        look="panel"
        id="mitra-nama"
        name="name"
        label={t("form.name")}
        hint={t("form.nameHint")}
        error={nameError}
        maxLength={120}
        autoComplete="off"
        required
      />
      <fieldset className="flex min-w-0 flex-col gap-1.5">
        <legend className="text-xs font-semibold text-ink">{t("form.areas")}</legend>
        <p className="text-xs text-ink-muted">{t("form.areasHint")}</p>
        <div className="mt-1 grid gap-x-4 sm:grid-cols-2">
          {areas.map((area) => (
            <AreaCheckbox key={area.id} id={area.id} label={area.name} />
          ))}
        </div>
      </fieldset>
      <FormFeedback error={error} errorShownAtField={Boolean(nameError)} done={added ? t("form.done", { name: sentName }) : null} resultKey={resultKey} />
      <div className="flex flex-wrap gap-3">
        <OwnerSubmitButton pending={pending} label={t("form.submit")} pendingLabel={t("form.pending")} />
        <Link href="/owner/agencies" className={`${secondaryButton} px-6`}>
          {added ? t("form.toList") : t("form.cancel")}
        </Link>
      </div>
    </form>
  );
}

// A 24 px box inside a label at least 44 px tall, so the whole line is the target (as CheckboxField in
// src/components/admin/form-fields.tsx, with the area's id as the value it posts).
function AreaCheckbox({ id, label }: { id: string; label: string }) {
  const inputId = `mitra-area-${id}`;
  return (
    <label
      htmlFor={inputId}
      className="group flex min-h-touch w-fit cursor-pointer items-center gap-3 rounded-full py-1 pr-4 pl-1 transition-colors duration-150 ease-out-quart hover:bg-sunken has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus"
    >
      <span className="relative flex size-6 shrink-0 items-center justify-center">
        <input
          id={inputId}
          name="areaIds"
          value={id}
          type="checkbox"
          className="peer size-6 cursor-pointer appearance-none rounded-sm border border-border-control bg-card transition-colors duration-150 ease-out-quart group-hover:border-primary checked:border-primary checked:bg-primary focus-visible:outline-none"
        />
        <Check className="pointer-events-none absolute size-4 text-on-primary opacity-0 peer-checked:opacity-100" strokeWidth={3} aria-hidden="true" />
      </span>
      <span className="text-sm font-medium text-ink">{label}</span>
    </label>
  );
}
