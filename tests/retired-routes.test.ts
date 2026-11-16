import { describe, expect, it } from "vitest";
import nextConfig, { retiredRedirects } from "../next.config";

// The customer's account page is gone: the account item in the navigation opens a menu with the name
// and the log-out action instead. Old bookmarks and links still land somewhere useful.

describe("retired routes", () => {
  it("sends the old account page to the customer home, in both languages", async () => {
    const rules = (await nextConfig.redirects?.()) ?? [];
    expect(rules).toEqual(retiredRedirects);
    expect(retiredRedirects).toEqual([
      { source: "/account", destination: "/home", permanent: false },
      { source: "/en/account", destination: "/en/home", permanent: false },
    ]);
  });
});
