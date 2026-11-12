"use client";

import { Check, ChevronDown, CircleAlert } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { panelLook } from "@/components/auth/form-controls";

// The back-office form controls that src/components/auth/form-controls.tsx does not have: a select, a
// multi-line text field, a checkbox and a value that cannot be changed. They look like its TextField
// (T3b app look: 16 px text so phones never zoom, a border-control edge, a danger edge and fill on an
// error) and tie their hint and error to the control with aria-describedby, so a screen reader reads
// the problem together with the field. look="panel" gives each the redesign's back-office input
// instead (markdown/design.md, Forms), for admin's in-list panels (R4).

type Notes = { hint?: string; error?: string };

/** app: the T3b look of the /new and /edit pages; panel: the redesign (R4). */
type Look = "app" | "panel";

const appLook = {
  field: "flex flex-col gap-2",
  label: "px-1 text-sm font-medium text-ink",
  hint: "px-1 text-sm text-ink-faint",
  error: "flex items-start gap-1.5 px-1 text-sm font-medium text-danger",
};

const looks = { app: appLook, panel: panelLook };

/** The ids under a field (hint, then error), for its aria-describedby. */
function notesFor(id: string, { hint, error }: Notes) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return { hintId, errorId, describedBy: [hintId, errorId].filter(Boolean).join(" ") || undefined };
}

function FieldNotes({ id, hint, error, look = "app" }: Notes & { id: string; look?: Look }) {
  const { hintId, errorId } = notesFor(id, { hint, error });
  return (
    <>
      {hint ? (
        <p id={hintId} className={looks[look].hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={looks[look].error}>
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </>
  );
}

function Label({ htmlFor, look = "app", children }: { htmlFor: string; look?: Look; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className={looks[look].label}>
      {children}
    </label>
  );
}

const controlEdge =
  "border border-border-control bg-surface text-base text-ink transition-colors duration-150 ease-out-quart hover:border-brand-600 aria-invalid:border-danger aria-invalid:bg-danger-surface disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-sunken";

/** The redesign's control edge: white on the panel's fill, a forest edge on hover. 16 px text on phones. */
const panelEdge =
  "border border-border-control bg-card text-base text-ink transition-colors duration-150 ease-out-quart hover:border-primary aria-invalid:border-danger aria-invalid:bg-danger-surface disabled:cursor-not-allowed disabled:border-border disabled:bg-sunken lg:text-sm";

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "className" | "children"> &
  Notes & {
    id: string;
    label: string;
    look?: Look;
    /** Shown while nothing is chosen; it cannot be chosen back. */
    placeholder: string;
    options: readonly { value: string; label: string }[];
  };

// A native select, so the keyboard, the phone's picker and screen readers work as people expect.
export function SelectField({ id, label, hint, error, placeholder, options, look = "app", ...select }: SelectFieldProps) {
  const { describedBy } = notesFor(id, { hint, error });
  const shape = look === "panel" ? `h-11 rounded-sm pr-11 pl-3.5 ${panelEdge}` : `h-12 rounded-full pr-12 pl-5 ${controlEdge}`;
  return (
    <div className={looks[look].field}>
      <Label htmlFor={id} look={look}>
        {label}
      </Label>
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full cursor-pointer appearance-none ${shape}`}
          {...select}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className={`pointer-events-none absolute top-1/2 size-5 -translate-y-1/2 text-ink-muted ${look === "panel" ? "right-3" : "right-4"}`}
          aria-hidden="true"
        />
      </div>
      <FieldNotes id={id} hint={hint} error={error} look={look} />
    </div>
  );
}

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "className"> &
  Notes & { id: string; label: string; look?: Look };

export function TextAreaField({ id, label, hint, error, rows = 3, look = "app", ...textarea }: TextAreaFieldProps) {
  const { describedBy } = notesFor(id, { hint, error });
  const shape =
    look === "panel"
      ? `min-h-24 rounded-sm px-3.5 py-2.5 caret-primary placeholder:text-ink-muted ${panelEdge}`
      : `min-h-28 rounded-xl px-5 py-3 caret-brand-700 placeholder:text-ink-faint ${controlEdge}`;
  return (
    <div className={looks[look].field}>
      <Label htmlFor={id} look={look}>
        {label}
      </Label>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`w-full resize-y ${shape}`}
        {...textarea}
      />
      <FieldNotes id={id} hint={hint} error={error} look={look} />
    </div>
  );
}

type CheckboxFieldProps = { id: string; name: string; label: string; hint?: string; defaultChecked: boolean; look?: Look };

const checkboxLooks = {
  app: {
    row: "hover:bg-surface-sunken",
    box: "bg-surface group-hover:border-brand-600 checked:border-brand-600 checked:bg-brand-600",
    tick: "text-on-brand",
    text: "text-base font-medium text-ink",
  },
  // The box sits on the panel's fill, so it is white; ticked, it is forest green.
  panel: {
    row: "hover:bg-sunken",
    box: "bg-card group-hover:border-primary checked:border-primary checked:bg-primary",
    tick: "text-on-primary",
    text: "text-sm font-semibold text-ink",
  },
};

// A 24 px box inside a label that is at least 44 px tall, so the whole line is the target.
export function CheckboxField({ id, name, label, hint, defaultChecked, look = "app" }: CheckboxFieldProps) {
  const { describedBy } = notesFor(id, { hint });
  const styles = checkboxLooks[look];
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className={`group flex min-h-touch w-fit cursor-pointer items-center gap-3 rounded-full py-1 pr-4 pl-1 transition-colors duration-150 ease-out-quart ${styles.row}`}
      >
        <span className="relative flex size-6 shrink-0 items-center justify-center">
          <input
            id={id}
            name={name}
            type="checkbox"
            defaultChecked={defaultChecked}
            aria-describedby={describedBy}
            className={`peer size-6 cursor-pointer appearance-none rounded-sm border border-border-control transition-colors duration-150 ease-out-quart ${styles.box}`}
          />
          <Check
            className={`pointer-events-none absolute size-4 opacity-0 peer-checked:opacity-100 ${styles.tick}`}
            strokeWidth={3}
            aria-hidden="true"
          />
        </span>
        <span className={styles.text}>{label}</span>
      </label>
      <FieldNotes id={id} hint={hint} look={look} />
    </div>
  );
}

type FixedFieldProps = { id: string; label: string; value: string; hint: string; look?: Look };

/**
 * A value that cannot be changed (the id of a saved service): a read-only field, so it keeps its label
 * and a screen reader says it is read-only. It has no name, so it is not sent; the form carries the
 * value in a hidden field of its own.
 */
export function FixedField({ id, label, value, hint, look = "app" }: FixedFieldProps) {
  const { describedBy } = notesFor(id, { hint });
  const shape =
    look === "panel"
      ? "h-11 rounded-sm border border-border bg-sunken px-3.5"
      : "h-12 rounded-full border border-border bg-surface-sunken px-5";
  return (
    <div className={looks[look].field}>
      <Label htmlFor={id} look={look}>
        {label}
      </Label>
      <input
        id={id}
        type="text"
        readOnly
        value={value}
        aria-describedby={describedBy}
        className={`w-full cursor-default font-mono text-sm text-ink ${shape}`}
      />
      <FieldNotes id={id} hint={hint} look={look} />
    </div>
  );
}

type FormSectionProps = { legend: string; description?: string; children: ReactNode };

/**
 * A group of fields with its name, separated from the group above by a line. The legend floats, which
 * takes it out of the fieldset's border (where browsers draw a legend) and lets it sit like a heading.
 */
export function FormSection({ legend, description, children }: FormSectionProps) {
  return (
    <fieldset className="min-w-0 border-t border-border px-5 py-6 first-of-type:border-t-0 md:px-8">
      <legend className="float-left w-full font-display text-lg font-semibold text-ink">{legend}</legend>
      <div className={`clear-both flex flex-col gap-5 ${description ? "pt-1" : "pt-4"}`}>
        {description ? <p className="max-w-prose text-sm text-ink-muted">{description}</p> : null}
        {children}
      </div>
    </fieldset>
  );
}

/** A number that changes whenever the server answers, even with the same answer as before. */
export function useResultKey(state: unknown): number {
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
export function useFocusFirstError(state: { fieldErrors?: object } | null) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state?.fieldErrors || Object.keys(state.fieldErrors).length === 0) return;
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);
  return form;
}
