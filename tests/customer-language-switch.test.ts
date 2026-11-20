import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The customer pages' language switch sits in the top app bar, as on the cleaner app (UX audit,
// 2026-11-18, item 3): from 16 Nov it floated at the bottom-left of every customer page and covered
// content (the live card's "Lihat pesanan", the payment step). The behaviour is in
// e2e/language-customer-bar.spec.ts; this keeps the wiring from drifting back.
const read = (path: string) => readFileSync(path, "utf8");

describe("customer language switch", () => {
  it("is in the app bar for the customer and the cleaner alike", () => {
    const header = read("src/components/shell/app-header.tsx");
    expect(header).toContain("<LanguageSwitch palette={palette} />");
    expect(header).not.toContain('nav === "customer" ? null : <LanguageSwitch');
  });

  it("no longer floats: the customer layout holds no switch of its own", () => {
    const layout = read("src/app/[locale]/(customer)/layout.tsx");
    expect(layout).not.toContain("FloatingLanguageSwitch");
    expect(layout).not.toContain("floatingControl");
    expect(existsSync("src/components/shell/floating-language-switch.tsx")).toBe(false);
    expect(read("src/app/globals.css")).not.toContain("@utility float-corner");
  });
});
