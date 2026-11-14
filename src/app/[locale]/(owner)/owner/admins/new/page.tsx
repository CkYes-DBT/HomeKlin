import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { CreateAdminForm } from "@/components/owner/create-admin-form";
import { PageHeader } from "@/components/ui/page-header";
import { ClientMessages } from "@/i18n/client-messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("OwnerAdminNewPage");
  return { title: t("title") };
}

// "Buat akun admin" (D3, after the mock Owner-AdminNew), the owner only: name, email and an initial
// password, in one white card under a centred title. The title and the way back are prerendered; the
// form renders inside the page's own role check, and createAdmin checks the owner role on the server
// before it uses the secret key. This is still the only place an admin account is made.
export default function OwnerAdminNewPage() {
  const t = useTranslations("OwnerAdminNewPage");
  return (
    <>
      <PageHeader size="compact" align="center" title={t("title")} description={t("description")} back={{ href: "/owner/admins", label: t("back") }} />
      <Suspense fallback={<GateFallback />}>
        <RoleGate roles={["owner"]}>
          <div className="mx-auto w-full max-w-160 rounded-lg bg-card p-5 md:p-6">
            <ClientMessages namespaces={["OwnerAdminsPage"]}>
              <CreateAdminForm />
            </ClientMessages>
          </div>
        </RoleGate>
      </Suspense>
    </>
  );
}
