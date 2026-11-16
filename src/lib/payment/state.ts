import type { SupabaseClient } from "@supabase/supabase-js";
import { readPaymentDetails, type PaymentDetails } from "./methods";

/**
 * What the payment step shows for a waiting order: the details of the method that was charged (the
 * account number, the QR code), or null while the customer has not chosen yet. Read with the customer's
 * own session; the database answers only for their own order. An unreadable answer is the same as none,
 * so the page then simply offers the choices again.
 */
export async function readPaymentState(client: SupabaseClient, orderId: string): Promise<PaymentDetails | null> {
  const { data, error } = await client.rpc("order_payment_state", { p_order: orderId });
  if (error) return null;
  const row = ((data ?? []) as { payment_details: unknown }[])[0];
  return readPaymentDetails(row?.payment_details);
}
