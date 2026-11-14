import { useTranslations } from "next-intl";
import { forestFontVariables } from "@/app/fonts-forest";
import { SidebarShell } from "@/components/shell/sidebar-shell";

// The owner's dashboard: desktop-first with a sidebar. Since D3 it opts in to the redesign as the admin
// (Phase 13) and agency (D2) consoles do: `theme-forest` gives the shared token names their redesign
// values, the wrapper loads the redesign's fonts (src/app/fonts-forest.ts), and the forest tone draws
// the shell as the dark-green band of the owner mocks, with the role card "Dasbor pemilik" over
// "Pemilik HomeKlin". The wordmark leads to the overview, the dashboard's start page.
export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("BackOfficeShell");
  return (
    <div className={`theme-forest ${forestFontVariables} flex flex-1 flex-col bg-canvas font-sans text-ink`}>
      <SidebarShell
        nav="owner"
        roleLabel={t("ownerRole")}
        tone="forest"
        roleCard={{ label: t("ownerDashboard"), title: t("ownerTitle") }}
        home={{ href: "/owner", label: t("ownerHome") }}
      >
        {children}
      </SidebarShell>
    </div>
  );
}
