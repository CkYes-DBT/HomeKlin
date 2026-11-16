import { ArrowLeft, Clock, MessageCircle, Video, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { forestFontVariables } from "@/app/fonts-forest";
import { Wordmark } from "@/components/brand/wordmark";
import { LanguageSwitch } from "@/components/shell/language-switch";
import { SkipLink } from "@/components/shell/skip-link";
import { ClientMessages } from "@/i18n/client-messages";
import { Link } from "@/i18n/navigation";

// Sign-in (T5, T9b; the SignIn and Phone-SignIn mocks): one task per screen, so no app navigation.
// Inside `theme-forest` with the redesign's fonts, like the landing page and the apps. From 1024 px a
// dark forest panel on the left (the wordmark, "Satu pintu untuk semua akun HomeKlin", a lead and three
// facts) and, on the right, "Kembali ke beranda", the language switch and the page's card. Below
// 1024 px the panel folds into the slim bar (wordmark, language switch), the back link and the heading
// above the card. Every role signs in here, so the wordmark and the back link lead to the landing page
// rather than to one role's home. /signup shares this group but only redirects to /pesan. The forms are
// client components; they get the Auth messages from here, and nothing else.
export default function AuthLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("AuthShell");
  const tagline = t.rich("tagline", { accent: (chunks) => <span className="serif-accent">{chunks}</span> });
  const features: { Icon: LucideIcon; label: string }[] = [
    { Icon: Video, label: t("featureLive") },
    { Icon: Clock, label: t("featureRecordings") },
    { Icon: MessageCircle, label: t("featureHelp") },
  ];

  return (
    <ClientMessages namespaces={["Auth", "AuthLogin", "CodeEntry"]}>
      <div className={`theme-forest ${forestFontVariables} flex flex-1 flex-col bg-canvas font-sans text-ink lg:flex-row`}>
        <SkipLink />

        <aside
          aria-label={t("panelLabel")}
          className="on-dark-focus hidden flex-col justify-between gap-8 bg-band px-12 py-10 text-on-band lg:flex lg:w-120 lg:shrink-0 xl:w-140 xl:px-14"
        >
          <Link href="/" aria-label={t("homeLink")} className="inline-flex min-h-touch items-center self-start rounded-sm">
            <Wordmark palette="forest" onDark />
          </Link>
          <div className="flex flex-col gap-5">
            <p className="font-display text-headline-md font-semibold text-on-band">
              <span className="[&>.serif-accent]:text-lime">{tagline}</span>
            </p>
            <p className="max-w-105 text-body-lg text-on-band-muted">{t("lead")}</p>
          </div>
          <ul className="flex flex-col gap-3.5">
            {features.map(({ Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-body text-on-band">
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-band-raised text-lime">
                  <Icon className="size-5" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex min-h-16 items-center justify-between gap-3 px-gutter py-2 lg:px-14 lg:pt-8 lg:pb-0">
            <Link href="/" aria-label={t("homeLink")} className="inline-flex min-h-touch items-center rounded-sm lg:hidden">
              <Wordmark palette="forest" />
            </Link>
            <BackLink label={t("back")} className="hidden lg:inline-flex" />
            <LanguageSwitch palette="forest" />
          </header>
          <main
            id="konten"
            tabIndex={-1}
            className="flex flex-1 flex-col gap-5 px-gutter pt-2 pb-8 outline-none lg:justify-center lg:px-14 lg:py-10"
          >
            <div className="flex flex-col gap-5 lg:hidden">
              <BackLink label={t("back")} className="inline-flex self-start" />
              <p className="font-display text-headline-sm font-semibold text-ink">
                <span className="[&>.serif-accent]:text-primary">{tagline}</span>
              </p>
            </div>
            {children}
          </main>
        </div>
      </div>
    </ClientMessages>
  );
}

function BackLink({ label, className }: { label: string; className: string }) {
  return (
    <Link
      href="/"
      className={`${className} min-h-touch items-center gap-2 rounded-sm font-semibold text-primary underline decoration-1 underline-offset-4 transition-colors duration-150 ease-out-quart hover:decoration-2 active:text-band`}
    >
      <ArrowLeft className="size-4.5 shrink-0" aria-hidden="true" />
      {label}
    </Link>
  );
}
