"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FormAlert, TextField } from "@/components/auth/form-controls";
import { Link } from "@/i18n/navigation";
import { createFaq, updateFaq } from "@/lib/support/faq-actions";
import type { FaqField, FaqFormValues } from "@/lib/validation/faq";
import { CheckboxField, TextAreaField, useFocusFirstError, useResultKey } from "./form-fields";
import { SaveButton } from "./service-form";

type PanelProps = {
  /** The values the form starts with: the stored entry, or an empty one to add. */
  initial: FaqFormValues;
  /** The row the panel opens from (rendered on the server): the details' <summary>. */
  summary: ReactNode;
};

// An FAQ entry's row in admin's list and the "Pertanyaan baru" panel above it (D1, the user's mock
// "Admin-Faq"), as the services list does it (service-panel.tsx): a native <details> whose <summary> is
// the row and whose panel is the entry's one form, posting to createFaq or updateFaq, which check the
// role and every field on the server. React only says "open" when the last save was refused, so the
// messages stay in view; a save that goes through comes back as a new server render, which draws every
// panel anew (closed, on the stored values).

function useFaqForm(mode: "create" | "edit", initial: FaqFormValues) {
  const t = useTranslations("AdminFaqForm");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(mode === "create" ? createFaq : updateFaq, null);
  const form = useFocusFirstError(state);
  const resultKey = useResultKey(state);
  const errors = state?.fieldErrors ?? {};
  const errorCount = Object.keys(errors).length;
  const errorOf = (field: FaqField) => {
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
    values: state?.values ?? initial,
    errorOf,
    formMessage,
    failed: Boolean(state?.formError) || errorCount > 0,
  };
}

/** A stored entry's row with its edit form. "Batal" closes the row and starts the form over. */
export function FaqEditPanel(props: PanelProps) {
  const [round, setRound] = useState(0);
  return <EditPanel key={round} {...props} returnFocus={round > 0} onCancel={() => setRound(round + 1)} />;
}

function EditPanel({ initial, summary, returnFocus, onCancel }: PanelProps & { returnFocus: boolean; onCancel: () => void }) {
  const faq = useFaqForm("edit", initial);
  const details = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (returnFocus) details.current?.querySelector("summary")?.focus();
  }, [returnFocus]);

  function cancel() {
    if (details.current) details.current.open = false;
    onCancel();
  }

  return (
    <details ref={details} className="group" open={faq.failed || undefined}>
      {summary}
      <PanelForm
        mode="edit"
        initial={initial}
        faq={faq}
        cancel={
          <button type="button" onClick={cancel} className={cancelClass}>
            {faq.t("cancel")}
          </button>
        }
      />
    </details>
  );
}

/** The empty form to add an entry, open at the top of the list at /admin/faq?new; Batal is a link back. */
export function FaqCreatePanel({ initial, summary, heading }: PanelProps & { heading: ReactNode }) {
  const faq = useFaqForm("create", initial);
  const { form } = faq;

  useEffect(() => {
    form.current?.querySelector<HTMLElement>("input:not([type=hidden]), textarea")?.focus();
  }, [form]);

  return (
    <details data-testid="faq-create-panel" className="group" open>
      {summary}
      <PanelForm
        mode="create"
        heading={heading}
        initial={initial}
        faq={faq}
        cancel={
          <Link href="/admin/faq" className={cancelClass}>
            {faq.t("cancel")}
          </Link>
        }
      />
    </details>
  );
}

/** The outline pill (markdown/design.md, Buttons): transparent, a 1.5 px forest edge. */
const cancelClass =
  "inline-flex min-h-touch items-center justify-center rounded-full border-[1.5px] border-outline px-6 text-sm font-semibold whitespace-nowrap text-ink transition-[background-color,transform] duration-150 ease-out-quart hover:bg-card active:scale-[0.98] active:bg-sunken";

type PanelFormProps = {
  mode: "create" | "edit";
  heading?: ReactNode;
  initial: FaqFormValues;
  faq: ReturnType<typeof useFaqForm>;
  cancel: ReactNode;
};

// The panel's layout, from the user's mock at 1440 px: the two questions side by side, the two answers
// side by side, the keywords beside the order, the checkbox, and the buttons at the bottom left. Below
// 1024 px the fields stack. Each text carries its lang, so a screen reader reads it in its language.
function PanelForm({ mode, heading, initial, faq, cancel }: PanelFormProps) {
  const { t, locale, formAction, pending, form, resultKey, values, errorOf, formMessage } = faq;
  const formId = useId();
  const id = (field: string) => `${formId}-${field}`;

  return (
    <form ref={form} action={formAction} noValidate className="flex flex-col gap-5 bg-field px-4 pt-2 pb-6 md:px-6">
      {heading}
      <input type="hidden" name="locale" value={locale} />
      {mode === "edit" ? <input type="hidden" name="id" value={initial.id} /> : null}

      <div className="grid gap-5 lg:grid-cols-2 lg:gap-x-6">
        <TextField
          look="panel"
          id={id("question-id")}
          name="questionId"
          lang="id"
          label={t("fields.questionId")}
          placeholder={t("fields.questionIdPlaceholder")}
          autoComplete="off"
          defaultValue={values.questionId}
          error={errorOf("questionId")}
        />
        <TextField
          look="panel"
          id={id("question-en")}
          name="questionEn"
          lang="en"
          label={t("fields.questionEn")}
          placeholder={t("fields.questionEnPlaceholder")}
          autoComplete="off"
          defaultValue={values.questionEn}
          error={errorOf("questionEn")}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:gap-x-6">
        <TextAreaField
          look="panel"
          id={id("answer-id")}
          name="answerId"
          lang="id"
          rows={4}
          label={t("fields.answerId")}
          placeholder={t("fields.answerIdPlaceholder")}
          defaultValue={values.answerId}
          error={errorOf("answerId")}
        />
        <TextAreaField
          look="panel"
          id={id("answer-en")}
          name="answerEn"
          lang="en"
          rows={4}
          label={t("fields.answerEn")}
          placeholder={t("fields.answerEnPlaceholder")}
          defaultValue={values.answerEn}
          error={errorOf("answerEn")}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:gap-x-6">
        <TextField
          look="panel"
          id={id("keywords")}
          name="keywords"
          label={t("fields.keywords")}
          hint={t("fields.keywordsHint")}
          placeholder={t("fields.keywordsPlaceholder")}
          autoComplete="off"
          defaultValue={values.keywords}
          error={errorOf("keywords")}
        />
        <TextField
          look="panel"
          id={id("sort-order")}
          name="sortOrder"
          label={t("fields.sortOrder")}
          hint={t("fields.sortOrderHint")}
          inputMode="numeric"
          autoComplete="off"
          defaultValue={values.sortOrder}
          error={errorOf("sortOrder")}
        />
      </div>

      <CheckboxField id={id("published")} name="isPublished" label={t("fields.published")} hint={t("fields.publishedHint")} defaultChecked={values.isPublished} />

      <div>
        <FormAlert message={formMessage} tone="danger" resultKey={resultKey} />
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <SaveButton pending={pending} label={t(mode === "create" ? "submitCreate" : "submitEdit")} pendingLabel={t("pending")} />
          {cancel}
        </div>
      </div>
    </form>
  );
}
