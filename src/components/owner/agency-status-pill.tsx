import { CircleCheck, CirclePause } from "lucide-react";
import { StatusPill } from "@/components/back-office/status-pill";

type AgencyStatusPillProps = {
  status: "active" | "suspended";
  /** "Aktif" or "Ditangguhkan", in the page's language. */
  label: string;
};

// The mock Owner-Partners: active on the success wash, suspended on the danger wash.
const tones = {
  active: { pill: "bg-success-surface text-success", Icon: CircleCheck },
  suspended: { pill: "bg-danger-surface text-danger", Icon: CirclePause },
} as const;

// A partner agency's status on the owner pages (T29b, T29c; D3): an icon and a word, never colour alone.
export function AgencyStatusPill({ status, label }: AgencyStatusPillProps) {
  const { pill, Icon } = tones[status];
  return <StatusPill Icon={Icon} pill={pill} label={label} />;
}
