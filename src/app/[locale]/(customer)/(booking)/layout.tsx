import { BookingShell } from "@/components/shell/booking-shell";
import { FloatingLanguageSwitch } from "@/components/shell/floating-language-switch";
import { ClientMessages } from "@/i18n/client-messages";

// The booking flow (2026-11-17): step 1 /services, step 2 /pesan and step 3 /orders/pay (the payment,
// then its confirmation). While the customer books, the app's navigation steps aside: one minimal
// header with "Kembali" (src/components/shell/booking-shell.tsx), the steps on each page, and the
// floating ID | EN switch at the bottom-left as on the rest of the customer side, here placed over
// the bottom edge (no bottom bar) and lifted above the phone's booking bar while it shows.
export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BookingShell>{children}</BookingShell>
      <ClientMessages>
        <FloatingLanguageSwitch place="flow" />
      </ClientMessages>
    </>
  );
}
