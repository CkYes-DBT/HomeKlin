import type { CustomerOrder } from "@/lib/booking/orders";
import { recordingState, type RecordingState } from "./recording-time";

// "Rekaman pekerjaan" (D5, mocks Customer-Replay, Phone-Replay), as pure rules: the customer's own
// finished jobs that had a recording, in the order listMyOrders gives them (newest first), each kept or
// already deleted (T16), and which one the page opens: the one the address names when it is in the
// list, else the newest still kept, else the first.

export type ReplayItem = { order: CustomerOrder; state: Extract<RecordingState, "available" | "expired">; selected: boolean };

export function replayList(
  orders: readonly CustomerOrder[],
  wantedId: string | null,
  now: number,
): { items: ReplayItem[]; selected: ReplayItem | null } {
  const found = orders.flatMap((order) => {
    const state = recordingState(order, now);
    return state === "available" || state === "expired" ? [{ order, state }] : [];
  });
  const chosen =
    found.find((item) => item.order.id === wantedId) ?? found.find((item) => item.state === "available") ?? found[0] ?? null;
  const items = found.map((item) => ({ ...item, selected: item === chosen }));
  return { items, selected: items.find((item) => item.selected) ?? null };
}
