import { ArrowLeft, CircleAlert, LogIn, MessageCircleOff, UserRoundX } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { ClientMessages } from "@/i18n/client-messages";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { roleHome } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGuestTicket } from "@/lib/support/guest";
import { getTicket } from "@/lib/support/support";
import { GuestChat } from "./guest-chat";
import { TicketChat } from "./ticket-chat";

// One help chat for the customer (T20): /support?ticket=<id>, at request time behind <Suspense>. The
// ticket is read with the customer's own session (getTicket), so row-level security returns nothing
// for another customer's ticket or an unknown id, and both show the same "not found", which reveals
// nothing about the ticket. A visitor is asked to sign in and comes back to this chat; staff are
// pointed to the admin inbox. New messages arrive through Realtime in TicketChat.
export async function CustomerTicket({ ticketId }: { ticketId: string }) {
  const [t, user] = await Promise.all([getTranslations("SupportPage"), getCurrentUser()]);

  if (!user) {
    // A chat opened without an account (B13) is read with this browser's cookie only; any other
    // visitor, and any other ticket, gets the same sign-in note, which says nothing about the ticket.
    let guest: Awaited<ReturnType<typeof getGuestTicket>> = null;
    try {
      guest = await getGuestTicket(ticketId);
    } catch (error) {
      unstable_rethrow(error);
      console.error(error);
    }
    if (guest) {
      return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          <BackToHelp label={t("ticket.back")} />
          <ClientMessages namespaces={["SupportChat"]}>
            <GuestChat
              key={guest.ticket.id}
              ticket={{
                id: guest.ticket.id,
                status: guest.ticket.status,
                urgency: guest.ticket.urgency,
                createdAt: guest.ticket.createdAt,
              }}
              messages={guest.messages}
              adminReadAt={guest.ticket.adminReadAt}
            />
          </ClientMessages>
        </div>
      );
    }
    const next = encodeURIComponent(`/support?ticket=${ticketId}`);
    return (
      <EmptyState tone="forest" icon={LogIn} title={t("ticket.signInTitle")}>
        {t("ticket.signInBody")}
        <span className="mt-4 flex justify-center">
          <ButtonLink href={`/login?next=${next}`} icon={LogIn} variant="forest">
            {t("contact.signIn")}
          </ButtonLink>
        </span>
      </EmptyState>
    );
  }

  if (user.role !== "customer") {
    return (
      <EmptyState tone="forest" icon={UserRoundX} title={t("contact.staffTitle")}>
        {t("ticket.staffBody")}
        <span className="mt-4 flex justify-center">
          <ButtonLink href={user.role === "admin" ? "/admin/tickets" : roleHome[user.role]} variant="outline">
            {user.role === "admin" ? t("contact.adminLink") : t("contact.staffLink")}
          </ButtonLink>
        </span>
      </EmptyState>
    );
  }

  let found: Awaited<ReturnType<typeof getTicket>>;
  try {
    found = await getTicket(await createSupabaseServerClient({ writeCookies: false }), ticketId);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return (
      <div className="flex flex-col gap-2">
        <BackToHelp label={t("ticket.back")} />
        <EmptyState tone="forest" icon={CircleAlert} title={t("ticket.errorTitle")}>
          {t("ticket.errorBody")}
          <span className="mt-4 flex justify-center">
            {/* A plain link on purpose: a full page load reads the chat again. */}
            <a
              href=""
              className="inline-flex min-h-touch items-center justify-center rounded-full bg-card inset-ring-1 inset-ring-border-control px-5 text-sm font-semibold text-ink transition-colors duration-150 ease-out-quart hover:bg-sunken active:bg-lime-wash"
            >
              {t("ticket.retry")}
            </a>
          </span>
        </EmptyState>
      </div>
    );
  }

  if (!found) {
    return (
      <div className="flex flex-col gap-2">
        <BackToHelp label={t("ticket.back")} />
        <EmptyState tone="forest" icon={MessageCircleOff} title={t("ticket.notFoundTitle")}>
          {t("ticket.notFoundBody")}
        </EmptyState>
      </div>
    );
  }

  const { ticket, messages } = found;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
      <BackToHelp label={t("ticket.back")} />
      <ClientMessages namespaces={["SupportChat"]}>
        <TicketChat
          key={ticket.id}
          viewer="customer"
          ticket={{
            id: ticket.id,
            status: ticket.status,
            urgency: ticket.urgency,
            createdAt: ticket.createdAt,
            orderId: ticket.orderId,
          }}
          messages={messages}
          adminReadAt={ticket.adminReadAt}
        />
      </ClientMessages>
    </div>
  );
}

function BackToHelp({ label }: { label: string }) {
  return (
    <Link
      href="/support"
      className="inline-flex min-h-touch w-fit items-center gap-2 rounded-sm pr-3 text-sm font-semibold text-primary underline-offset-4 transition-colors duration-150 ease-out-quart hover:underline active:text-band"
    >
      <ArrowLeft className="size-4.5 shrink-0" aria-hidden="true" />
      {label}
    </Link>
  );
}
