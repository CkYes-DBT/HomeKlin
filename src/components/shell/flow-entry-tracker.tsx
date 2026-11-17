"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { usePathname } from "@/i18n/navigation";
import { stripLocale } from "@/lib/auth/roles";
import { lastVisit, recordVisit } from "./flow-memory";

/** An address as the flow records it: the path without the language prefix, with the query. */
function hrefOf(url: URL): string {
  return `${stripLocale(url.pathname)}${url.search}`;
}

/** The page of this site the document was opened from (a full load inside the site), or null. */
function siteReferrer(): string | null {
  try {
    const referrer = new URL(document.referrer);
    return referrer.origin === window.location.origin ? hrefOf(referrer) : null;
  } catch {
    return null;
  }
}

/**
 * The address this document was loaded at (the Navigation Timing entry keeps it). This component
 * renders in the browser only once its part of the page has hydrated, so a quick click can leave that
 * first page before it is recorded.
 */
function documentHref(): string {
  const [entry] = performance.getEntriesByType("navigation");
  return hrefOf(new URL(entry?.name || window.location.href));
}

let firstOfDocument = true;

// Remembers each page the customer opens in this tab (./flow-memory.ts), so the booking flow's
// "Kembali" on step 1 knows where they came from. Every page has it (the root layout), because the flow
// can be entered from the landing page, the customer app or a help page. It renders nothing. It reads
// the query, so the root layout wraps it in <Suspense>: on a prerendered page only this empty
// component renders in the browser, and the rest of the page stays prerendered.
// The first page of a document continues the visit when it was opened from a page of this site (the
// tab's last record, or the referrer), and starts it afresh otherwise.
// Source: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md
// ("Prerendering")
export function FlowEntryTracker() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => {
    const href = query ? `${pathname}?${query}` : pathname;
    if (firstOfDocument) {
      firstOfDocument = false;
      const referrer = siteReferrer();
      const before = referrer === null ? null : (lastVisit() ?? referrer);
      const initial = documentHref();
      if (initial !== href) {
        // The customer already left the page this document opened at: record it first.
        recordVisit(initial, before);
        recordVisit(href, initial);
      } else {
        recordVisit(href, before);
      }
      return;
    }
    recordVisit(href, lastVisit());
  }, [pathname, query]);
  return null;
}
