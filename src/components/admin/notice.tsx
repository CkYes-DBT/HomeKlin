import { CircleAlert, CircleCheck } from "lucide-react";
import { FocusOnMount } from "./focus-on-mount";

type NoticeProps = {
  /** success: a change was saved; danger: something could not be done. */
  tone: "success" | "danger";
  /** The fact in a few words, in bold. */
  title: string;
  /** What it means, or what to do next. */
  children: string;
  /**
   * Takes the cursor when it appears, so a screen reader reads it at once: for the notice that ends an
   * action (a saved service), where the form the cursor was in has just closed. Give it a new key for
   * each answer so it takes the cursor again.
   */
  focus?: boolean;
};

const tones = {
  success: { box: "bg-success-surface text-success", Icon: CircleCheck, role: "status" },
  danger: { box: "bg-danger-surface text-danger", Icon: CircleAlert, role: "alert" },
} as const;

// A one-line message at the top of a back-office page, with an icon and words, never colour alone.
export function Notice({ tone, title, children, focus = false }: NoticeProps) {
  const { box, Icon, role } = tones[tone];
  const Box = focus ? FocusOnMount : "div";
  return (
    <Box role={role} className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm ${box}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-semibold">{title}</span> {children}
      </p>
    </Box>
  );
}
