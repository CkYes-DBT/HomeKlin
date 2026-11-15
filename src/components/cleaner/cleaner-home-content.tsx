import { CircleAlert } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { firstNameOf } from "@/components/auth/user-avatar";
import { getMyJobStats, type JobStats } from "@/lib/jobs/jobs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CleanerProfileCard, readCleanerCard, type CleanerCardData } from "./cleaner-profile";
import { roundHours } from "./cleaner-views";
import { ReadFailed } from "./read-failed";

// The cleaner's home page /cleaner (D4, mock Cleaner-Home), inside the page's role check: a welcome
// with the first name, the profile card, and the summary from my_job_stats (B6): hours from check-in to
// check-out this week, jobs starting today and jobs finished this month, by Jakarta time. Every read
// uses the cleaner's own session. When the numbers cannot be read, the page still greets the cleaner and
// says so in place of the tiles.
export async function CleanerHomeContent() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("CleanerHomePage")]);
  const client = await createSupabaseServerClient({ writeCookies: false });

  let card: CleanerCardData;
  try {
    card = await readCleanerCard(client, locale);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[cleaner] could not read the profile:", error);
    return <ReadFailed title={t("errorTitle")} body={t("errorBody")} retry={t("retry")} heading="h1" />;
  }

  let stats: JobStats | null = null;
  try {
    stats = await getMyJobStats(client);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[cleaner] could not read the job numbers:", error);
  }

  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-display text-ink">
        {t.rich("welcome", {
          name: firstNameOf(card.name) || card.name,
          accent: (chunks) => <span className="serif-accent">{chunks}</span>,
        })}
      </h1>
      <CleanerProfileCard card={card} headingId="home-profile" />
      <section aria-labelledby="cleaner-summary" className="flex flex-col gap-2.5">
        <h2 id="cleaner-summary" className="font-display text-lg font-semibold text-ink">
          {t("summary")}
        </h2>
        {stats ? (
          <ul className="grid grid-cols-2 gap-2.5">
            <li className="col-span-2 flex flex-col gap-0.5 rounded-lg bg-band px-4 py-4.5">
              <span className="font-display text-fact font-semibold text-lime tabular-nums">
                {t("hours", { hours: roundHours(stats.activeHoursWeek) })}
              </span>
              <span className="text-sm text-on-band-muted">{t("hoursLabel")}</span>
            </li>
            <SmallTile value={stats.jobsToday} label={t("todayLabel")} tone="bg-lime-wash text-on-lime-wash" />
            <SmallTile value={stats.completedMonth} label={t("monthLabel")} tone="bg-success-surface text-success" />
          </ul>
        ) : (
          <p className="flex items-start gap-2.5 rounded-md bg-warning-surface px-4 py-3 text-sm text-warning">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold">{t("statsErrorTitle")}</span>
              <span>{t("statsErrorBody")}</span>
            </span>
          </p>
        )}
      </section>
    </>
  );
}

// The number in the tile's own dark colour (on-lime-wash 9.9:1, success 5.6:1 on its surface), the
// label in ink.
function SmallTile({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <li className={`flex min-w-0 flex-col gap-0.5 rounded-lg px-3 py-3.5 ${tone}`}>
      <span className="font-display text-4xl font-semibold tabular-nums">{value}</span>
      <span className="text-sm text-ink">{label}</span>
    </li>
  );
}
