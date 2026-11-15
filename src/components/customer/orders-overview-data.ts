import type { CustomerOrder } from "@/lib/booking/orders";
import { liveInProgress } from "./live-status";

// The customer's orders on "Pesanan Anda" (D5, mock Customer-Home): a job in progress first, under
// "Sedang berlangsung" with its live view, then every other order in the list, newest first.

export function splitOrders<T extends Pick<CustomerOrder, "status" | "checkedInAt" | "completedAt">>(
  orders: readonly T[],
): { ongoing: T[]; history: T[] } {
  return {
    ongoing: orders.filter((order) => liveInProgress(order)),
    history: orders.filter((order) => !liveInProgress(order)),
  };
}
