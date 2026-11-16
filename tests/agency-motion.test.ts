import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collapseExitMilliseconds, toastExitMilliseconds } from "@/components/agency/use-presence";

// The partner back office's motion (src/components/agency/motion.css): fast and quiet. Every
// transition and animation stays at 300 ms or less, so clicks in the e2e suite are never slowed, except
// the live dot's slow breathing loop; and the reduced-motion block stops the loop and every movement.
// The e2e spec (e2e/agency-back-office.desktop.spec.ts) checks the same in a real browser.

const css = readFileSync(fileURLToPath(new URL("../src/components/agency/motion.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const reducedStart = css.indexOf("@media (prefers-reduced-motion: reduce)");
const normal = css.slice(0, reducedStart);
const reduced = css.slice(reducedStart);

/** Every time value in a block of CSS, in milliseconds. */
function durations(block: string): number[] {
  return [...block.matchAll(/(?<![\w-])(\d*\.?\d+)(ms|s)\b/g)].map(([, value, unit]) => Number(value) * (unit === "s" ? 1000 : 1));
}

/** The declarations of every rule whose selector mentions the class. */
function rulesOf(block: string, name: string): string {
  return [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => new RegExp(`\\.${name}\\b`).test(selector))
    .map(([, , body]) => body)
    .join("\n");
}

describe("partner motion", () => {
  it("has a reduced-motion path", () => {
    expect(reducedStart).toBeGreaterThan(0);
  });

  it("keeps every transition and animation at 300 ms or less, except the live dot's loop", () => {
    const loop = rulesOf(normal, "partner-live-dot");
    const others = normal
      .split(/\n(?=\S)/)
      .filter((chunk) => !/\.partner-live-dot\b/.test(chunk))
      .join("\n");
    expect(durations(others).length).toBeGreaterThan(0);
    expect(Math.max(...durations(others))).toBeLessThanOrEqual(300);
    expect(durations(loop)).toContain(2400);
    expect(Math.max(...durations(reduced))).toBeLessThanOrEqual(300);
  });

  it("closes faster than it opens", () => {
    const open = durations(rulesOf(normal, "partner-collapse"));
    expect(Math.min(...open)).toBeLessThan(Math.max(...open));
    expect(collapseExitMilliseconds).toBeLessThan(Math.max(...open));
    expect(toastExitMilliseconds).toBeLessThan(Math.max(...durations(rulesOf(normal, "partner-toast"))));
  });

  it("uses the confident ease-out for the messages", () => {
    expect(css).toMatch(/cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/);
  });

  it("stops the live dot's breathing and every movement under reduced motion", () => {
    expect(rulesOf(reduced, "partner-live-dot")).toMatch(/animation:\s*none\s*!important/);
    // What still runs under reduced motion fades; nothing moves or scales.
    const kept = [...reduced.matchAll(/animation-name:\s*([\w-]+)/g)].map(([, name]) => name);
    expect(kept.length).toBeGreaterThan(0);
    for (const name of kept) {
      const keyframes = css.match(new RegExp(`@keyframes\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
      expect(keyframes).toMatch(/opacity/);
      expect(keyframes).not.toMatch(/transform|translate|scale/);
    }
  });
});
