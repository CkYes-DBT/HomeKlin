import { getLocale } from "next-intl/server";
import { Suspense } from "react";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { redirect } from "@/i18n/navigation";

// The page of its own for changing a service is gone (R6): each row of the list opens its form in
// place. A bookmark of /admin/services/edit?id=<id> (or /en/...) leads to the list in the same
// language, whatever the id; the row is one click away. The id is not read, so nothing is looked up.
// As at /admin, the redirect sits inside the page's own role check (tests/protected-pages.test.ts), so
// only an admin is sent on; everyone else is turned away first. RoleGate reads the session, so it
// streams behind <Suspense> and Next.js sends the redirect as a meta tag in the stream
// (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md).
export default function RetiredEditServicePage() {
  return (
    <Suspense fallback={<GateFallback />}>
      <RoleGate roles={["admin"]}>
        <ToServicesList />
      </RoleGate>
    </Suspense>
  );
}

async function ToServicesList(): Promise<never> {
  const locale = await getLocale();
  return redirect({ href: "/admin/services", locale });
}
