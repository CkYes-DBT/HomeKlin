import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The customer pages' floating language switch: the customer app's layout and the booking flow's layout
// hold it, the app bar no longer does, and its place respects the phone's safe-area insets. The
// behaviour is in e2e/language-floating.spec.ts and e2e/booking-flow.spec.ts; this keeps the wiring
// from drifting.
const read = (path: string) => readFileSync(path, "utf8");
/** One `@utility` rule of globals.css, up to the next top-level at-rule. */
const utility = (css: string, name: string) => {
  const start = css.indexOf(`@utility ${name} {`);
  const end = css.indexOf("\n@", start + 1);
  return css.slice(start, end);
};

describe("floating language switch", () => {
  it("is rendered by the customer app's layout, which keeps the room for it under the page", () => {
    const layout = read("src/app/[locale]/(customer)/(app)/layout.tsx");
    expect(layout).toContain("<FloatingLanguageSwitch />");
    expect(layout).toContain("floatingControl");
  });

  it("is rendered by the booking flow's layout in its own place, with no app navigation there", () => {
    const layout = read("src/app/[locale]/(customer)/(booking)/layout.tsx");
    expect(layout).toContain('<FloatingLanguageSwitch place="flow" />');
    expect(layout).toContain("<BookingShell>");
    expect(layout).not.toContain("MobileShell");
    const shell = read("src/components/shell/booking-shell.tsx");
    expect(shell).toContain("pb-clear-switch");
  });

  it("is left out of the customer app bar, and kept in the cleaner's", () => {
    const header = read("src/components/shell/app-header.tsx");
    expect(header).toContain('nav === "customer" ? null : <LanguageSwitch');
  });

  it("is placed with the safe-area insets and above the phone's bottom bar", () => {
    const css = read("src/app/globals.css");
    const corner = utility(css, "float-corner");
    expect(corner).toContain("env(safe-area-inset-left)");
    expect(corner).toContain("env(safe-area-inset-bottom)");
    expect(corner).toContain("var(--spacing-bottom-nav)");
  });

  it("sits in the booking flow above the phone's booking bar, not above a bottom bar that is not there", () => {
    const css = read("src/app/globals.css");
    const rule = utility(css, "float-corner-flow");
    expect(rule).toContain("var(--booking-bar-height, env(safe-area-inset-bottom))");
    expect(rule).toContain("env(safe-area-inset-bottom)");
    expect(rule).not.toContain("--spacing-bottom-nav");
  });
});
