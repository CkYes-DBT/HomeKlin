import Image from "next/image";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { initialsOf } from "@/components/auth/user-avatar";
import { getCurrentUser } from "@/lib/auth/dal";
import { getServiceAreas } from "@/lib/catalog/cached";
import { getMyCleanerProfile } from "@/lib/jobs/jobs";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { localPhone } from "./cleaner-views";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** What the home and account pages show about the signed-in cleaner. */
export type CleanerCardData = { name: string; photoUrl: string | null; phone: string | null; areaName: string | null };

// The signed-in cleaner as the home and account pages show them (D4, mocks Cleaner-Home and
// Cleaner-Account): the name from my_cleaner_profile (B11) or, for an account without a cleaner row,
// from the profile; the phone and work area the agency set, or null until it does. Reads with the
// cleaner's own session, so it only ever returns their own details. A failed read throws (JobsError).
export async function readCleanerCard(client: ServerClient, locale: Locale): Promise<CleanerCardData> {
  const [user, profile, areas, t] = await Promise.all([
    getCurrentUser(),
    getMyCleanerProfile(client),
    getServiceAreas(),
    getTranslations("CleanerProfile"),
  ]);
  const name = profile?.fullName.trim() || user?.fullName.trim() || t("noName");
  const area = profile?.areaId ? areas.find((candidate) => candidate.id === profile.areaId) : undefined;
  return {
    name,
    photoUrl: profile?.photoUrl ?? null,
    phone: localPhone(profile?.phone ?? null),
    areaName: area?.name[locale] ?? null,
  };
}

// The profile card: a 64 px photo (or initials on lime wash), the name, "Petugas HomeKlin" and the
// phone and area on one line. Without either, one quiet line says the agency fills them in.
export async function CleanerProfileCard({ card, headingId }: { card: CleanerCardData; headingId: string }) {
  const t = await getTranslations("CleanerProfile");
  const details = [card.phone, card.areaName].filter(Boolean).join(", ");
  return (
    <section aria-labelledby={headingId} className="flex items-center gap-3.5 rounded-lg bg-card p-4">
      <CleanerPhoto name={card.name} photoUrl={card.photoUrl} alt={t("photoAlt", { name: card.name })} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id={headingId} className="font-display text-xl font-semibold break-words text-ink">
          {card.name}
        </h2>
        <p className="text-sm text-ink-muted">{t("role")}</p>
        <p className="text-sm text-ink-muted tabular-nums">{details || t("noDetails")}</p>
      </div>
    </section>
  );
}

function CleanerPhoto({ name, photoUrl, alt }: { name: string; photoUrl: string | null; alt: string }) {
  if (!photoUrl) {
    return (
      <span
        aria-hidden="true"
        className="flex size-16 shrink-0 items-center justify-center rounded-full bg-lime-wash font-display text-2xl font-semibold text-on-lime-wash"
      >
        {initialsOf(name)}
      </span>
    );
  }
  return (
    <Image
      src={photoUrl}
      width={128}
      height={128}
      alt={alt}
      sizes="64px"
      // The site's own photos (/images/...) are optimised; an uploaded photo (https) is shown as it is.
      unoptimized={!photoUrl.startsWith("/")}
      className="size-16 shrink-0 rounded-full bg-sunken object-cover"
    />
  );
}
