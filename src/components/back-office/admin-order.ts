import type { AdminJob } from "@/lib/jobs/jobs";
import type { StreamStatus } from "@/lib/stream/streams";

// The admin order detail page's rules (D1, after the user's mocks "Admin-Order" and
// "Admin-Order-Issue"): which order the address asks for, the status chip under the title, the job's
// status steps and the help chat that belongs to the order. Pure, tested in tests/admin-order.test.ts.

const orderCodePattern = /^HK-[0-9]{4,}$/;

/** The order number from the address ("HK-1042", as orders_code_format allows), or null. */
export function parseOrderCode(value: string): string | null {
  return orderCodePattern.test(value) ? value : null;
}

/** The chip under the title: the live stream's state while there is one, else how far the job is. */
export type OrderState = "unassigned" | "assigned" | "active" | "weak" | "disconnected" | "inProgress" | "completed";

export function orderState(job: Pick<AdminJob, "cleanerName" | "checkedInAt" | "completedAt">, stream: StreamStatus | null): OrderState {
  if (job.completedAt) return "completed";
  if (stream === "active" || stream === "weak" || stream === "disconnected") return stream;
  if (job.checkedInAt) return "inProgress";
  return job.cleanerName ? "assigned" : "unassigned";
}

export type TimelineStep = {
  key: "assigned" | "checkedIn" | "weak" | "disconnected" | "completed";
  /** done: it happened; problem: the stream's trouble now; pending: not yet. */
  state: "done" | "problem" | "pending";
  /** When it happened, if the database keeps the time (it keeps none for the assignment). */
  at: string | null;
};

/**
 * The status steps: assigned, checked in at the address, the stream's trouble when it has some (at its
 * last report, stream_sessions.updated_at), and finished.
 */
export function orderTimeline(
  job: Pick<AdminJob, "cleanerName" | "checkedInAt" | "completedAt">,
  stream: { status: StreamStatus; updatedAt: string } | null,
): TimelineStep[] {
  const steps: TimelineStep[] = [
    { key: "assigned", state: job.cleanerName ? "done" : "pending", at: null },
    { key: "checkedIn", state: job.checkedInAt ? "done" : "pending", at: job.checkedInAt },
  ];
  if (!job.completedAt && stream && (stream.status === "weak" || stream.status === "disconnected")) {
    steps.push({ key: stream.status, state: "problem", at: stream.updatedAt });
  }
  steps.push({ key: "completed", state: job.completedAt ? "done" : "pending", at: job.completedAt });
  return steps;
}

/** The order's help chat with the latest message, if the customer asked about this order. */
export function findOrderTicket<T extends { orderId: string | null; lastMessageAt: string }>(tickets: readonly T[], orderId: string): T | undefined {
  return tickets
    .filter((ticket) => ticket.orderId === orderId)
    .sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt))[0];
}
