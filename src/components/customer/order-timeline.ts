import type { CustomerOrder } from "@/lib/booking/orders";

// The order page's "Status pekerjaan" (D5, mock Customer-Orders), as pure rules: the steps from the
// order to the finished job, each done, happening now (current) or still to come, with the time it
// happened where the order knows it (created, assigned B3, checked in, completed). A paid order has no
// stored payment time, so "Dibayar" carries none. The last step of an unfinished job carries the
// window's end as an estimate ("Perkiraan 11.00"). A failed or cancelled order has nothing to follow.

export type TimelineKey = "ordered" | "paid" | "assigned" | "checkedIn" | "inProgress" | "completed";
export type TimelineState = "done" | "current" | "upcoming";
export type TimelineStep = { key: TimelineKey; state: TimelineState; at: string | null; estimate: boolean };

type TimelineOrder = Pick<
  CustomerOrder,
  "status" | "createdAt" | "endsAt" | "cleanerName" | "assignedAt" | "checkedInAt" | "completedAt"
>;

export function orderTimeline(order: TimelineOrder): TimelineStep[] {
  if (order.status === "failed" || order.status === "cancelled") return [];
  const paid = order.status === "paid";
  const assigned = order.cleanerName !== null || order.assignedAt !== null;
  const checkedIn = order.checkedInAt !== null;
  const completed = order.completedAt !== null;
  const step = (key: TimelineKey, state: TimelineState, at: string | null = null, estimate = false): TimelineStep => ({
    key,
    state,
    at,
    estimate,
  });
  return [
    step("ordered", "done", order.createdAt),
    step("paid", paid ? "done" : "current"),
    step("assigned", assigned ? "done" : paid ? "current" : "upcoming", assigned ? order.assignedAt : null),
    step("checkedIn", checkedIn ? "done" : "upcoming", order.checkedInAt),
    step("inProgress", completed ? "done" : checkedIn ? "current" : "upcoming"),
    completed ? step("completed", "done", order.completedAt) : step("completed", "upcoming", order.endsAt, true),
  ];
}
