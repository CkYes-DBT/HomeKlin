import { useTranslations } from "next-intl";
import { forestFontVariables } from "@/app/fonts-forest";
import { MobileShell } from "@/components/shell/mobile-shell";

// Cleaner pages: mobile-first, a minimal bottom navigation (Beranda, Pekerjaan, Akun). Since D4 they
// opt in to the redesign as the admin, agency and owner consoles did: `theme-forest` gives the shared
// token names their redesign values, the wrapper loads the redesign's fonts (src/app/fonts-forest.ts),
// and the shell's forest tone draws the cream app bar and the lime-wash nav pill of the Cleaner-* mocks.
// It stays a phone layout on every width, not the back-office sidebar.
export default function CleanerLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("AppShell");
  return (
    <div className={`theme-forest ${forestFontVariables} flex flex-1 flex-col bg-canvas font-sans text-ink`}>
      <MobileShell nav="cleaner" roleLabel={t("cleanerRole")} tone="forest">
        {children}
      </MobileShell>
    </div>
  );
}
