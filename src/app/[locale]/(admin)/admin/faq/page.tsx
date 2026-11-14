import type { Metadata } from "next";
import { BookOpen, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { cache, Suspense } from "react";
import { FaqList } from "@/components/admin/faq-list";
import { Notice } from "@/components/admin/notice";
import { GateFallback } from "@/components/auth/gate-fallback";
import { RoleGate } from "@/components/auth/role-gate";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ClientMessages } from "@/i18n/client-messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listAllFaq, nextFaqOrder } from "@/lib/support/faq-admin";
import { SupportError } from "@/lib/support/support";
import { parseFaqId, type AdminFaqEntry, type FaqFormValues } from "@/lib/validation/faq";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminFaqPage");
  return { title: t("title") };
}

type SearchParams = PageProps<"/[locale]/admin/faq">["searchParams"];

// HomeKlin's FAQ for admin (D1, the user's mock "Admin-Faq"; SPEC: admin manages the FAQ), admins only
// (T5). The title is prerendered; the counts, "Tambah pertanyaan" and the list render inside the page's
// own role checks (a layout's check would not protect them) and are read with the signed-in admin's
// own client, so row-level security decides what it may see: every entry, published or draft. Each
// row opens its edit form in place; ?new opens an empty form above the rows. After a save the action
// comes back with ?created= or ?saved= and the entry's id; the notice says what was done and takes the
// cursor. Customers see the change on the help page at once (the actions expire the FAQ cache tag).
export default function AdminFaqPage({ searchParams }: PageProps<"/[locale]/admin/faq">) {
  const t = useTranslations("AdminFaqPage");
  return (
    <>
      <PageHeader
        size="compact"
        title={t("title")}
        description={
          <Suspense fallback={t("description")}>
            <RoleGate roles={["admin"]}>
              <FaqCounts />
            </RoleGate>
          </Suspense>
        }
        action={
          <Suspense fallback={<GateFallback variant="action" />}>
            <RoleGate roles={["admin"]}>
              <ButtonLink href="/admin/faq?new" variant="forest" circleIcon={Plus}>
                {t("add")}
              </ButtonLink>
            </RoleGate>
          </Suspense>
        }
      />
      <Suspense fallback={<GateFallback />}>
        <RoleGate roles={["admin"]}>
          <AdminFaqContent searchParams={searchParams} />
        </RoleGate>
      </Suspense>
    </>
  );
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// Read once per request: the counts and the list share it.
const readEntries = cache(async (): Promise<AdminFaqEntry[] | null> => {
  try {
    return await listAllFaq(await createSupabaseServerClient({ writeCookies: false }));
  } catch (error) {
    // Only a failed read becomes a message; anything else (such as Next.js' own signals) goes on.
    if (!(error instanceof SupportError)) throw error;
    console.error("[faq] could not read the entries:", error);
    return null;
  }
});

/** "Pertanyaan dan jawaban ... 6 dipublikasikan, 1 draf." */
async function FaqCounts() {
  const [t, entries] = await Promise.all([getTranslations("AdminFaqPage"), readEntries()]);
  if (!entries) return <>{t("description")}</>;
  const published = entries.filter((entry) => entry.isPublished).length;
  return (
    <>
      {t("description")} <span data-testid="faq-counts">{t("counts", { published, drafts: entries.length - published })}</span>
    </>
  );
}

async function AdminFaqContent({ searchParams }: { searchParams: SearchParams }) {
  const [t, locale, params, entries] = await Promise.all([getTranslations("AdminFaqPage"), getLocale(), searchParams, readEntries()]);
  if (!entries) {
    return (
      <Notice tone="danger" title={t("loadErrorTitle")}>
        {t("loadErrorBody")}
      </Notice>
    );
  }
  // New for every render of the list, so each save draws every panel anew (services-list.tsx).
  const renderId = crypto.randomUUID();

  const createdId = parseFaqId(first(params.created));
  const savedId = parseFaqId(first(params.saved));
  const changed = entries.find((entry) => entry.id === (createdId ?? savedId));
  const create: FaqFormValues | undefined =
    params.new === undefined
      ? undefined
      : { id: "", questionId: "", questionEn: "", answerId: "", answerEn: "", keywords: "", sortOrder: String(nextFaqOrder(entries)), isPublished: false };

  return (
    <>
      {changed ? (
        <Notice
          key={renderId}
          focus
          tone="success"
          title={t(createdId ? "notice.created" : "notice.saved", { question: locale === "en" ? changed.question.en : changed.question.id })}
        >
          {changed.isPublished ? t("notice.live") : t("notice.hidden")}
        </Notice>
      ) : null}
      {entries.length === 0 && !create ? (
        <EmptyState tone="forest" icon={BookOpen} title={t("emptyTitle")}>
          {t("emptyBody")}
        </EmptyState>
      ) : (
        <ClientMessages namespaces={["AdminFaqForm"]}>
          <FaqList entries={entries} create={create} renderId={renderId} />
        </ClientMessages>
      )}
    </>
  );
}
