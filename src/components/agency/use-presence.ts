import { useEffect, useState } from "react";

/** How long a panel takes to close (motion.css, .partner-collapse[data-closing]). */
export const collapseExitMilliseconds = 180;
/** How long an action's answer takes to fade out (motion.css, .partner-toast[data-leaving]). */
export const toastExitMilliseconds = 150;

/**
 * Keeps a part on the page for its exit animation after `open` turns false, then lets it go.
 * `leaving` is true meanwhile: the caller marks the part (data-closing, inert) so it animates out and
 * can no longer be reached. Opening again during the exit keeps the same part.
 */
export function usePresence(open: boolean, exitMilliseconds: number): { mounted: boolean; leaving: boolean } {
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);

  useEffect(() => {
    if (open || !present) return;
    const timer = window.setTimeout(() => setPresent(false), exitMilliseconds);
    return () => window.clearTimeout(timer);
  }, [open, present, exitMilliseconds]);

  return { mounted: open || present, leaving: present && !open };
}
