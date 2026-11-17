import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { ClientMessages } from "@/i18n/client-messages";
import { BookingBackLink } from "./booking-header";
import { SkipLink } from "./skip-link";

// The booking flow's chrome (2026-11-17, src/app/[locale]/(customer)/(booking)/layout.tsx): while the
// customer books, nothing leads off the task. One slim header holds "Kembali" on the left and the
// wordmark on the right, plain (not a link, so the one way out is the one that says where it goes). It
// stays at the top on every width (56 px on phones, 64 px from 768 px) on the app bar's cream, in the
// same 1200 px column as the steps. No navigation and no account menu: the steps on each page say
// where the customer is. The page leaves room under it for the floating language switch
// (pb-clear-switch: there is no bottom bar here), and from 768 px the same 96 px as the app.
export function BookingShell({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <header className="sticky top-0 z-(--z-sticky) border-b border-border bg-canvas">
        <div className="mx-auto flex h-top-bar max-w-dashboard items-center justify-between gap-3 px-safe md:h-16 md:px-gutter-wide">
          <ClientMessages namespaces={["BookingHeader"]}>
            <BookingBackLink />
          </ClientMessages>
          <Wordmark palette="forest" />
        </div>
      </header>
      <main id="konten" tabIndex={-1} className="flex flex-1 flex-col pb-clear-switch outline-none md:pb-24">
        {children}
      </main>
    </>
  );
}
