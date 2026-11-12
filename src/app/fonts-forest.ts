import { Instrument_Serif, Inter, Inter_Tight } from "next/font/google";

// The redesign's three families (markdown/design.md, Typography), for the pages that opt in to
// `.theme-forest`: the landing page (src/app/[locale]/(marketing)/layout.tsx) and the admin console
// (src/app/[locale]/(admin)/layout.tsx). Declared once here so both share one instance of each font;
// kept apart from src/app/fonts.ts (imported by the root layout) so the other apps do not download
// them until they migrate. Inter and Inter Tight are variable fonts; Instrument Serif is used only in
// italic, at its one weight.
// Source: node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md
// ("Using a font definitions file")
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: "italic",
  subsets: ["latin"],
});

/** The CSS variables for the three families, for the element that carries `theme-forest`. */
export const forestFontVariables = `${interTight.variable} ${inter.variable} ${instrumentSerif.variable}`;
