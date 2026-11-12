import { forestFontVariables } from "@/app/fonts-forest";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { SkipLink } from "@/components/shell/skip-link";

// The landing page has its own header and footer and no app navigation. `theme-forest` switches the
// shared token names to the redesign's values for everything inside (src/app/globals.css), and the
// redesign's fonts (src/app/fonts-forest.ts, shared with the admin console) load here.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`theme-forest ${forestFontVariables} flex flex-1 flex-col bg-canvas font-sans text-ink`}>
      <SkipLink />
      <MarketingHeader />
      <main id="konten" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
