import { NextResponse, type NextRequest } from "next/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { signInWithOrderLink } from "@/lib/orders/order-link-sign-in";

// /o/<token> and /en/o/<token>: the private link in the order emails (B14a). A working link signs the
// customer in and opens their full order page, /orders?order=<id>, with the live view and the recording
// (src/lib/orders/order-link-sign-in.ts). A wrong, cancelled or expired link, or one the database cannot
// read just now, leads to the sign-in page with a notice, so the customer can sign in with an emailed
// code instead; it says nothing about any order. The session cookies set while signing in go out with
// the redirect. Never cached, and the token never leaves in a Referer header.
// Source: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md ("Cookies")

const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  const prefix = hasLocale(routing.locales, locale) && locale !== routing.defaultLocale ? `/${locale}` : "";

  let orderId: string | null = null;
  try {
    orderId = await signInWithOrderLink(token);
  } catch (error) {
    console.error("[order link] could not sign in with a link:", error);
  }

  const target = orderId
    ? new URL(`${prefix}/orders?order=${orderId}`, request.url)
    : new URL(`${prefix}/login?tautan=tidak-berlaku&next=%2Forders`, request.url);
  const response = NextResponse.redirect(target, 303);
  for (const [name, value] of Object.entries(noStore)) response.headers.set(name, value);
  return response;
}
