import { getLocale } from "next-intl/server";
import { Suspense } from "react";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { redirect } from "@/i18n/navigation";

// The page of its own for adding a service is gone (R6): a service is added in place on the list. A
// bookmark of /admin/services/new (or /en/...) leads to /admin/services?new, which opens the empty
// create panel, in the same language. As at /admin, the redirect sits inside the page's own role check
// (tests/protected-pages.test.ts), so only an admin is sent on; everyone else is turned away first.
// RoleGate reads the session, so it streams behind <Suspense> and Next.js sends the redirect as a meta
// tag in the stream (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md).
export default function RetiredNewServicePage() {
  return (
    <Suspense fallback={<GateFallback />}>
      <RoleGate roles={["admin"]}>
        <ToCreatePanel />
      </RoleGate>
    </Suspense>
  );
}

async function ToCreatePanel(): Promise<never> {
  const locale = await getLocale();
  return redirect({ href: "/admin/services?new", locale });
}
