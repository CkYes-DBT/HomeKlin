import { Video } from "lucide-react";
import { useTranslations } from "next-intl";

// One fact under the title of steps 1 and 2 (the booking-flow fixes, 2026-11-16): who comes and who can
// watch. Before, it was a grey note under the summary's button, far below the fold on a phone. Plain
// fact, the same words as the stream facts on step 2 ("Hanya Anda dan tim pemantau HomeKlin").
export function BookingTrust() {
  const t = useTranslations("BookingTrust");
  return (
    <p className="flex max-w-prose items-start gap-2.5 text-sm font-medium text-ink md:text-base">
      <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lime-wash text-on-lime-wash">
        <Video className="size-4" />
      </span>
      <span className="pt-0.5 md:pt-px">{t("line")}</span>
    </p>
  );
}
