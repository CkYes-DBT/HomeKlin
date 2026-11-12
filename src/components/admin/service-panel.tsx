"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FormAlert, TextField } from "@/components/auth/form-controls";
import { Link } from "@/i18n/navigation";
import type { ServiceFormValues } from "@/lib/validation/service";
import { CheckboxField, FixedField, SelectField, TextAreaField } from "./form-fields";
import { SaveButton, useServiceForm } from "./service-form";

type Categories = readonly { value: string; label: string }[];

type PanelProps = {
  /** The values the form starts with: the stored service, or an empty one to add. */
  initial: ServiceFormValues;
  categories: Categories;
  /** The row the panel opens from (rendered on the server): the details' <summary>. */
  summary: ReactNode;
};

// A service's row in admin's list (R4) and the "Layanan baru" panel above it (R5): a native <details>
// whose <summary> is the row and whose panel is the service's form, so the row opens and closes with
// no script at all. Each panel is ONE form posting to the same Server Actions as the /new and /edit
// pages (useServiceForm), with the same field names and hidden fields.
//
// Who decides whether a panel is open: the browser does, as the row is clicked, Enter or Space. React
// only says "open" when the last save was refused, so the messages are in view; it never says
// "closed", so rendering again (a new answer, the list coming back) never shuts a row admin opened.
// A form sent as a plain post (before the page's script has loaded) is still checked on the server and
// nothing invalid is saved, but the page comes back as it was, rows closed and without the messages:
// the role-checked list streams in behind Suspense, and React does not hand that post's answer back
// to the form there (the /new and /edit pages behave the same way).

/**
 * A stored service's row with its edit form. "Batal" closes the row and starts the form over from the
 * saved values with no messages: it draws the row again from scratch (a new key), which also clears
 * the last answer, and puts the cursor back on the row.
 */
export function ServiceEditPanel(props: PanelProps) {
  const [round, setRound] = useState(0);
  return <EditPanel key={round} {...props} returnFocus={round > 0} onCancel={() => setRound(round + 1)} />;
}

function EditPanel({
  initial,
  categories,
  summary,
  returnFocus,
  onCancel,
}: PanelProps & { returnFocus: boolean; onCancel: () => void }) {
  const service = useServiceForm("edit", initial);
  const details = useRef<HTMLDetailsElement>(null);

  // After Batal the row is new, so the cursor goes back to its summary.
  useEffect(() => {
    if (returnFocus) details.current?.querySelector("summary")?.focus();
  }, [returnFocus]);

  function cancel() {
    // The form starts over in the next row (the key changes), so only the row is closed here.
    if (details.current) details.current.open = false;
    onCancel();
  }

  return (
    <details ref={details} className="group" open={service.failed || undefined}>
      {summary}
      <PanelForm
        mode="edit"
        idPrefix={`service-${initial.id}`}
        initial={initial}
        categories={categories}
        service={service}
        cancel={
          <button type="button" onClick={cancel} className={cancelClass}>
            {service.t("cancel")}
          </button>
        }
      />
    </details>
  );
}

/**
 * The empty form to add a service, open at the top of the list at /admin/services?new. Its Batal is a
 * link back to the list, which closes it with or without JavaScript. When it opens, the cursor goes to
 * its first field, so a keyboard user lands in the form.
 */
export function ServiceCreatePanel({ initial, categories, summary }: PanelProps) {
  const service = useServiceForm("create", initial);
  const { form } = service;

  useEffect(() => {
    form.current?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")?.focus();
  }, [form]);

  return (
    <details data-testid="create-panel" className="group" open>
      {summary}
      <PanelForm
        mode="create"
        idPrefix="new-service"
        initial={initial}
        categories={categories}
        service={service}
        cancel={
          <Link href="/admin/services" className={cancelClass}>
            {service.t("cancel")}
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
  /** Makes every field id unique on the page, which holds one form per service. */
  idPrefix: string;
  initial: ServiceFormValues;
  categories: Categories;
  service: ReturnType<typeof useServiceForm>;
  cancel: ReactNode;
};

// The panel's layout, from the user's mock at 1440 px, on the row's open fill: the Indonesian name
// beside the type, the English name beside the id, the two descriptions side by side, then duration,
// price and order in one row, the checkbox, and the buttons at the bottom left. Below 1024 px the
// fields stack (duration, price and order share a row from 768 px). The names and descriptions carry
// their lang, so a screen reader reads each in its own language.
function PanelForm({ mode, idPrefix, initial, categories, service, cancel }: PanelFormProps) {
  const { t, locale, formAction, pending, form, resultKey, values, errorOf, formMessage } = service;
  const id = (field: string) => `${idPrefix}-${field}`;

  return (
    <form
      ref={form}
      action={formAction}
      noValidate
      className="flex flex-col gap-5 bg-field px-4 pt-2 pb-6 md:px-6"
    >
      <input type="hidden" name="locale" value={locale} />
      {mode === "edit" ? <input type="hidden" name="id" value={initial.id} /> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-x-6">
        <TextField
          look="panel"
          id={id("name-id")}
          name="nameId"
          lang="id"
          label={t("fields.nameId")}
          autoComplete="off"
          defaultValue={values.nameId}
          error={errorOf("nameId")}
        />
        <SelectField
          look="panel"
          id={id("category")}
          name="category"
          label={t("fields.category")}
          placeholder={t("fields.categoryPlaceholder")}
          options={categories}
          defaultValue={values.category}
          error={errorOf("category")}
        />
        <TextField
          look="panel"
          id={id("name-en")}
          name="nameEn"
          lang="en"
          label={t("fields.nameEn")}
          autoComplete="off"
          defaultValue={values.nameEn}
          error={errorOf("nameEn")}
        />
        {mode === "create" ? (
          <TextField
            look="panel"
            id={id("id")}
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
          <FixedField look="panel" id={id("id")} label={t("fields.id")} value={initial.id} hint={t("fields.idFixed")} />
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:gap-x-6">
        <TextAreaField
          look="panel"
          id={id("description-id")}
          name="descriptionId"
          lang="id"
          label={t("fields.descriptionId")}
          hint={t("fields.descriptionHint")}
          defaultValue={values.descriptionId}
          error={errorOf("descriptionId")}
        />
        <TextAreaField
          look="panel"
          id={id("description-en")}
          name="descriptionEn"
          lang="en"
          label={t("fields.descriptionEn")}
          hint={t("fields.descriptionHint")}
          defaultValue={values.descriptionEn}
          error={errorOf("descriptionEn")}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-3 md:gap-x-6">
        <TextField
          look="panel"
          id={id("duration")}
          name="durationMinutes"
          label={t("fields.duration")}
          hint={t("fields.durationHint")}
          inputMode="numeric"
          autoComplete="off"
          defaultValue={values.durationMinutes}
          error={errorOf("durationMinutes")}
        />
        <TextField
          look="panel"
          id={id("price")}
          name="priceIdr"
          label={t("fields.price")}
          hint={t("fields.priceHint")}
          inputMode="numeric"
          autoComplete="off"
          defaultValue={values.priceIdr}
          error={errorOf("priceIdr")}
        />
        {/* On a phone the row has no order column, so this is where admin reads it (R3). */}
        <div data-testid="panel-order">
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
      </div>

      <CheckboxField
        look="panel"
        id={id("active")}
        name="isActive"
        label={t("fields.active")}
        hint={t("fields.activeHint")}
        defaultChecked={values.isActive}
      />

      <div>
        <FormAlert message={formMessage} tone="danger" resultKey={resultKey} />
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <SaveButton
            look="panel"
            pending={pending}
            label={t(mode === "create" ? "submitCreate" : "submitEdit")}
            pendingLabel={t("pending")}
          />
          {cancel}
        </div>
      </div>
    </form>
  );
}
