"use client";

import { useEffect, useRef, type HTMLAttributes } from "react";

/**
 * A block that takes the cursor when it appears (tabIndex -1: focusable by script, not a Tab stop).
 * The back office's success notice uses it after a save (Notice focus), so a screen reader reads what
 * was done at once, instead of the cursor falling back to the start of the page.
 */
export function FocusOnMount(props: HTMLAttributes<HTMLDivElement>) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
  }, []);
  return <div ref={box} tabIndex={-1} {...props} />;
}
