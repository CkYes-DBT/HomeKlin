import { splitDuration } from "./customer-duration";

// How long a service takes, as an estimate in words for the admin services list (R3): "Sekitar 2 jam",
// "Sekitar 1 jam 30 menit", "Sekitar 45 menit" (messages AdminServicesPage.duration in src/messages).

/** A translator for the AdminServicesPage.duration messages (next-intl's, on the server or in a test). */
export type DurationTranslator = (
  key: "hours" | "minutes" | "hoursMinutes",
  values: { hours: number; minutes: number },
) => string;

export function aboutDuration(totalMinutes: number, t: DurationTranslator): string {
  const { hours, minutes } = splitDuration(totalMinutes);
  const key = hours === 0 ? "minutes" : minutes === 0 ? "hours" : "hoursMinutes";
  return t(key, { hours, minutes });
}
