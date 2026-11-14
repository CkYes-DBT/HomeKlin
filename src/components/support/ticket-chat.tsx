"use client";

import { Check, CheckCheck, CircleAlert, ClipboardList, Headset, LoaderCircle, Lock, SendHorizontal, TriangleAlert, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Link } from "@/i18n/navigation";
import { postTicketMessage, type SupportFormState } from "@/lib/support/actions";
import { markTicketRead } from "@/lib/support/guest-actions";
import type { TicketMessage, TicketStatus, TicketUrgency } from "@/lib/support/support";
import { LiveStatus } from "./live-status";
import { isReadBy, mergeMessages, messageFromChange, readTimeFromChange, statusFromChange } from "./ticket-messages";
import { TicketStatusPill, UrgentPill } from "./ticket-pills";
import { useRealtime, type Change, type ChangeFilter } from "./use-realtime";

type TicketChatProps = {
  /** Whose screen this is: the customer's chat on /support, or the admin's on /admin/tickets. */
  viewer: "customer" | "admin";
  ticket: { id: string; status: TicketStatus; urgency: TicketUrgency; createdAt: string; orderId: string | null };
  /** The messages the server read, oldest first. */
  messages: TicketMessage[];
  /** Admin's view: the customer's name, shown on their messages. */
  customerName?: string;
  /** Admin's view: the close control, under the header. */
  actions?: ReactNode;
  /**
   * Admin's view: the order the chat is about, when admin_jobs() knows it: "Pesanan HK-1042,
   * Pembersihan Rutin, Kamis 5 November 09.00" and the order's detail page for "Buka pekerjaan".
   */
  order?: { line: string; href: string };
  /**
   * When the customer last read the chat (customer_read_at, B13), for admin's "Terkirim" or "Terbaca"
   * under each of admin's messages. Realtime brings a newer time while the chat is open.
   */
  customerReadAt?: string | null;
  /** Admin's view: the chat was opened without an account (B13), with the email the guest gave, if any. */
  guest?: { email: string | null } | null;
};

const jakarta = "Asia/Jakarta";
const timeFormats = new Map<string, Intl.DateTimeFormat>();

/** "4 Nov, 10.12" in Jakarta time, with the Indonesian conventions in both languages. */
function messageTime(iso: string, locale: string): string {
  let format = timeFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale === "en" ? "en-ID" : "id-ID", {
      timeZone: jakarta,
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    timeFormats.set(locale, format);
  }
  return format.format(new Date(iso));
}

// One help chat (T20 for the customer, T21 for the admin). The server renders the messages it read;
// Supabase Realtime adds new ones and the ticket's status while the page is open, without a reload
// (row-level security sends each user only rows they may read). Each (re)join reads the server's list
// again, which covers anything sent while the connection was down; the two lists merge by id.
// Sending goes through postTicketMessage, which checks the user and the ticket on the server. The
// draft stays in the box if sending fails, and an empty message is stopped before it is sent.
// Opening the chat, and every new message from the other side while it is open, marks it read for this
// side (markTicketRead, mark_ticket_read), which the other side sees as "Terbaca" (B13).
export function TicketChat({ viewer, ticket, messages, customerName, actions, order, customerReadAt = null, guest = null }: TicketChatProps) {
  const t = useTranslations("SupportChat");
  const locale = useLocale();
  const router = useRouter();

  const [liveMessages, setLiveMessages] = useState<TicketMessage[]>([]);
  // A status from Realtime counts until the server's own status changes (a refresh brought it).
  const [liveStatus, setLiveStatus] = useState<{ value: TicketStatus; over: TicketStatus } | null>(null);
  const status = liveStatus && liveStatus.over === ticket.status ? liveStatus.value : ticket.status;
  const shown = mergeMessages(messages, liveMessages);
  // The customer's read time from Realtime counts until the server's own one catches up.
  const [liveRead, setLiveRead] = useState<string | null>(null);
  const readAt = latest(customerReadAt, liveRead);

  const changes: ChangeFilter[] = [
    { event: "INSERT", table: "ticket_messages", filter: `ticket_id=eq.${ticket.id}` },
    { event: "UPDATE", table: "support_tickets", filter: `id=eq.${ticket.id}` },
  ];
  const live = useRealtime(`ticket:${ticket.id}`, changes, {
    onChange: (change: Change) => {
      if (change.table === "ticket_messages") {
        const message = messageFromChange(change.new, ticket.id);
        if (message) setLiveMessages((current) => [...current, message]);
      } else {
        const next = statusFromChange(change.new, ticket.id);
        if (next) setLiveStatus({ value: next, over: ticket.status });
        const read = readTimeFromChange(change.new, ticket.id, "customer");
        if (read) setLiveRead(read);
      }
    },
    onJoin: () => router.refresh(),
  });

  // This side has seen the chat: on opening it, and again when the other side writes while it is open.
  const fromOtherSide = shown.filter((message) => message.fromAdmin === (viewer === "customer")).length;
  useEffect(() => {
    markTicketRead(ticket.id).then(
      (result) => {
        if (result?.formError) console.error(`[support] could not mark the chat read: ${result.formError}`);
      },
      (error: unknown) => console.error("[support] could not mark the chat read:", error),
    );
  }, [ticket.id, fromOtherSide]);

  // A new message scrolls into view; the first render does not move the page.
  const lastMessage = useRef<HTMLLIElement>(null);
  const seenCount = useRef(shown.length);
  useEffect(() => {
    if (shown.length > seenCount.current) lastMessage.current?.scrollIntoView({ block: "nearest" });
    seenCount.current = shown.length;
  }, [shown.length]);

  const titleId = `chat-${ticket.id}`;
  if (viewer === "admin") {
    const author = (message: TicketMessage) => (message.fromAdmin ? t("team") : customerName || t("customerFallback"));
    return (
      <AdminChat
        ticket={ticket}
        status={status}
        live={live}
        shown={shown}
        lastMessage={lastMessage}
        customerName={customerName || t("customerFallback")}
        order={order}
        actions={actions}
        author={author}
        readAt={readAt}
        guest={guest}
      />
    );
  }

  // The customer's own messages sit on the right.
  const ownSide = (message: TicketMessage) => !message.fromAdmin;
  const author = (message: TicketMessage) => (message.fromAdmin ? t("team") : t("you"));

  return (
    <section aria-labelledby={titleId} className="flex flex-col rounded-xl border border-border bg-surface shadow-card">
      <header className="flex flex-col gap-3 border-b border-border p-4 md:p-5">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
            {t("titleCustomer")}
          </h2>
          <p className="text-sm text-ink-muted">
            <time dateTime={ticket.createdAt} suppressHydrationWarning>
              {t("opened", { time: messageTime(ticket.createdAt, locale) })}
            </time>
            {ticket.orderId ? <span> · {t("order", { reference: `#${ticket.orderId.slice(0, 8)}` })}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TicketStatusPill status={status} label={t(`status.${status}`)} />
          {ticket.urgency === "urgent" ? <UrgentPill label={t("urgent")} /> : null}
        </div>
        {status === "closed" ? null : (
          <LiveStatus
            state={live}
            labels={{
              connected: t("live.connected"),
              connectedHint: t("live.connectedHint"),
              connecting: t("live.connecting"),
              offline: t("live.offline"),
              reload: t("live.reload"),
            }}
          />
        )}
        {actions && status !== "closed" ? actions : null}
      </header>

      <ol aria-label={t("messagesLabel")} aria-live="polite" aria-relevant="additions" className="flex flex-col gap-3 p-4 md:p-5">
        {shown.map((message, index) => {
          const own = ownSide(message);
          return (
            <li
              key={message.id}
              ref={index === shown.length - 1 ? lastMessage : undefined}
              className={`flex max-w-[min(36rem,88%)] flex-col gap-1 rounded-xl px-4 py-3 ${
                own ? "self-end bg-brand-50 text-ink" : "self-start border border-border bg-surface-sunken text-ink"
              }`}
            >
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
                <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                  {message.fromAdmin ? <Headset className="size-3.5 shrink-0 text-brand-700" aria-hidden="true" /> : null}
                  {author(message)}
                </span>
                <time dateTime={message.createdAt} suppressHydrationWarning>
                  {messageTime(message.createdAt, locale)}
                </time>
              </p>
              <p className="text-base break-words whitespace-pre-wrap">{message.body}</p>
            </li>
          );
        })}
      </ol>

      <footer className="border-t border-border p-4 md:p-5">
        {status === "closed" ? (
          <p className="flex items-start gap-2.5 rounded-md bg-surface-sunken px-4 py-3 text-sm text-ink-muted">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{t("closedCustomer")}</span>
          </p>
        ) : (
          <Composer ticketId={ticket.id} viewer={viewer} />
        )}
      </footer>
    </section>
  );
}

/** The later of two read times; null when there is neither. */
function latest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function Composer({ ticketId, viewer }: { ticketId: string; viewer: "customer" | "admin" }) {
  const t = useTranslations("SupportChat");
  const [state, formAction, pending] = useActionState<SupportFormState, FormData>(postTicketMessage, null);
  const [body, setBody] = useState("");
  const [empty, setEmpty] = useState(false);
  // Counts the sends, so the same refusal twice is announced twice.
  const [sends, setSends] = useState(0);
  const field = useRef<HTMLTextAreaElement>(null);

  // A message the server took empties the box; a refusal keeps the draft.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setBody("");
  }

  const id = `message-${ticketId}`;
  const error = empty ? t("composer.empty") : state?.formError && !pending ? t(`errors.${state.formError}`) : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (body.trim() === "") {
      setEmpty(true);
      setSends((count) => count + 1);
      field.current?.focus();
      return;
    }
    setEmpty(false);
    setSends((count) => count + 1);
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  // Ctrl+Enter or Cmd+Enter sends; Enter alone starts a new line.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const errorLine = (
    <div role="alert" aria-atomic="true">
      {error ? (
        <p key={sends} id={`${id}-error`} className="flex items-start gap-1.5 px-1 text-sm font-medium text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );

  if (viewer === "admin") {
    // The redesign (the user's mock "Admin-Support"): a pill-shaped box and a round lime send button
    // on the chat's cream footer. The label stays for screen readers; the placeholder says it for the eye.
    const label = t("composer.labelAdmin");
    return (
      <form action={formAction} onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
        <input type="hidden" name="ticketId" value={ticketId} />
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <div className="flex items-end gap-2">
          <textarea
            ref={field}
            id={id}
            name="body"
            rows={1}
            maxLength={2000}
            value={body}
            placeholder={label}
            onChange={(event) => {
              setBody(event.target.value);
              if (empty) setEmpty(false);
            }}
            onKeyDown={onKeyDown}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className="max-h-40 min-h-touch min-w-0 flex-1 resize-y rounded-lg border border-border-control bg-card px-4.5 py-2.5 text-base text-ink caret-primary transition-colors duration-150 ease-out-quart placeholder:text-ink-muted hover:border-primary aria-invalid:border-danger aria-invalid:bg-danger-surface lg:text-body"
          />
          <button
            type="submit"
            aria-disabled={pending || undefined}
            aria-label={pending ? t("composer.pending") : t("composer.sendAdmin")}
            className="inline-flex size-touch shrink-0 items-center justify-center rounded-full bg-lime text-on-lime transition-[filter,transform] duration-150 ease-out-quart hover:brightness-95 active:scale-[0.96] active:brightness-90 aria-disabled:cursor-progress"
          >
            {pending ? (
              <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <SendHorizontal className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
        {errorLine}
      </form>
    );
  }

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <label htmlFor={id} className="px-1 text-sm font-medium text-ink">
        {t("composer.labelCustomer")}
      </label>
      <textarea
        ref={field}
        id={id}
        name="body"
        rows={3}
        maxLength={2000}
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          if (empty) setEmpty(false);
        }}
        onKeyDown={onKeyDown}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="min-h-24 w-full resize-y rounded-xl border border-border-control bg-surface px-4 py-3 text-base text-ink caret-brand-700 transition-colors duration-150 ease-out-quart hover:border-brand-600 aria-invalid:border-danger aria-invalid:bg-danger-surface"
      />
      <div role="alert" aria-atomic="true">
        {error ? (
          <p key={sends} id={`${id}-error`} className="flex items-start gap-1.5 px-1 text-sm font-medium text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending}
        className={`inline-flex min-h-touch items-center justify-center gap-2 self-end rounded-full px-5 text-sm font-semibold transition-[background-color,transform] duration-150 ease-out-quart ${
          pending
            ? "cursor-progress bg-brand-700 text-on-brand"
            : "bg-brand-600 text-on-brand hover:bg-brand-700 active:scale-[0.98] active:bg-brand-800"
        }`}
      >
        {pending ? (
          <LoaderCircle className="size-4.5 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <SendHorizontal className="size-4.5 shrink-0" aria-hidden="true" />
        )}
        {pending ? t("composer.pending") : t("composer.sendCustomer")}
      </button>
    </form>
  );
}

type AdminChatProps = {
  ticket: TicketChatProps["ticket"];
  status: TicketStatus;
  live: ReturnType<typeof useRealtime>;
  shown: TicketMessage[];
  lastMessage: RefObject<HTMLLIElement | null>;
  customerName: string;
  order: TicketChatProps["order"];
  actions: ReactNode;
  author: (message: TicketMessage) => string;
  /** When the customer last read the chat, for "Terkirim" or "Terbaca" under admin's messages. */
  readAt: string | null;
  guest: TicketChatProps["guest"];
};

// Admin's chat in the redesign (D1, the user's mock "Admin-Support"): a dark forest header with the
// customer's name, the order the chat is about and the actions ("Buka pekerjaan", "Tutup tiket"); a
// light row with the ticket's status and whether new messages arrive by themselves; the messages on
// the cream panel, admin's own on the right in forest, the customer's on the left in white, an urgent
// ticket marked at the top in words; and the composer at the foot. The heading starts with
// "Percakapan dengan pelanggan" for screen readers, so the region keeps the name it always had.
function AdminChat({ ticket, status, live, shown, lastMessage, customerName, order, actions, author, readAt, guest }: AdminChatProps) {
  const t = useTranslations("SupportChat");
  const locale = useLocale();
  const titleId = `chat-${ticket.id}`;

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col overflow-hidden rounded-lg bg-canvas ring-1 ring-border">
      <header className="on-dark-focus flex flex-wrap items-center justify-between gap-3 bg-band px-4 py-3 text-on-band">
        <div className="flex min-w-0 flex-col leading-snug">
          <h2 id={titleId} className="font-display text-lg font-semibold break-words">
            <span className="sr-only">{t("titleAdmin")}: </span>
            {customerName}
          </h2>
          {guest ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-on-band-muted">
              <span className="inline-flex items-center gap-1 font-semibold text-on-band">
                <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
                {t("guest")}
              </span>
              <span className="break-all">{guest.email ?? t("guestNoEmail")}</span>
            </p>
          ) : null}
          <p className="text-sm text-on-band-muted">
            {order ? (
              order.line
            ) : (
              <time dateTime={ticket.createdAt} suppressHydrationWarning>
                {t("opened", { time: messageTime(ticket.createdAt, locale) })}
              </time>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {order ? (
            <Link
              href={order.href}
              className="inline-flex min-h-touch items-center gap-2 rounded-full px-4.5 text-sm font-semibold text-on-band inset-ring-[1.5px] inset-ring-on-band-muted transition-colors duration-150 ease-out-quart hover:bg-band-raised active:bg-primary"
            >
              <ClipboardList className="size-4.5 shrink-0" aria-hidden="true" />
              {t("openJob")}
            </Link>
          ) : null}
          {actions && status !== "closed" ? actions : null}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-card px-4 py-1">
        <TicketStatusPill status={status} label={t(`status.${status}`)} />
        {status === "closed" ? null : (
          <LiveStatus
            state={live}
            labels={{
              connected: t("live.connected"),
              connectedHint: t("live.connectedHint"),
              connecting: t("live.connecting"),
              offline: t("live.offline"),
              reload: t("live.reload"),
            }}
          />
        )}
      </div>

      <div className="flex min-h-96 flex-1 flex-col gap-2 px-4 py-3.5">
        {ticket.urgency === "urgent" ? (
          <p className="mb-1.5 inline-flex items-center gap-1.5 self-center rounded-full bg-danger-surface px-3.5 py-1.5 text-center text-xs font-medium text-danger">
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
            <span suppressHydrationWarning>{t("urgentBanner", { time: messageTime(ticket.createdAt, locale) })}</span>
          </p>
        ) : null}
        <ol aria-label={t("messagesLabel")} aria-live="polite" aria-relevant="additions" className="flex flex-col gap-2">
          {shown.map((message, index) => {
            const own = message.fromAdmin;
            return (
              <li
                key={message.id}
                ref={index === shown.length - 1 ? lastMessage : undefined}
                className={`flex max-w-[min(36rem,85%)] flex-col gap-0.5 px-3.5 pt-2.5 pb-2 ${
                  own
                    ? "self-end rounded-lg rounded-br-sm bg-primary text-on-primary"
                    : "self-start rounded-lg rounded-bl-sm bg-card text-ink ring-1 ring-border"
                }`}
              >
                <p className={`text-xs font-medium ${own ? "text-on-band-muted" : "text-ink-muted"}`}>{author(message)}</p>
                <p className="text-body break-words whitespace-pre-wrap">{message.body}</p>
                <p className={`mt-0.5 flex items-center gap-1.5 self-end text-xs tabular-nums ${own ? "text-on-band-muted" : "text-ink-muted"}`}>
                  <time dateTime={message.createdAt} suppressHydrationWarning>
                    {messageTime(message.createdAt, locale)}
                  </time>
                  {own ? <ReadTick read={isReadBy(message, readAt)} label={t(isReadBy(message, readAt) ? "read" : "sent")} /> : null}
                </p>
              </li>
            );
          })}
        </ol>
      </div>

      <footer className="border-t border-border px-3 py-2.5">
        {status === "closed" ? (
          <p className="flex items-start gap-2.5 rounded-md bg-sunken px-4 py-3 text-sm text-ink-muted">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{t("closedAdmin")}</span>
          </p>
        ) : (
          <Composer ticketId={ticket.id} viewer="admin" />
        )}
      </footer>
    </section>
  );
}

/** Under admin's own message: "Terkirim" with one tick, or "Terbaca" with two. A word, never the ticks alone. */
function ReadTick({ read, label }: { read: boolean; label: string }) {
  const Icon = read ? CheckCheck : Check;
  return (
    <span data-read={read ? "read" : "sent"} className="inline-flex items-center gap-0.5">
      <span aria-hidden="true">·</span>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
