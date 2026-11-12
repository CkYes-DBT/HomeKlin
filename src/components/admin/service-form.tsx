"use client";

import { LoaderCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, type MouseEvent } from "react";
import { FormAlert, TextField } from "@/components/auth/form-controls";
import { ButtonLink } from "@/components/ui/button-link";
import { createService, updateService } from "@/lib/catalog/admin-actions";
import type { ServiceField, ServiceFormValues } from "@/lib/validation/service";
import { CheckboxField, FixedField, FormSection, SelectField, TextAreaField, useFocusFirstError, useResultKey } from "./form-fields";

type ServiceFormProps = {
  /** create: a new service with an id to choose; edit: an existing one, whose id stays as it is. */
  mode: "create" | "edit";
  /** The values the form starts with. */
  initial: ServiceFormValues;
  /** The service types with their names in the page's language. */
  categories: readonly { value: string; label: string }[];
};

/**
 * What a service form needs from its Server Action, shared by the /new and /edit pages (ServiceForm)
 * and the list's panels (service-panel.tsx): the answer, the action to post to, whether it is still
 * saving, the form's ref (the cursor goes to the first field to fix), the values to show and each
 * field's message in the page's language. The action checks the role and every field on the server
 * (src/lib/catalog/admin-actions.ts), also when the form goes as a plain post before the page's script
 * has loaded.
 * Sources: node_modules/next/dist/docs/01-app/02-guides/forms.md ("Validation errors", "Pending
 * states") and https://react.dev/reference/react/useActionState
 */
export function useServiceForm(mode: ServiceFormProps["mode"], initial: ServiceFormValues) {
  const t = useTranslations("AdminServiceForm");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(mode === "create" ? createService : updateService, null);
  const form = useFocusFirstError(state);
  const resultKey = useResultKey(state);
  const errors = state?.fieldErrors ?? {};
  const errorCount = Object.keys(errors).length;
  const errorOf = (field: ServiceField) => {
    const key = errors[field];
    return key ? t(`errors.${key}`) : undefined;
  };
  const formMessage = state?.formError
    ? t(`formErrors.${state.formError}`)
    : errorCount > 0
      ? t("errorSummary", { count: errorCount })
      : undefined;
  return {
    t,
    locale,
    formAction,
    pending,
    form,
    resultKey,
    /** What admin typed after a failed save, otherwise the starting values. */
    values: state?.values ?? initial,
    errorOf,
    formMessage,
    /** The last answer was a refusal, so the form must stay in view. */
    failed: Boolean(state?.formError) || errorCount > 0,
  };
}

type SaveButtonProps = {
  pending: boolean;
  label: string;
  pendingLabel: string;
  /** app: the T3b evergreen pill of the /new and /edit pages; panel: the redesign's forest pill. */
  look?: "app" | "panel";
};

const saveLooks = {
  app: "rounded-full bg-brand-600 px-6 text-on-brand hover:bg-brand-700 active:bg-brand-800 aria-disabled:bg-brand-700",
  panel: "rounded-full bg-primary px-6 text-on-primary hover:bg-primary-container active:bg-band aria-disabled:bg-primary-container",
};

// A second click while saving would send the same form again; the button keeps its focus instead of
// being disabled, so a keyboard user stays where they were.
export function SaveButton({ pending, label, pendingLabel, look = "app" }: SaveButtonProps) {
  function holdWhilePending(event: MouseEvent<HTMLButtonElement>) {
    if (pending) event.preventDefault();
  }
  return (
    <button
      type="submit"
      aria-disabled={pending || undefined}
      onClick={holdWhilePending}
      className={`inline-flex min-h-touch items-center justify-center gap-2 text-sm font-semibold whitespace-nowrap transition-[background-color,transform] duration-150 ease-out-quart active:scale-[0.98] aria-disabled:cursor-progress aria-disabled:active:scale-100 ${saveLooks[look]}`}
    >
      {pending ? <LoaderCircle className="size-4.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
      {pending ? pendingLabel : label}
    </button>
  );
}

// Adds or changes one of HomeKlin's services (T7b) on a page of its own (/admin/services/new and
// /edit, until R6 retires them for the list's panels): its id, type and place in the list, its name
// and description in both languages side by side, its one price and duration, and whether customers
// see it. Each problem comes back per field, in the page's language, and the cursor moves to the first
// one. Browser validation is off (noValidate), so every message comes from the server.
export function ServiceForm({ mode, initial, categories }: ServiceFormProps) {
  const { t, locale, formAction, pending, form, resultKey, values, errorOf, formMessage } = useServiceForm(mode, initial);

  return (
    <form
      ref={form}
      action={formAction}
      noValidate
      className="flex w-full max-w-content flex-col rounded-xl border border-border bg-surface"
    >
      <input type="hidden" name="locale" value={locale} />
      {mode === "edit" ? <input type="hidden" name="id" value={initial.id} /> : null}

      <FormSection legend={t("sections.basics")}>
        <div className="grid gap-5 md:grid-cols-2">
          {mode === "create" ? (
            <TextField
              id="service-id"
              name="id"
              label={t("fields.id")}
              hint={t("fields.idHint")}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              defaultValue={values.id}
              error={errorOf("id")}
            />
          ) : (
            <FixedField id="service-id" label={t("fields.id")} value={initial.id} hint={t("fields.idFixed")} />
          )}
          <SelectField
            id="service-category"
            name="category"
            label={t("fields.category")}
            placeholder={t("fields.categoryPlaceholder")}
            options={categories}
            defaultValue={values.category}
            error={errorOf("category")}
          />
        </div>
      </FormSection>

      <FormSection legend={t("sections.texts")} description={t("textsHint")}>
        {/* Two languages side by side from 1024 px. The grid fills column by column, so the tab order
            is Indonesian first, then English, while the two names (and the two descriptions) share a row. */}
        <div className="grid gap-5 lg:grid-flow-col lg:grid-cols-2 lg:grid-rows-[auto_auto] lg:gap-x-8">
          <TextField
            id="service-name-id"
            name="nameId"
            lang="id"
            label={t("fields.nameId")}
            autoComplete="off"
            defaultValue={values.nameId}
            error={errorOf("nameId")}
          />
          <TextAreaField
            id="service-description-id"
            name="descriptionId"
            lang="id"
            label={t("fields.descriptionId")}
            hint={t("fields.descriptionHint")}
            defaultValue={values.descriptionId}
            error={errorOf("descriptionId")}
          />
          <TextField
            id="service-name-en"
            name="nameEn"
            lang="en"
            label={t("fields.nameEn")}
            autoComplete="off"
            defaultValue={values.nameEn}
            error={errorOf("nameEn")}
          />
          <TextAreaField
            id="service-description-en"
            name="descriptionEn"
            lang="en"
            label={t("fields.descriptionEn")}
            hint={t("fields.descriptionHint")}
            defaultValue={values.descriptionEn}
            error={errorOf("descriptionEn")}
          />
        </div>
      </FormSection>

      <FormSection legend={t("sections.pricing")}>
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            id="service-price"
            name="priceIdr"
            label={t("fields.price")}
            hint={t("fields.priceHint")}
            inputMode="numeric"
            autoComplete="off"
            defaultValue={values.priceIdr}
            error={errorOf("priceIdr")}
          />
          <TextField
            id="service-duration"
            name="durationMinutes"
            label={t("fields.duration")}
            hint={t("fields.durationHint")}
            inputMode="numeric"
            autoComplete="off"
            defaultValue={values.durationMinutes}
            error={errorOf("durationMinutes")}
          />
        </div>
      </FormSection>

      {/* Whether customers see the service, and where in the catalog. */}
      <FormSection legend={t("sections.visibility")}>
        <CheckboxField
          id="service-active"
          name="isActive"
          label={t("fields.active")}
          hint={t("fields.activeHint")}
          defaultChecked={values.isActive}
        />
        <div className="md:max-w-xs">
          <TextField
            id="service-sort-order"
            name="sortOrder"
            label={t("fields.sortOrder")}
            hint={t("fields.sortOrderHint")}
            inputMode="numeric"
            autoComplete="off"
            defaultValue={values.sortOrder}
            error={errorOf("sortOrder")}
          />
        </div>
      </FormSection>

      <div className="border-t border-border px-5 pb-6 md:px-8">
        <FormAlert message={formMessage} tone="danger" resultKey={resultKey} />
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <SaveButton
            pending={pending}
            label={t(mode === "create" ? "submitCreate" : "submitEdit")}
            pendingLabel={t("pending")}
          />
          <ButtonLink href="/admin/services" variant="secondary">
            {t("cancel")}
          </ButtonLink>
        </div>
      </div>
    </form>
  );
}
