import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl finds src/i18n/request.ts by itself. createMessagesDeclaration writes
// src/messages/id.d.json.ts (git-ignored) on dev, build and typegen, which gives TypeScript the exact
// Indonesian messages, so a wrong ICU argument in t() is a type error too, not only a wrong key.
// Source: https://next-intl.dev/docs/workflows/typescript
const withNextIntl = createNextIntlPlugin({
  experimental: { createMessagesDeclaration: "./src/messages/id.json" },
});

// Security headers on every response (T34 security review, M1). No other site may frame HomeKlin, so a
// signed-in admin or cleaner cannot be tricked into clicking a framed button (clickjacking). A full
// script-src CSP with nonces is not set: it needs every inline script of Next.js and next-intl nonced,
// and is logged as a follow-up in markdown/Progress.md.
// Source: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md
export const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
];

// The customer's account page is retired: "Akun" in the navigation opens a menu with the name and the
// log-out action. The old address, and the bookmarks and links that point to it, go to the customer home
// in the same language (temporary, so the address can be used again later).
// Source: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/redirects.md
export const retiredRedirects = [
  { source: "/account", destination: "/home", permanent: false },
  { source: "/en/account", destination: "/en/home", permanent: false },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  async redirects() {
    return retiredRedirects;
  },
  async headers() {
    // The private order link (/o/<token>, /en/o/<token>) carries its token in the address, so it never
    // sends a Referer; a later rule overrides the same header of an earlier one.
    const noReferrer = [{ key: "Referrer-Policy", value: "no-referrer" }];
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/o/:token", headers: noReferrer },
      { source: "/:locale/o/:token", headers: noReferrer },
    ];
  },
  partialPrefetching: true,
  experimental: {
    // An agency uploads a cleaner's photo of up to 2 MB through a Server Action (addCleaner); the
    // default 1 MB body limit would refuse it. The room above 2 MB is for the form's other fields and
    // the multipart overhead. Source: node_modules/next/dist/docs/01-app/02-guides/server-actions.md
    serverActions: { bodySizeLimit: "3mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
