import { getLocale } from "next-intl/server";
import { Suspense } from "react";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { redirect } from "@/i18n/navigation";

// The admin console has no dashboard (R2b, user 2026-11-12): /admin and /en/admin lead to live
// monitoring, the first item of the admin menu, in the same language. The redirect sits inside the
// page's own role check like every protected page (tests/protected-pages.test.ts): only an admin is
// sent on, everyone else is turned away by RoleGate first. RoleGate reads the session, so it streams
// behind <Suspense> and Next.js sends the redirect as a meta tag in the stream
// (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md).
export default function AdminPage() {
  return (
    <Suspense fallback={<GateFallback />}>
      <RoleGate roles={["admin"]}>
        <ToLiveMonitoring />
      </RoleGate>
    </Suspense>
  );
}

async function ToLiveMonitoring(): Promise<never> {
  const locale = await getLocale();
  return redirect({ href: "/admin/monitor", locale });
}
