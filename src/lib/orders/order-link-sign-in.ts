import { startSessionFor } from "@/lib/auth/code-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getOrderByLink } from "./order-link";

// The private link in the order emails signs the customer in (user decision, 2026-11-16). The customer's
// account is made when they order, and they never have a password (SPEC), so the link in their own inbox
// is enough to prove who they are, just as the emailed code is. Opening /o/<token> checks the token in the
// database (getOrderByLink: unknown, revoked, expired and malformed tokens all answer null), finds the
// order's customer, and gives the visitor that customer's session; the route then opens the full order
// page, where the live view and the recording are.
// Limits: the link only ever signs in a customer account (never staff, cleaners or agencies), it works as
// long as the token does (30 days), and the customer can cancel every link in their emails
// (revokeOrderLinks). A visitor already signed in as that customer keeps their session as it is.

/** Signs the visitor in as the customer of the link's order and answers the order id, or null for a link that signs no one in. */
export async function signInWithOrderLink(token: string): Promise<string | null> {
  const order = await getOrderByLink(token);
  if (!order) return null;

  const server = createSupabaseServiceClient();
  const { data: row, error: orderError } = await server.from("orders").select("customer_id").eq("id", order.id).maybeSingle();
  if (orderError) throw new Error(`Could not read the link's order: ${orderError.message}`);
  const customerId = (row as { customer_id: string } | null)?.customer_id;
  if (!customerId) return null;

  const { data: profile, error: profileError } = await server.from("profiles").select("role").eq("id", customerId).maybeSingle();
  if (profileError) throw new Error(`Could not read the link's account: ${profileError.message}`);
  if ((profile as { role: string } | null)?.role !== "customer") return null;

  const user = await createSupabaseServerClient({ writeCookies: true });
  const { data: claims } = await user.auth.getClaims();
  if (claims?.claims.sub === customerId) return order.id;

  const { data: account, error: accountError } = await server.auth.admin.getUserById(customerId);
  if (accountError) throw new Error(`Could not read the link's account: ${accountError.message}`);
  const email = account.user?.email;
  if (!email) return null;

  await startSessionFor(user, server, email);
  return order.id;
}
