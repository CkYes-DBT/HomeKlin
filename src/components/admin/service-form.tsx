"use client";

import { LoaderCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, type MouseEvent } from "react";
import { createService, updateService } from "@/lib/catalog/admin-actions";
import type { ServiceField, ServiceFormValues } from "@/lib/validation/service";
import { useFocusFirstError, useResultKey } from "./form-fields";

/** create: a new service with an id to choose; edit: an existing one, whose id stays as it is. */
type ServiceFormMode = "create" | "edit";

/**
 * What a service form needs from its Server Action, shared by the list's edit and create panels
 * (service-panel.tsx): the answer, the action to post to, whether it is still
 * saving, the form's ref (the cursor goes to the first field to fix), the values to show and each
 * field's message in the page's language. The action checks the role and every field on the server
 * (src/lib/catalog/admin-actions.ts), also when the form goes as a plain post before the page's script
 * has loaded.
 * Sources: node_modules/next/dist/docs/01-app/02-guides/forms.md ("Validation errors", "Pending
 * states") and https://react.dev/reference/react/useActionState
 */
export function useServiceForm(mode: ServiceFormMode, initial: ServiceFormValues) {
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
};

// The panels' save button, the redesign's forest pill (markdown/design.md, Buttons). A second click
// while saving would send the same form again; the button keeps its focus instead of being disabled,
// so a keyboard user stays where they were.
export function SaveButton({ pending, label, pendingLabel }: SaveButtonProps) {
  function holdWhilePending(event: MouseEvent<HTMLButtonElement>) {
    if (pending) event.preventDefault();
  }
  return (
    <button
      type="submit"
      aria-disabled={pending || undefined}
      onClick={holdWhilePending}
      className="inline-flex min-h-touch items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold whitespace-nowrap text-on-primary transition-[background-color,transform] duration-150 ease-out-quart hover:bg-primary-container active:scale-[0.98] active:bg-band aria-disabled:cursor-progress aria-disabled:bg-primary-container aria-disabled:active:scale-100"
    >
      {pending ? <LoaderCircle className="size-4.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
      {pending ? pendingLabel : label}
    </button>
  );
}
