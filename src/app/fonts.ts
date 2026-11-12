import { Bricolage_Grotesque, Figtree } from "next/font/google";

// The apps' two families (T3b; see the Token mapping in markdown/design.md), loaded once for the root
// layout. The redesign's fonts are in src/app/fonts-forest.ts, loaded only by the pages that opt in
// to `.theme-forest` (the landing page and the admin console). Both are variable fonts, so no weights
// are listed.
// Bricolage Grotesque also loads its optical-size axis: large headings get the display cut.
// Source: node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md
// ("Using a font definitions file")
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin", "latin-ext"],
});

/** The CSS variables for both families, for the <html> element. */
export const appFontVariables = `${bricolage.variable} ${figtree.variable}`;
