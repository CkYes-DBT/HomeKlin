import { forestFontVariables } from "@/app/fonts-forest";
import { FloatingLanguageSwitch } from "@/components/shell/floating-language-switch";
import { ClientMessages } from "@/i18n/client-messages";
import { MobileShell } from "@/components/shell/mobile-shell";

// Customer pages: mobile-first, bottom navigation on phones. Since D5 they opt in to the redesign as
// the back offices and the cleaner app did: `theme-forest` gives the shared token names their redesign
// values, the wrapper loads the redesign's fonts (src/app/fonts-forest.ts), and the shell's forest tone
// draws the cream app bar and the lime-wash nav pill. The booking steps, the orders and the home follow
// the Main, Customer-* and Phone-* mocks; the pages of pass 5b (live, replay, support) keep their
// components until then, now on the cream page. The language switch is not in the app bar here: it
// floats at the bottom-left of every customer page, so the layout holds it and it persists across routes.
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`theme-forest ${forestFontVariables} flex flex-1 flex-col bg-canvas font-sans text-ink`}>
      <MobileShell nav="customer" tone="forest" floatingControl>
        {children}
      </MobileShell>
      <ClientMessages>
        <FloatingLanguageSwitch />
      </ClientMessages>
    </div>
  );
}
