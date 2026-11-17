import { FloatingLanguageSwitch } from "@/components/shell/floating-language-switch";
import { MobileShell } from "@/components/shell/mobile-shell";
import { ClientMessages } from "@/i18n/client-messages";

// The customer app (D5): the shell's forest tone draws the cream app bar and the lime-wash nav pill.
// The home and the orders follow the Customer-* and Phone-* mocks; the pages of pass 5b (live,
// replay, support) keep their components until then, now on the cream page. The language switch is not
// in the app bar here: it floats at the bottom-left of every customer page, so the layout holds it and
// it persists across routes.
export default function CustomerAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MobileShell nav="customer" tone="forest" floatingControl>
        {children}
      </MobileShell>
      <ClientMessages>
        <FloatingLanguageSwitch />
      </ClientMessages>
    </>
  );
}
