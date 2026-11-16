import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The customer pages' floating language switch (customer layout): the layout holds it, the app bar no
// longer does, and its place respects the phone's safe-area insets. The behaviour is in
// e2e/language-floating.spec.ts; this keeps the wiring from drifting.
const read = (path: string) => readFileSync(path, "utf8");

describe("floating language switch", () => {
  it("is rendered by the customer layout, which keeps the room for it under the page", () => {
    const layout = read("src/app/[locale]/(customer)/layout.tsx");
    expect(layout).toContain("<FloatingLanguageSwitch />");
    expect(layout).toContain("floatingControl");
  });

  it("is left out of the customer app bar, and kept in the cleaner's", () => {
    const header = read("src/components/shell/app-header.tsx");
    expect(header).toContain('nav === "customer" ? null : <LanguageSwitch');
  });

  it("is placed with the safe-area insets and above the phone's bottom bar", () => {
    const css = read("src/app/globals.css");
    const corner = css.slice(css.indexOf("@utility float-corner"));
    expect(corner).toContain("env(safe-area-inset-left)");
    expect(corner).toContain("env(safe-area-inset-bottom)");
    expect(corner).toContain("var(--spacing-bottom-nav)");
  });
});
