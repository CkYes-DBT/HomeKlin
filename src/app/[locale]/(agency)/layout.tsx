import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { forestFontVariables } from "@/app/fonts-forest";
import { AgencyName } from "@/components/agency/agency-name";
import "@/components/agency/motion.css";
import { SidebarShell } from "@/components/shell/sidebar-shell";

// Agency back office: desktop-first with a sidebar. Since D2 it opts in to the redesign as the admin
// console does (Phase 13): `theme-forest` gives the shared token names their redesign values, the
// wrapper loads the redesign's fonts (src/app/fonts-forest.ts), and the forest tone draws the shell as
// the dark-green band of the partner mocks. The role card says "Dasbor mitra agensi" over the agency's
// own name, which reads the session and so streams in behind <Suspense> (the shell stays prerendered).
// The wordmark leads to the summary, the console's start page. `partner-motion` scopes the partner
// screens' motion (src/components/agency/motion.css): what streams in after the shell fades up.
export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("BackOfficeShell");
  return (
    <div className={`theme-forest ${forestFontVariables} partner-motion flex flex-1 flex-col bg-canvas font-sans text-ink`}>
      <SidebarShell
        nav="agency"
        roleLabel={t("agencyRole")}
        tone="forest"
        roleCard={{
          label: t("agencyDashboard"),
          title: (
            <Suspense fallback={t("agencyFallback")}>
              <AgencyName fallback={t("agencyFallback")} />
            </Suspense>
          ),
        }}
        home={{ href: "/agency", label: t("agencyHome") }}
      >
        {children}
      </SidebarShell>
    </div>
  );
}
