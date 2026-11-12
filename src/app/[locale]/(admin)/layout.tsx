import { useTranslations } from "next-intl";
import { forestFontVariables } from "@/app/fonts-forest";
import { SidebarShell } from "@/components/shell/sidebar-shell";

// Admin console: desktop-first with a sidebar. It opts in to the redesign like the landing page
// (Phase 13): `theme-forest` gives the shared token names their redesign values and the wrapper loads
// the redesign's fonts (src/app/fonts-forest.ts). The sidebar is fixed, but it is a descendant of the
// wrapper, so it inherits both. The agency and owner consoles share SidebarShell and stay on T3b.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("BackOfficeShell");
  return (
    <div className={`theme-forest ${forestFontVariables} flex flex-1 flex-col bg-canvas font-sans text-ink`}>
      <SidebarShell nav="admin" roleLabel={t("adminRole")}>
        {children}
      </SidebarShell>
    </div>
  );
}
