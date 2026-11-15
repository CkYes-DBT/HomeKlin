"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { markGuestTicketRead, postGuestMessage, type GuestFormState } from "@/lib/support/guest-actions";
import type { TicketMessage, TicketStatus, TicketUrgency } from "@/lib/support/support";
import { Composer, CustomerChatView } from "./ticket-chat";

type GuestChatProps = {
  ticket: { id: string; status: TicketStatus; urgency: TicketUrgency; createdAt: string };
  messages: TicketMessage[];
  /** When admin last read the chat, for "Terkirim" or "Terbaca" under the guest's own messages. */
  adminReadAt: string | null;
};

/** How often the guest's chat asks the server again: Realtime does not reach a visitor without a session. */
export const guestPollMs = 10_000;

const sendAsGuest = (_previous: GuestFormState, formData: FormData) => postGuestMessage(null, formData);

// The support chat of a visitor without an account (B13, D5 mock Customer-Chat). It looks like a
// signed-in customer's chat, but the server reads it with this browser's httpOnly cookie only
// (getGuestTicket), so the page asks the server again every 10 seconds while it is shown
// (router.refresh) instead of listening on Realtime. Sending goes through postGuestMessage, which
// checks the cookie and the database's limits; opening the chat, and each new reply, marks it read
// for admin ("Terbaca").
export function GuestChat({ ticket, messages, adminReadAt }: GuestChatProps) {
  const t = useTranslations("SupportChat");
  const router = useRouter();
  const closed = ticket.status === "closed";

  useEffect(() => {
    if (closed) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, guestPollMs);
    return () => window.clearInterval(timer);
  }, [closed, router]);

  const replies = messages.filter((message) => message.fromAdmin).length;
  useEffect(() => {
    markGuestTicketRead(ticket.id).then(
      (result) => {
        if (result?.formError) console.error(`[support] could not mark the guest chat read: ${result.formError}`);
      },
      (error: unknown) => console.error("[support] could not mark the guest chat read:", error),
    );
  }, [ticket.id, replies]);

  // A new message scrolls into view; the first render does not move the page.
  const lastMessage = useRef<HTMLLIElement>(null);
  const seenCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > seenCount.current) lastMessage.current?.scrollIntoView({ block: "nearest" });
    seenCount.current = messages.length;
  }, [messages.length]);

  return (
    <CustomerChatView
      ticket={{ ...ticket, orderId: null }}
      status={ticket.status}
      shown={messages}
      lastMessage={lastMessage}
      adminReadAt={adminReadAt}
      live={
        closed ? null : (
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            <RefreshCw className="size-3.5 shrink-0" aria-hidden="true" />
            {t("guestPolling")}
          </p>
        )
      }
      composer={<Composer ticketId={ticket.id} viewer="customer" send={sendAsGuest} />}
    />
  );
}
