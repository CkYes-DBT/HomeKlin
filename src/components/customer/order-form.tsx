"use client";

import { ArrowRight, ChevronDown, CircleAlert, LoaderCircle, Mail, UserRoundCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { CodeEntry } from "@/components/auth/code-entry";
import { Link } from "@/i18n/navigation";
import { bookService, placeOrder, sendOrderCode, type BookingFormState } from "@/lib/booking/actions";
import { BookingBar } from "./booking-bar";
import { ConsentSwitch, FieldError, OrderField, orderInputClass } from "./booking-controls";
import { chosenWindow, markTaken, type BookingDay } from "./booking-days";
import { flowCard, flowCardTitle, flowNote, flowNoteIcon, flowPrimaryButton, flowTextLink } from "./flow-styles";
import { draftFromForm, restoreOrderDraft, saveOrderDraft } from "./order-draft";
import { OrderWhere } from "./order-where";
import { orderSearch } from "./order-query";
import { intentFor, viewAfter, type OrderIntent, type OrderView } from "./order-steps";

/** An area as the order form shows it; days is null when its windows could not be read. */
export type OrderArea = { id: string; name: string; served: boolean; days: BookingDay[] | null };

type OrderFormProps = {
  services: { id: string; name: string; price: string; duration: string }[];
  /** Each service at a glance, rendered on the server. */
  summaries: Record<string, ReactNode>;
  areas: OrderArea[];
  /** The service from the address, or null to make the customer choose one. */
  initialServiceId: string | null;
  /** The address named a service that cannot be ordered. */
  serviceUnknown: boolean;
  initialAreaId: string;
  /** The window from the address when it is still free; null makes the customer choose one. */
  initialStartsAt: string | null;
  /** The address carries a valid service, a served area and a free window (from step 1). */
  fixedChoice: boolean;
  /** Said when the window in the address is gone. */
  takenNotice: string | null;
  lookAheadDays: number;
  /** The signed-in customer (name, or email for an account without a name), or null for a guest. */
  customer: { name: string } | null;
};

type Answer = { intent: OrderIntent; state: BookingFormState } | null;

const actions = { send: sendOrderCode, resend: sendOrderCode, place: placeOrder, book: bookService } as const;

/** Calls the action of the button that sent the form; each one parses its input on the server. */
async function run(_previous: Answer, data: FormData): Promise<Answer> {
  const name = data.get("intent");
  const intent: OrderIntent = name === "resend" || name === "place" || name === "book" ? name : "send";
  return { intent, state: await actions[intent](null, data) };
}

const card = flowCard;
const sectionTitle = flowCardTitle;
const formId = "booking-form";
const submitId = "booking-submit";
const consentId = "booking-consent";

/** Most a note for the Petugas may hold (B7, orders.customer_note). */
const noteMax = 300;

/** The tab's sessionStorage, or null where the browser blocks it. */
function tabStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

// The order form (T9b): one calm flow on one page, for guests and signed-in customers alike. The
// service, the area and its free arrival windows, the address, the streaming consent, the phone number
// (the cleaner's contact on the day) and the email for a guest; then "Kirim kode" for a guest
// (sendOrderCode emails a 6-digit code) or "Lanjut ke pembayaran" for a signed-in customer
// (bookService). The code step replaces the form on the same page; every field stays in the form,
// hidden, so the button there sends the whole order with the code (placeOrder), and "Ganti email"
// brings the form back as it was. When the code was right but the order failed (the window was taken
// in the meantime), the guest is signed in now: the form says what happened and finishes with
// bookService. Every choice is checked again on the server. The form is sent from onSubmit inside a
// transition, so React does not reset it after an answer.
// Since the booking-flow fixes (2026-11-16):
// - A valid choice from step 1 shows as one read-only card, "Layanan dan jadwal", with "Ubah" back to
//   step 1; the pickers show only when the choice is missing or no longer free. "Ubah" keeps what was
//   typed in this tab (./order-draft.ts), and step 2 fills it in again when it opens.
// - The button is never disabled for the consent: pressed without it, the server's answer marks the
//   switch and the cursor goes there (the first field to fix, in page order); the hint under the
//   button links to the switch.
// - A new service on the pickers reloads this content with that service in the address, so its own
//   times follow (B12); the typed fields and the choice stay, since only the props change.
// - On phones a bar above the bottom navigation carries the choice, the price and the button.
// Sources: node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md ("Event
// Handlers"), node_modules/next/dist/docs/01-app/02-guides/forms.md ("Validation errors", "Pending
// states"), node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md and
// https://react.dev/reference/react/useActionState
export function OrderForm(props: OrderFormProps) {
  const { services, summaries, areas, customer } = props;
  const t = useTranslations("Booking");
  const tOrder = useTranslations("Order");
  const locale = useLocale();
  const router = useRouter();
  const [answer, dispatch, pending] = useActionState(run, null);
  const [loadingWindows, startLoadingWindows] = useTransition();
  const [serviceId, setServiceId] = useState(props.initialServiceId ?? "");
  const [areaId, setAreaId] = useState(props.initialAreaId);
  const [startsAt, setStartsAt] = useState(props.initialStartsAt);
  const [picking, setPicking] = useState(!props.fixedChoice);
  const [consent, setConsent] = useState(false);
  const [taken, setTaken] = useState<readonly string[]>([]);
  // The day of the window just taken, so the pickers open on it with what is left.
  const [takenDate, setTakenDate] = useState<string | null>(null);
  const [view, setView] = useState<OrderView>({ step: "form", signedIn: false });
  const [intent, setIntent] = useState<OrderIntent>("send");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState(0);
  const [sent, setSent] = useState(0);
  const [edits, setEdits] = useState(0);
  const [noteLength, setNoteLength] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const windowAlert = useRef<HTMLDivElement>(null);

  // A guest who typed the right code is signed in, whether the page knows it yet or not.
  const signedIn = view.signedIn || customer !== null;
  const current: OrderView = signedIn ? { step: "form", signedIn: true } : view;
  const state = answer?.state ?? null;

  // Each answer from the server, handled once while rendering
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  const [seen, setSeen] = useState(answer);
  if (answer !== seen) {
    setSeen(answer);
    setAnswers(answers + 1);
    if (answer) {
      setView(viewAfter(current, answer.intent, answer.state));
      if (answer.state?.codeSent && (answer.intent === "send" || answer.intent === "resend")) setSent(sent + 1);
      if (answer.state?.formError === "slotUnavailable" && startsAt) {
        setTaken([...taken, startsAt]);
        setTakenDate(areas.flatMap((candidate) => candidate.days ?? []).find((day) => day.windows.some((window) => window.startsAt === startsAt))?.date ?? null);
        setStartsAt(null);
        // The time from step 1 is gone: the pickers open, with the other times of that day.
        setPicking(true);
      }
    }
  }

  // After an answer on the form: to the windows when the window was just taken, otherwise to the
  // first field to fix (the consent switch too). (The code step puts the cursor in the code field.)
  // Once per answer: a change of step alone (such as "Ganti email") must not move the cursor here.
  const handled = useRef(0);
  const step = current.step;
  useEffect(() => {
    if (handled.current === answers) return;
    handled.current = answers;
    if (!state || step !== "form") return;
    if (state.formError === "slotUnavailable") windowAlert.current?.focus();
    else if (state.fieldErrors?.startsAt) form.current?.querySelector<HTMLElement>('input[name="startsAt"]')?.focus();
    else if (state.fieldErrors) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [answers, state, step]);

  // "Ganti email": back on the form, in the email field.
  useEffect(() => {
    if (edits > 0) form.current?.querySelector<HTMLElement>('input[name="email"]')?.focus();
  }, [edits]);

  // Back from step 1 after "Ubah": what was typed before comes back into the empty fields.
  const [restoredNote, setRestoredNote] = useState<number | null>(null);
  useEffect(() => {
    const storage = tabStorage();
    const draft = storage ? restoreOrderDraft(storage) : null;
    const fields = form.current?.elements;
    if (!draft || !fields) return;
    for (const name of ["address", "note", "phone", "email"] as const) {
      const field = fields.namedItem(name);
      if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && field.value === "" && draft[name]) {
        field.value = draft[name];
      }
    }
    const note = fields.namedItem("note");
    if (note instanceof HTMLTextAreaElement) setRestoredNote(note.value.length);
  }, []);
  const noteCount = restoredNote ?? noteLength;

  const area = areas.find((candidate) => candidate.id === areaId) ?? areas[0];
  const days = markTaken(area.days ?? [], taken);
  const selected = chosenWindow(days, startsAt);
  const justTaken = state?.formError === "slotUnavailable" && startsAt === null;
  const showTakenNotice =
    props.takenNotice !== null && areaId === props.initialAreaId && startsAt === null && !justTaken;
  const service = services.find((candidate) => candidate.id === serviceId);
  const fixed = !picking && service !== undefined && selected !== undefined;

  const errors = state?.fieldErrors ?? {};
  const errorOf = (field: keyof typeof errors) => {
    const key = errors[field];
    return key ? t(`errors.${key}`) : undefined;
  };
  const formErrorCount = Object.keys(errors).filter((field) => field !== "code").length;
  const formMessage =
    state?.formError && state.formError !== "slotUnavailable"
      ? t(`formErrors.${state.formError}`)
      : formErrorCount > 0
        ? t("errorSummary", { count: formErrorCount })
        : undefined;

  /** Keeps the choice in the address without a new request (Next.js syncs its router with it). */
  function remember(changes: Parameters<typeof orderSearch>[1]) {
    window.history.replaceState(null, "", `${window.location.pathname}${orderSearch(window.location.search, changes)}`);
  }

  /** A new service: the page is read again with it in the address, so the times are that service's. */
  function chooseService(next: string) {
    setServiceId(next);
    const url = `${window.location.pathname}${orderSearch(window.location.search, { serviceId: next || null })}`;
    startLoadingWindows(() => router.replace(url, { scroll: false }));
  }

  function send(chosen: OrderIntent) {
    if (!form.current) return;
    const data = new FormData(form.current);
    data.set("intent", chosen);
    setIntent(chosen);
    if (!signedIn) setEmail(String(data.get("email") ?? "").trim());
    startTransition(() => dispatch(data));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send(intentFor(current));
  }

  /** "Ubah": keeps what was typed in this tab, then step 1 opens with the choice. */
  function keepDraft() {
    const storage = tabStorage();
    if (storage && form.current) saveOrderDraft(storage, draftFromForm(new FormData(form.current)));
  }

  function toConsent(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const target = document.getElementById(consentId);
    target?.focus();
    target?.scrollIntoView({ block: "center" });
  }

  const backToStepOne = `/services?${new URLSearchParams({
    area: area.id,
    ...(service ? { layanan: service.id } : {}),
    ...(selected ? { starts: selected.window.startsAt } : {}),
  }).toString()}`;
  const changeLink = (
    <Link href={backToStepOne} onClick={keepDraft} aria-label={tOrder("recapChangeLabel")} className={flowTextLink}>
      {tOrder("recapChange")}
    </Link>
  );

  const recap = (
    <dl className="flex flex-col gap-3 border-b border-border pb-4 text-sm">
      {[
        { term: tOrder("recapService"), value: service?.name ?? tOrder("servicePlaceholder"), missing: !service },
        ...(service ? [{ term: tOrder("recapDuration"), value: service.duration, missing: false }] : []),
        { term: tOrder("recapArea"), value: area.name, missing: false },
        {
          term: tOrder("recapWindow"),
          value: selected ? (
            <>
              {selected.day.label}
              <br />
              <span className="whitespace-nowrap">{t("windowValue", { window: selected.window.label })}</span>
            </>
          ) : (
            t("noWindow")
          ),
          missing: !selected,
        },
      ].map((row) => (
        <div key={row.term} className="flex items-start justify-between gap-4">
          <dt className="shrink-0 text-ink-muted">{row.term}</dt>
          <dd className={`text-right tabular-nums ${row.missing ? "text-ink-muted" : "font-semibold text-ink"}`}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
  const alert = (
    <div role="alert" aria-atomic="true">
      {formMessage ? (
        <p
          key={answers}
          className="mt-4 flex items-start gap-2.5 rounded-sm bg-danger-surface px-4 py-3 text-sm font-medium text-danger"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{formMessage}</span>
        </p>
      ) : null}
    </div>
  );

  const submitLabel = signedIn ? (pending ? t("pending") : t("submit")) : pending ? tOrder("pendingSend") : tOrder("submitSend");
  const describedBy = !consent ? "booking-submit-hint" : signedIn ? undefined : "order-send-note";

  return (
    <>
      <form
        id={formId}
        ref={form}
        action={dispatch}
        onSubmit={onSubmit}
        noValidate
        aria-label={t("formLabel")}
        className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-6"
      >
        <input type="hidden" name="locale" value={locale} />

        {/* The order. On the code step it stays in the form, hidden, so the code is sent with it. */}
        <div hidden={current.step === "code"} className="lg:col-start-1">
          <div className="flex flex-col gap-5">
            {fixed && service && selected ? (
              <section aria-labelledby="order-choice-title" className={card}>
                <div className="flex items-center justify-between gap-4">
                  <h2 id="order-choice-title" className={sectionTitle}>
                    {tOrder("choiceTitle")}
                  </h2>
                  {changeLink}
                </div>
                <input type="hidden" name="serviceId" value={service.id} />
                <input type="hidden" name="areaId" value={area.id} />
                <input type="hidden" name="startsAt" value={selected.window.startsAt} />
                <div className="mt-3">{summaries[service.id]}</div>
                <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-ink-muted">{tOrder("recapArea")}</dt>
                    <dd className="font-semibold text-ink">{area.name}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-ink-muted">{tOrder("recapWindow")}</dt>
                    <dd className="flex flex-col font-semibold text-ink tabular-nums">
                      <span>{selected.day.label}</span>
                      <span className="whitespace-nowrap">{t("windowValue", { window: selected.window.label })}</span>
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-sm text-ink-muted">{t("arrivalNote")}</p>
              </section>
            ) : (
              <>
                <section aria-labelledby="order-service-title" className={card}>
                  <h2 id="order-service-title" className={sectionTitle}>
                    {tOrder("serviceTitle")}
                  </h2>
                  {props.serviceUnknown && !serviceId ? (
                    <p className="mt-3 flex items-start gap-3 rounded-sm bg-warning-surface px-4 py-3 text-sm text-ink">
                      <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
                      <span>{tOrder("serviceUnknown")}</span>
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-col gap-2">
                    <label htmlFor="order-service" className="text-xs font-medium text-ink-muted">
                      {tOrder("serviceLabel")}
                    </label>
                    <span className="relative flex">
                      <select
                        id="order-service"
                        name="serviceId"
                        value={serviceId}
                        onChange={(event) => chooseService(event.target.value)}
                        aria-invalid={errorOf("serviceId") ? true : undefined}
                        aria-describedby={errorOf("serviceId") ? "order-service-error" : undefined}
                        className={`${orderInputClass} h-12 cursor-pointer appearance-none truncate pr-11 font-semibold`}
                      >
                        {serviceId === "" ? (
                          <option value="" disabled>
                            {tOrder("servicePlaceholder")}
                          </option>
                        ) : null}
                        {/* The name only: a price in the option is cut off by the arrow on a phone. */}
                        {services.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-ink-muted"
                        aria-hidden="true"
                      />
                    </span>
                    <FieldError id="order-service-error" message={errorOf("serviceId")} />
                  </div>
                  {serviceId && summaries[serviceId] ? <div className="mt-4 border-t border-border pt-4">{summaries[serviceId]}</div> : null}
                </section>

                <OrderWhere
                  areas={areas}
                  area={area}
                  days={days}
                  selected={selected ? { dayLabel: selected.day.label, windowLabel: selected.window.label } : null}
                  startsAt={startsAt}
                  onChooseArea={(next) => {
                    setAreaId(next);
                    setStartsAt(null);
                    remember({ areaId: next, startsAt: null });
                  }}
                  onChooseWindow={(next) => {
                    setStartsAt(next);
                    remember({ startsAt: next });
                  }}
                  disabled={pending}
                  loading={loadingWindows}
                  openDate={takenDate}
                  areaError={errorOf("areaId")}
                  windowError={errorOf("startsAt")}
                  justTaken={justTaken}
                  answers={answers}
                  takenNotice={showTakenNotice ? props.takenNotice : null}
                  lookAheadDays={props.lookAheadDays}
                  windowAlert={windowAlert}
                />
              </>
            )}

            <section aria-labelledby="order-address-title" className={card}>
              <h2 id="order-address-title" className={sectionTitle}>
                {t("addressTitle")}
              </h2>
              <div className="mt-4 flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="booking-address" className="text-xs font-medium text-ink-muted">
                    {t("addressLabel")}
                  </label>
                  <textarea
                    id="booking-address"
                    name="address"
                    rows={3}
                    autoComplete="street-address"
                    defaultValue={state?.values?.address ?? ""}
                    aria-invalid={errorOf("address") ? true : undefined}
                    aria-describedby={errorOf("address") ? "booking-address-hint booking-address-error" : "booking-address-hint"}
                    className={`${orderInputClass} resize-y py-3`}
                  />
                  <p id="booking-address-hint" className="text-sm text-ink-muted">
                    {t("addressHint")}
                  </p>
                  <FieldError id="booking-address-error" message={errorOf("address")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="booking-note" className="text-xs font-medium text-ink-muted">
                    {tOrder("noteLabel")}
                  </label>
                  <textarea
                    id="booking-note"
                    name="note"
                    rows={3}
                    maxLength={noteMax}
                    defaultValue={state?.values?.note ?? ""}
                    onChange={(event) => {
                      setRestoredNote(null);
                      setNoteLength(event.target.value.length);
                    }}
                    aria-invalid={errorOf("note") ? true : undefined}
                    aria-describedby={errorOf("note") ? "booking-note-hint booking-note-error" : "booking-note-hint"}
                    className={`${orderInputClass} resize-y py-3`}
                  />
                  <p id="booking-note-hint" className="flex flex-wrap justify-between gap-x-4 text-sm text-ink-muted">
                    <span>{tOrder("noteHint")}</span>
                    <span className="tabular-nums" aria-hidden="true">
                      {noteCount}/{noteMax}
                    </span>
                  </p>
                  <FieldError id="booking-note-error" message={errorOf("note")} />
                </div>
              </div>
            </section>

            {/* Right after the address: the consent is part of what is being agreed to at this home. */}
            <section aria-labelledby="booking-stream-title" className={card}>
              <h2 id="booking-stream-title" className={sectionTitle}>
                {t("streamTitle")}
              </h2>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-muted">
                {(["phone", "viewers", "recording"] as const).map((fact) => (
                  <li key={fact} className="flex items-start gap-2.5">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-mint" aria-hidden="true" />
                    <span>{t(`streamFacts.${fact}`)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t border-border pt-4">
                <ConsentSwitch
                  id={consentId}
                  label={t("consentLabel")}
                  checked={consent}
                  onChange={setConsent}
                  error={consent ? undefined : errorOf("consent")}
                />
              </div>
            </section>

            <section aria-labelledby="order-contact-title" className={card}>
              <h2 id="order-contact-title" className={sectionTitle}>
                {tOrder("contactTitle")}
              </h2>
              <div className="mt-4 flex flex-col gap-5">
                <OrderField
                  id="order-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  label={tOrder("phoneLabel")}
                  hint={tOrder("phoneHint")}
                  error={errorOf("phone")}
                />
                {signedIn ? (
                  <div className="flex items-start gap-3 rounded-md bg-sunken px-4 py-3">
                    <UserRoundCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                    <p className="flex min-w-0 flex-col text-sm">
                      <span className="text-ink-muted">{tOrder("signedInTitle")}</span>
                      <span className="font-semibold break-words text-ink">{customer?.name || email}</span>
                      <span className="mt-1 text-ink-muted">{tOrder("signedInNote")}</span>
                    </p>
                  </div>
                ) : (
                  <OrderField
                    id="order-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    label={tOrder("emailLabel")}
                    hint={tOrder("emailHint")}
                    error={errorOf("email")}
                  />
                )}
              </div>
            </section>
          </div>
        </div>

        {current.step === "code" ? (
          <section aria-labelledby="order-code-title" className={`${card} lg:col-start-1 lg:row-start-1`}>
            <CodeEntry
              tone="forest"
              id="order-code"
              titleId="order-code-title"
              title={tOrder("codeTitle")}
              sentTo={tOrder.rich("codeSentTo", {
                email,
                strong: (chunks) => <strong className="font-semibold text-ink">{chunks}</strong>,
              })}
              error={errorOf("code")}
              submitLabel={t("submit")}
              pendingLabel={t("pending")}
              pending={pending}
              resending={pending && intent === "resend"}
              sentCount={sent}
              answerKey={answers}
              resent={answer?.intent === "resend" && Boolean(state?.codeSent)}
              onResend={() => send("resend")}
              onChangeEmail={() => {
                setView({ step: "form", signedIn: false });
                setEdits(edits + 1);
              }}
            >
              {alert}
            </CodeEntry>
          </section>
        ) : null}

        <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1">
          <div className={card}>
            {fixed ? (
              // The read-only card already says what is chosen; the summary keeps the total and the button.
              <h2 className="sr-only">{tOrder("recapTitle")}</h2>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h2 className={sectionTitle}>{tOrder("recapTitle")}</h2>
                  {changeLink}
                </div>
                {recap}
              </>
            )}
            {service ? (
              <div aria-live="polite" aria-atomic="true" className={`flex items-baseline justify-between gap-4 ${fixed ? "" : "mt-4"}`}>
                <p className="text-base font-semibold text-ink">{t("totalLabel")}</p>
                <p className="font-display text-price font-semibold whitespace-nowrap text-ink tabular-nums">{service.price}</p>
              </div>
            ) : null}
            <p className="mt-2 text-sm text-ink-muted">{t("totalNote")}</p>

            {current.step === "form" ? (
              <>
                {alert}
                <button
                  id={submitId}
                  type="submit"
                  disabled={pending}
                  aria-describedby={describedBy}
                  className={`${flowPrimaryButton} mt-5 justify-between pr-3 pl-6 ${pending ? "cursor-progress disabled:bg-primary-container disabled:text-on-primary" : ""}`}
                >
                  <span className="flex items-center gap-2">
                    {pending ? <LoaderCircle className="size-5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                    {submitLabel}
                  </span>
                  {pending ? null : (
                    <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lime text-on-lime">
                      <ArrowRight className="size-4" strokeWidth={2.5} />
                    </span>
                  )}
                </button>
                {!consent ? (
                  <p id="booking-submit-hint" className="mt-2 text-center text-sm text-ink-muted">
                    {t.rich("submitHint", {
                      link: (chunks) => (
                        <a
                          href={`#${consentId}`}
                          onClick={toConsent}
                          className="rounded-sm font-semibold text-primary underline decoration-1 underline-offset-4 hover:decoration-2 active:text-band"
                        >
                          {chunks}
                        </a>
                      ),
                    })}
                  </p>
                ) : signedIn ? null : (
                  <p id="order-send-note" className="mt-2 text-center text-sm text-ink-muted">
                    {tOrder("sendNote")}
                  </p>
                )}
              </>
            ) : null}
          </div>
          <p className={flowNote}>
            <span className={flowNoteIcon} aria-hidden="true">
              <Mail className="size-4.5" />
            </span>
            <span>
              <strong className="font-semibold">{tOrder("emailNoteTitle")}</strong> {tOrder("emailNoteBody")}
            </span>
          </p>
        </div>
      </form>
      <BookingBar
        watchId={submitId}
        off={current.step !== "form"}
        title={service?.name ?? tOrder("servicePlaceholder")}
        price={service?.price}
        detail={selected ? selected.day.short : t("noWindow")}
        time={selected ? t("windowValue", { window: selected.window.label }) : undefined}
        action={
          <button
            type="submit"
            form={formId}
            disabled={pending}
            aria-describedby={describedBy}
            className={`${flowPrimaryButton.replace("w-full", "w-auto")} min-h-12 shrink-0 px-4 text-sm ${pending ? "cursor-progress disabled:bg-primary-container disabled:text-on-primary" : ""}`}
          >
            {pending ? <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            {submitLabel}
          </button>
        }
      />
    </>
  );
}
