import { describe, expect, it } from "vitest";
import nextConfig, { securityHeaders } from "../next.config";

// The security headers (T34 security review, M1): no other site may frame HomeKlin, and the browser
// must not guess content types.

describe("security headers", () => {
  it("are sent on every path", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const noReferrer = [{ key: "Referrer-Policy", value: "no-referrer" }];
    expect(rules).toEqual([
      { source: "/:path*", headers: securityHeaders },
      // The private order link carries its token in the address: it never sends a Referer.
      { source: "/o/:token", headers: noReferrer },
      { source: "/:locale/o/:token", headers: noReferrer },
    ]);
  });

  it("forbid framing and content sniffing", () => {
    const value = (key: string) => securityHeaders.find((header) => header.key === key)?.value;
    expect(value("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(value("X-Frame-Options")).toBe("DENY");
    expect(value("X-Content-Type-Options")).toBe("nosniff");
  });
});
