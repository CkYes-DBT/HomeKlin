"use client";

import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { useResultKey } from "@/components/admin/form-fields";
import { secondaryButton } from "@/components/agency/styles";
import { PasswordField, TextField } from "@/components/auth/form-controls";
import { Link } from "@/i18n/navigation";
import { createAdmin, type OwnerFailureKey } from "@/lib/owner/actions";
import { FormFeedback } from "./form-feedback";
import { OwnerSubmitButton } from "./submit-button";

/** Which field a refusal is about, so it shows under that field. */
const fieldOf: Partial<Record<OwnerFailureKey, string>> = {
  nameInvalid: "admin-nama",
  emailInvalid: "admin-email",
  emailTaken: "admin-email",
  passwordInvalid: "admin-sandi",
};

const adminRefusals = ["notAllowed", "nameInvalid", "emailInvalid", "emailTaken", "passwordInvalid", "adminNotFound"] as const;

/** The refusals createAdmin can give; any other reads as "not saved". */
function adminRefusal(key: OwnerFailureKey): (typeof adminRefusals)[number] | "unavailable" {
  return (adminRefusals as readonly string[]).includes(key) ? (key as (typeof adminRefusals)[number]) : "unavailable";
}

// "Buat akun admin" (T29c; its own page since D3, after the mock Owner-AdminNew): name, email and an
// initial password that can be shown while typing. The owner gives the password to the admin
// privately; the form says so under the field. createAdmin
// checks the owner role on the server and marks the role in app_metadata. The form keeps what was
// typed when the server refuses it, and empties itself once the account exists, saying so with a link
// back to the list.
export function CreateAdminForm() {
  const t = useTranslations("OwnerAdminsPage");
  const [state, formAction, pending] = useActionState(createAdmin, null);
  const [sentEmail, setSentEmail] = useState("");
  const resultKey = useResultKey(state);
  const form = useRef<HTMLFormElement>(null);

  const failure = state?.formError && !pending ? state.formError : null;
  const field = failure ? fieldOf[failure] : undefined;
  const error = failure ? t(`errors.${adminRefusal(failure)}`) : null;
  const errorAt = (id: string) => (field === id ? (error ?? undefined) : undefined);

  useEffect(() => {
    if (state?.ok) form.current?.reset();
    else if (state?.formError && fieldOf[state.formError]) form.current?.querySelector<HTMLElement>(`#${fieldOf[state.formError]}`)?.focus();
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setSentEmail(String(data.get("email") ?? "").trim().toLowerCase());
    startTransition(() => formAction(data));
  }

  const created = state?.ok && !pending;

  return (
    <form ref={form} action={formAction} onSubmit={onSubmit} noValidate aria-labelledby="admin-form-title" className="flex flex-col gap-5">
      <h2 id="admin-form-title" className="sr-only">
        {t("form.submit")}
      </h2>
      <TextField look="panel" id="admin-nama" name="fullName" label={t("form.fullName")} error={errorAt("admin-nama")} maxLength={120} autoComplete="off" required />
      <TextField
        look="panel"
        id="admin-email"
        name="email"
        type="email"
        label={t("form.email")}
        hint={t("form.emailHint")}
        error={errorAt("admin-email")}
        maxLength={254}
        autoComplete="off"
        spellCheck={false}
        required
      />
      <PasswordField
        look="panel"
        id="admin-sandi"
        name="password"
        label={t("form.password")}
        hint={t("form.passwordHint")}
        error={errorAt("admin-sandi")}
        showLabel={t("form.showPassword")}
        autoComplete="new-password"
        minLength={8}
        required
      />
      <div className="flex items-start gap-3 rounded-md bg-lime-wash px-4 py-3 text-sm text-on-lime-wash">
        <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">{t("form.shareTitle")}</p>
          <p className="mt-1">{t("form.shareBody")}</p>
        </div>
      </div>
      <FormFeedback
        error={error}
        errorShownAtField={Boolean(field)}
        done={created ? t("form.done", { email: sentEmail }) : null}
        resultKey={resultKey}
      />
      <div className="flex flex-wrap gap-3">
        <OwnerSubmitButton pending={pending} label={t("form.submit")} pendingLabel={t("form.pending")} />
        <Link href="/owner/admins" className={`${secondaryButton} px-6`}>
          {created ? t("form.toList") : t("form.cancel")}
        </Link>
      </div>
    </form>
  );
}
