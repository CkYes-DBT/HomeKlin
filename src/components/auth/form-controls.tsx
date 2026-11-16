"use client";

import { ArrowRight, CircleAlert, Eye, EyeOff, Info, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import type { AuthFormState } from "@/lib/auth/actions";

// The pieces of the sign-in and sign-up forms (T3b app look: pill inputs on 16 px text, so phones
// never zoom in; an evergreen submit button). Errors come from the server (src/lib/auth/actions.ts),
// in the visitor's language, and are tied to their field: aria-invalid plus aria-describedby, so a
// screen reader reads the problem together with the field.

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> & {
  id: string;
  label: string;
  /** Shown under the field at all times, e.g. the password rule. */
  hint?: string;
  /** The problem to fix, in words; the field is marked invalid while there is one. */
  error?: string;
  /**
   * app (default): the T3b pill of the sign-in and customer forms. panel: the redesign's back-office
   * input (markdown/design.md, Forms) for admin's in-list panels: 44 px, small radius, white on the
   * panel's fill, a 12 px label above. Opt-in, so the customer forms keep their look. forest: the
   * sign-in card (the SignIn mocks): 48 px, small radius, the field fill inside the white card.
   */
  look?: "app" | "panel" | "forest";
};

const inputClass =
  "h-12 w-full rounded-full border border-border-control bg-surface px-5 text-base text-ink caret-brand-700 transition-colors duration-150 ease-out-quart placeholder:text-ink-faint hover:border-brand-600 aria-invalid:border-danger aria-invalid:bg-danger-surface disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-sunken";

/** The redesign's input, its label and its notes (look="panel"). */
export const panelLook = {
  field: "flex flex-col gap-1.5",
  label: "text-xs font-semibold text-ink",
  input:
    "h-11 w-full rounded-sm border border-border-control bg-card px-3.5 text-base text-ink caret-primary transition-colors duration-150 ease-out-quart placeholder:text-ink-muted hover:border-primary aria-invalid:border-danger aria-invalid:bg-danger-surface disabled:cursor-not-allowed disabled:border-border disabled:bg-sunken lg:text-sm",
  hint: "text-xs text-ink-muted",
  error: "flex items-start gap-1.5 text-sm font-medium text-danger",
};

/** The T3b app look of a field (sign-in, customer forms; agency slots and reviews via admin/form-fields). */
export const appLook = {
  field: "flex flex-col gap-2",
  label: "px-1 text-sm font-medium text-ink",
  input: inputClass,
  hint: "px-1 text-sm text-ink-faint",
  error: "flex items-start gap-1.5 px-1 text-sm font-medium text-danger",
};

/** The sign-in card's field (look="forest", inside `theme-forest`): 48 px, 8 px radius, filled, edged in the control colour. */
export const forestLook = {
  field: "flex flex-col gap-1.5",
  label: "text-sm font-semibold text-ink",
  input:
    "h-12 w-full rounded-sm bg-field px-3.5 text-base text-ink caret-primary inset-ring-1 inset-ring-border-control transition-shadow duration-150 ease-out-quart placeholder:text-ink-muted hover:inset-ring-primary aria-invalid:bg-danger-surface aria-invalid:inset-ring-2 aria-invalid:inset-ring-danger disabled:cursor-not-allowed disabled:bg-sunken disabled:inset-ring-border",
  hint: "text-sm text-ink-muted",
  error: "flex items-start gap-1.5 text-sm font-medium text-danger",
};

const looks = { app: appLook, panel: panelLook, forest: forestLook } as const;

/** The ids under a field (hint, then error), for its aria-describedby. */
function notesFor(id: string, hint?: string, error?: string) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return { hintId, errorId, describedBy };
}

type FieldNotesProps = { hint?: string; hintId?: string; error?: string; errorId?: string; look?: typeof appLook };

function FieldNotes({ hint, hintId, error, errorId, look = appLook }: FieldNotesProps) {
  return (
    <>
      {hint ? (
        <p id={hintId} className={look.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={look.error}>
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </>
  );
}

export function TextField({ id, label, hint, error, look: lookName = "app", ...input }: FieldProps) {
  const notes = notesFor(id, hint, error);
  const look = looks[lookName];
  return (
    <div className={look.field}>
      <label htmlFor={id} className={look.label}>
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={notes.describedBy}
        className={look.input}
        {...input}
      />
      <FieldNotes hint={hint} error={error} look={look} {...notes} />
    </div>
  );
}

type PasswordFieldProps = Omit<FieldProps, "type"> & {
  /** The show-password button's name. It stays the same; aria-pressed says whether the password shows. */
  showLabel: string;
};

// On a phone a mistyped password is the most common reason a sign-in fails, so the password can be
// shown. The button sits inside the field, a full 44 px target, and never submits the form.
// look="panel": the redesign's back-office input (the owner's "Buat akun admin", D3); look="forest":
// the sign-in card, with the same square-cornered show button.
export function PasswordField({ id, label, hint, error, showLabel, look: lookName = "app", ...input }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const notes = notesFor(id, hint, error);
  const panel = lookName === "panel" || lookName === "forest";
  const look = looks[lookName];
  return (
    <div className={look.field}>
      <label htmlFor={id} className={look.label}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={notes.describedBy}
          className={`${look.input} ${panel ? "pr-12" : "pr-14"}`}
          {...input}
        />
        <button
          type="button"
          aria-label={showLabel}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((shown) => !shown)}
          className={
            panel
              ? "absolute top-1/2 right-0 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-sm text-ink-muted transition-colors duration-150 ease-out-quart hover:bg-sunken hover:text-ink active:bg-lime-wash"
              : "absolute top-1/2 right-0.5 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted transition-colors duration-150 ease-out-quart hover:bg-surface-sunken hover:text-ink active:bg-brand-100"
          }
        >
          {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
        </button>
      </div>
      <FieldNotes hint={hint} error={error} look={look} {...notes} />
    </div>
  );
}

type SubmitButtonProps = {
  pending: boolean;
  label: string;
  /** Said while the server works ("Sedang masuk…"), next to a spinner. */
  pendingLabel: string;
  /** forest: the sign-in card's dark pill with the lime arrow circle (the SignIn mocks). */
  tone?: "app" | "forest";
};

/** The sign-in card's submit pill: full width, 52 px, the label on the left, a lime circle with the arrow on the right. */
export const forestSubmitClass =
  "inline-flex h-13 w-full items-center justify-between gap-3 rounded-full bg-primary pr-2 pl-6 text-base font-semibold text-on-primary transition-[background-color,transform] duration-150 ease-out-quart hover:bg-primary-container active:scale-[0.98] active:bg-band disabled:cursor-progress disabled:bg-primary-container disabled:active:scale-100 motion-reduce:active:scale-100";

/** The label and the lime circle inside the forest submit pill; the circle holds a spinner while the server works. */
export function ForestSubmitContent({ pending, label, pendingLabel }: Omit<SubmitButtonProps, "tone">) {
  return (
    <>
      <span className="min-w-0 text-left">{pending ? pendingLabel : label}</span>
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-lime text-on-lime">
        {pending ? (
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <ArrowRight className="size-4" strokeWidth={2.4} />
        )}
      </span>
    </>
  );
}

// Disabled while the request runs, so a double tap sends one request.
export function SubmitButton({ pending, label, pendingLabel, tone = "app" }: SubmitButtonProps) {
  if (tone === "forest") {
    return (
      <button type="submit" disabled={pending} className={`mt-6 ${forestSubmitClass}`}>
        <ForestSubmitContent pending={pending} label={label} pendingLabel={pendingLabel} />
      </button>
    );
  }
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-6 text-base font-semibold text-on-brand transition-[background-color,transform] duration-150 ease-out-quart hover:bg-brand-700 active:scale-[0.98] active:bg-brand-800 disabled:cursor-progress disabled:bg-brand-700 disabled:active:scale-100"
    >
      {pending ? <LoaderCircle className="size-5 shrink-0 animate-spin" aria-hidden="true" /> : null}
      {pending ? pendingLabel : label}
    </button>
  );
}

type FormAlertProps = {
  /** The form-level message, or nothing. */
  message?: string;
  /** danger for a failed attempt; info for news that is not a mistake ("check your inbox"). */
  tone: "danger" | "info";
  /** Changes with every answer from the server (useResultKey). */
  resultKey: number;
};

const alertTones = {
  danger: { box: "bg-danger-surface text-danger", Icon: CircleAlert },
  info: { box: "bg-info-surface text-info", Icon: Info },
};

// The form's own message in a live region that is always on the page, so a screen reader announces
// what is put into it. The message is drawn anew for every answer (its key), so the same mistake made
// twice is announced twice instead of looking as if nothing happened.
export function FormAlert({ message, tone, resultKey }: FormAlertProps) {
  const { box, Icon } = alertTones[tone];
  return (
    <div role="alert" aria-atomic="true">
      {message ? (
        <p key={resultKey} className={`mt-6 flex items-start gap-2.5 rounded-md px-4 py-3 text-sm font-medium ${box}`}>
          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  );
}

/** A number that changes whenever the server answers, even with the same answer as before. */
export function useResultKey(state: AuthFormState): number {
  // Storing what the last render saw is React's documented way to react to a changed value during
  // rendering: https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [seen, setSeen] = useState(state);
  const [count, setCount] = useState(0);
  if (state !== seen) {
    setSeen(state);
    setCount(count + 1);
  }
  return count;
}

/** After an answer with field errors, puts the cursor in the first field to fix. */
export function useFocusFirstError(state: AuthFormState) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state?.fieldErrors || Object.keys(state.fieldErrors).length === 0) return;
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);
  return form;
}
