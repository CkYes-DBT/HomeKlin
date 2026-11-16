"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useState } from "react";
import { toastExitMilliseconds, usePresence } from "./use-presence";

type ActionFeedbackProps = {
  /** The refusal, in words, or nothing. */
  error?: string;
  /** What was done, in words, or nothing. */
  done?: string;
  /** Changes with every answer from the server, so the same message said twice is announced twice. */
  resultKey: number;
  /** compact: under a list row; roomy: under a form. */
  size?: "compact" | "roomy";
};

type Message = { tone: "error" | "done"; text: string };

const sizes = {
  compact: "gap-1.5 text-xs",
  roomy: "gap-2.5 rounded-md px-4 py-3 text-sm",
};

// The answer to a back-office action (T27, T28): a refusal in an alert region, a success in a status
// region. Both regions are always on the page and empty until there is something to say, so a screen
// reader announces what is put into them. Icon and words, never colour alone. Each answer slides in
// (motion.css, .partner-toast); when the answer goes, its words stay for the 150 ms fade-out, marked
// data-leaving, and nothing new is announced. Focus never moves.
export function ActionFeedback({ error, done, resultKey, size = "roomy" }: ActionFeedbackProps) {
  const current: Message | null = error ? { tone: "error", text: error } : done ? { tone: "done", text: done } : null;
  const [last, setLast] = useState(current);
  if (current && (current.tone !== last?.tone || current.text !== last.text)) setLast(current);
  const { mounted, leaving } = usePresence(current !== null, toastExitMilliseconds);
  const shown = current ?? (mounted ? last : null);

  const box = sizes[size];
  const tone = (surface: string) => (size === "roomy" ? surface : "");
  const message = (Icon: typeof CircleAlert, colour: string, surface: string, text: string) => (
    <p key={resultKey} data-leaving={leaving || undefined} className={`flex items-start font-medium ${colour} ${box} ${tone(surface)} partner-toast`}>
      <Icon className="mt-px size-4 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
  // While there is nothing to say, the regions stay on the page but out of the flow (sr-only is
  // absolutely positioned), so they add no height and no gap to the form around them.
  return (
    <div className={shown ? undefined : "sr-only"}>
      <div role="alert" aria-atomic="true">
        {shown?.tone === "error" ? message(CircleAlert, "text-danger", "bg-danger-surface", shown.text) : null}
      </div>
      <div role="status" aria-atomic="true">
        {shown?.tone === "done" ? message(CircleCheck, "text-success", "bg-success-surface", shown.text) : null}
      </div>
    </div>
  );
}
