"use client";

import { ArrowRight, CircleAlert, LoaderCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";
import { flowAccentButton, flowInput } from "@/components/customer/flow-styles";
import { openGuestTicket, type GuestFormState } from "@/lib/support/guest-actions";

const minLength = 5;
const maxLength = 1000;

// "Chat dengan admin" for a visitor without an account (B13, D5 mock Customer-Support: "Anda tidak perlu
// masuk akun"): a name, an email if they want a copy of the reply, and the question (carried over from
// the search). openGuestTicket checks every field and the abuse limits on the server, keeps the chat's
// token in an httpOnly cookie and opens the chat (/support?ticket=<id>). A problem shows at its field,
// and what was typed stays.
// Source: node_modules/next/dist/docs/01-app/02-guides/forms.md ("Validation errors", "Pending states")
export function GuestTicketForm({ initialQuestion }: { initialQuestion: string }) {
  const t = useTranslations("SupportGuestForm");
  const tErrors = useTranslations("SupportChat");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<GuestFormState, FormData>(openGuestTicket, null);
  const [tooShort, setTooShort] = useState(false);
  // Counts the sends, so the same refusal twice is announced twice.
  const [sends, setSends] = useState(0);
  const form = useRef<HTMLFormElement>(null);

  const refusal = !pending ? state?.formError : undefined;
  const fieldError = (field: "nameInvalid" | "emailInvalid" | "questionInvalid") =>
    field === "questionInvalid" && tooShort ? t("tooShort") : refusal === field ? tErrors(`errors.${field}`) : null;
  const formError =
    refusal && refusal !== "nameInvalid" && refusal !== "emailInvalid" && refusal !== "questionInvalid" ? tErrors(`errors.${refusal}`) : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setSends((count) => count + 1);
    const data = new FormData(event.currentTarget);
    if (String(data.get("question") ?? "").trim().length < minLength) {
      setTooShort(true);
      form.current?.querySelector<HTMLElement>("#tamu-pertanyaan")?.focus();
      return;
    }
    setTooShort(false);
    startTransition(() => formAction(data));
  }

  const field = (id: string, error: string | null, hint?: string) => ({
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined,
  });
  const errorLine = (id: string, error: string | null) =>
    error ? (
      <p key={sends} id={`${id}-error`} className="flex items-start gap-1.5 text-sm font-medium text-danger">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{error}</span>
      </p>
    ) : null;

  const nameError = fieldError("nameInvalid");
  const emailError = fieldError("emailInvalid");
  const questionError = fieldError("questionInvalid");

  return (
    <form ref={form} action={formAction} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tamu-nama" className="text-xs font-medium text-ink-muted">
          {t("name")}
        </label>
        <input {...field("tamu-nama", nameError)} name="name" autoComplete="name" maxLength={80} className={`${flowInput} h-12`} />
        {errorLine("tamu-nama", nameError)}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tamu-email" className="text-xs font-medium text-ink-muted">
          {t("email")}
        </label>
        <input
          {...field("tamu-email", emailError, t("emailHint"))}
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          className={`${flowInput} h-12`}
        />
        <p id="tamu-email-hint" className="text-sm text-ink-muted">
          {t("emailHint")}
        </p>
        {errorLine("tamu-email", emailError)}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tamu-pertanyaan" className="text-xs font-medium text-ink-muted">
          {t("question")}
        </label>
        <textarea
          {...field("tamu-pertanyaan", questionError)}
          name="question"
          rows={4}
          maxLength={maxLength}
          defaultValue={initialQuestion.slice(0, maxLength)}
          onChange={() => tooShort && setTooShort(false)}
          className={`${flowInput} min-h-28 resize-y py-3`}
        />
        {errorLine("tamu-pertanyaan", questionError)}
      </div>
      <div role="alert" aria-atomic="true">
        {formError ? (
          <p key={sends} className="flex items-start gap-2.5 rounded-sm bg-danger-surface px-4 py-3 text-sm font-medium text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{formError}</span>
          </p>
        ) : null}
      </div>
      <button type="submit" disabled={pending} className={`${flowAccentButton} w-full sm:w-fit ${pending ? "cursor-progress" : ""}`}>
        {pending ? <LoaderCircle className="size-5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
        {pending ? t("pending") : t("submit")}
        {pending ? null : <ArrowRight className="size-5 shrink-0" aria-hidden="true" />}
      </button>
    </form>
  );
}
