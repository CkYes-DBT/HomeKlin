import { unstable_rethrow } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ClientMessages } from "@/i18n/client-messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CleanerProfileCard, readCleanerCard, type CleanerCardData } from "./cleaner-profile";
import { LocationPermission } from "./location-permission";
import { ReadFailed } from "./read-failed";

// The cleaner's account page /cleaner/account (D4, mock Cleaner-Account), inside the page's role check:
// the profile card (the cleaner's own details, B11), the settings the app has (the page's language,
// changed with the switch in the bar, and whether the browser lets check-in read the location), and
// "Keluar". The mock's job notifications and its chat with HomeKlin's admin have no backend for
// cleaners, so they are left out (docs/redesign-gaps.md, Cleaner).
export async function CleanerAccountContent() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("CleanerAccountPage")]);
  const client = await createSupabaseServerClient({ writeCookies: false });

  let card: CleanerCardData | null = null;
  try {
    card = await readCleanerCard(client, locale);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[cleaner] could not read the profile:", error);
  }

  return (
    <>
      {card ? (
        <CleanerProfileCard card={card} headingId="account-profile" />
      ) : (
        <ReadFailed title={t("errorTitle")} body={t("errorBody")} retry={t("retry")} />
      )}
      <section aria-labelledby="cleaner-settings" className="flex flex-col rounded-lg bg-card px-4 py-2">
        <h2 id="cleaner-settings" className="sr-only">
          {t("settings")}
        </h2>
        <dl className="flex flex-col divide-y divide-border">
          <SettingRow term={t("language")}>
            <span className="text-sm text-ink-muted">{t("languageValue")}</span>
          </SettingRow>
          <SettingRow term={t("location")}>
            <ClientMessages namespaces={["CleanerPermission"]}>
              <LocationPermission />
            </ClientMessages>
          </SettingRow>
        </dl>
      </section>
      <SignOutButton look="outline" />
    </>
  );
}

function SettingRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 py-2">
      <dt className="text-body font-medium text-ink">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}
