import { ArrowRight, LoaderCircle, LogIn, MessageCircle } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { getOrderWords } from "@/components/customer/order-status";
import { ButtonLink } from "@/components/ui/button-link";
import { ClientMessages } from "@/i18n/client-messages";
import { getCurrentUser } from "@/lib/auth/dal";
import { roleHome } from "@/lib/auth/roles";
import { listMyOrders, type CustomerOrder } from "@/lib/booking/orders";
import { getCatalogServices } from "@/lib/catalog/cached";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGuestTicket, readGuestCookie } from "@/lib/support/guest";
import { listMyTickets, type Ticket } from "@/lib/support/support";
import { flowAccentButton, flowTextLink } from "@/components/customer/flow-styles";
import { Link } from "@/i18n/navigation";
import { GuestTicketForm } from "./guest-ticket-form";
import { MyTickets } from "./my-tickets";
import { TicketForm } from "./ticket-form";

type Emphasis = "strong" | "quiet";

const emphasisStyles: Record<Emphasis, string> = {
  // Nothing matched: the panel is the way on, so it stands out with a forest edge.
  strong: "bg-card ring-2 ring-primary",
  quiet: "bg-card",
};

/** The "Masih butuh bantuan? Hubungi admin" panel; also the loading state's frame. */
export async function ContactPanel({ emphasis, children }: { emphasis: Emphasis; children: ReactNode }) {
  const t = await getTranslations("SupportPage");
  return (
    <section
      aria-labelledby="hubungi-admin"
      data-emphasis={emphasis}
      className={`flex flex-col gap-5 rounded-lg p-5 md:p-7 ${emphasisStyles[emphasis]}`}
    >
      <div className="flex flex-col items-start gap-4">
        <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-lime-wash text-on-lime-wash">
          <MessageCircle className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 id="hubungi-admin" className="font-display text-title font-semibold text-ink">
            {t("contact.title")}
          </h2>
          <p className="max-w-prose text-ink-muted">{t("contact.body")}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** What fills the panel while the session is read. */
export async function ContactLoading() {
  const t = await getTranslations("SupportPage");
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
      <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
      {t("contact.loading")}
    </p>
  );
}

type ContactAdminProps = {
  /** The search words, carried over as the question. */
  query: string;
  emphasis: Emphasis;
};

// The signed-in part of /support (T20), at request time behind <Suspense>: it reads the session. A
// visitor is asked to sign in first (and comes back here); a signed-in customer gets the ticket form
// and, below the panel, their own tickets; staff are pointed to their own pages. The role decides what
// renders here, and openTicket checks it again on the server. Everything is read with the customer's
// own session, so row-level security returns only their own tickets and orders.
export async function ContactAdmin({ query, emphasis }: ContactAdminProps) {
  const [t, user] = await Promise.all([getTranslations("SupportPage"), getCurrentUser()]);

  if (!user) {
    // A visitor chats without an account (B13). A browser that already opened a chat goes back to it.
    const held = await readGuestCookie();
    let open: { id: string } | null = null;
    if (held) {
      try {
        const found = await getGuestTicket(held.ticketId);
        open = found && found.ticket.status !== "closed" ? { id: found.ticket.id } : null;
      } catch (error) {
        unstable_rethrow(error);
        console.error(error);
      }
    }
    return (
      <ContactPanel emphasis={emphasis}>
        {open ? (
          <div className="flex flex-col items-start gap-3">
            <p className="max-w-prose text-ink">{t("contact.guestOpenBody")}</p>
            <Link href={`/support?ticket=${open.id}`} className={flowAccentButton}>
              {t("contact.guestContinue")}
              <ArrowRight className="size-5 shrink-0" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <ClientMessages namespaces={["SupportGuestForm", "SupportChat"]}>
            {/* Keyed by the search, so a new search carries its words over into the question. */}
            <GuestTicketForm key={query} initialQuestion={query} />
          </ClientMessages>
        )}
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
          <span>{t("contact.haveAccount")}</span>
          <Link href="/login?next=%2Fsupport" className={flowTextLink}>
            <LogIn className="size-4 shrink-0" aria-hidden="true" />
            {t("contact.signIn")}
          </Link>
        </p>
      </ContactPanel>
    );
  }

  if (user.role !== "customer") {
    return (
      <ContactPanel emphasis="quiet">
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold text-ink">{t("contact.staffTitle")}</p>
          <p className="max-w-prose text-sm text-ink-muted">{t("contact.staffBody")}</p>
        </div>
        <ButtonLink href={user.role === "admin" ? "/admin/tickets" : roleHome[user.role]} variant="outline" className="w-full sm:w-fit">
          {user.role === "admin" ? t("contact.adminLink") : t("contact.staffLink")}
        </ButtonLink>
      </ContactPanel>
    );
  }

  const locale = await getLocale();
  let tickets: Ticket[] | null;
  let orderOptions: { id: string; label: string }[] = [];
  try {
    const client = await createSupabaseServerClient({ writeCookies: false });
    const [ticketRows, orders, services, words] = await Promise.all([
      listMyTickets(client),
      listMyOrders(client),
      getCatalogServices(),
      getOrderWords(locale),
    ]);
    tickets = ticketRows;
    const serviceName = (order: CustomerOrder) => services.find((service) => service.id === order.serviceId)?.name[locale];
    orderOptions = orders.slice(0, 20).map((order) => ({
      id: order.id,
      label: `${words.service(serviceName(order))}, ${words.arrival(order)}`,
    }));
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    tickets = null;
  }

  return (
    <>
      <ContactPanel emphasis={emphasis}>
        <ClientMessages namespaces={["SupportTicketForm"]}>
          {/* Keyed by the search, so a new search carries its words over into the question. */}
          <TicketForm key={query} initialQuestion={query} orders={orderOptions} />
        </ClientMessages>
      </ContactPanel>
      <MyTickets tickets={tickets} />
    </>
  );
}
