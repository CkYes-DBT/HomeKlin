import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { SignOutButton } from "./sign-out-button";
import { UserAvatar } from "./user-avatar";

type AccountSummaryProps = {
  /** page: the account page's card. sidebar: the back office's sidebar and narrow-screen menu. */
  variant?: "page" | "sidebar";
  /** sidebar only. forest: on the redesign's dark band (the admin console, Phase 13). */
  tone?: "default" | "forest";
};

// Who is signed in, and the way out (T5): the account area of every shell. Reads the session, so it
// sits inside <Suspense>; on a protected page it sits inside <RoleGate> as well.
export async function AccountSummary({ variant = "page", tone = "default" }: AccountSummaryProps) {
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations("AccountSummary")]);
  if (!user) return null;
  const name = user.fullName.trim() || t("noName");

  // On the dark band: the lime-wash initials (9.9:1), the name in on-band (13.6:1 on band) and "Keluar"
  // as an underlined text button under it. "Masuk sebagai" stays for screen readers only. The name (20)
  // and the link's text (20) with 4 px between fill exactly the 44 px avatar; the link's 44 px hit area
  // reaches past its text without adding height.
  if (variant === "sidebar" && tone === "forest") {
    return (
      <div className="flex items-center gap-3">
        <UserAvatar name={user.fullName} size="touch" palette="forest" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-sm font-semibold text-on-band">
            <span className="sr-only">{t("signedInAs")} </span>
            {name}
          </p>
          <SignOutButton look="linkOnDark" />
        </div>
      </div>
    );
  }

  if (variant === "sidebar") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <UserAvatar name={user.fullName} size="md" />
          <p className="flex min-w-0 flex-col">
            <span className="text-xs text-ink-muted">{t("signedInAs")}</span>
            <span className="truncate text-sm font-semibold text-ink">{name}</span>
          </p>
        </div>
        <SignOutButton />
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-card p-5 md:p-6">
      <div className="flex items-center gap-4">
        <UserAvatar name={user.fullName} size="lg" palette="forest" />
        <p className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm text-ink-muted">{t("signedInAs")}</span>
          <span className="font-display text-xl font-semibold break-words text-ink">{name}</span>
        </p>
      </div>
      <div className="mt-5 border-t border-border pt-5">
        <SignOutButton className="w-full sm:w-fit" look="outline" />
      </div>
    </div>
  );
}
