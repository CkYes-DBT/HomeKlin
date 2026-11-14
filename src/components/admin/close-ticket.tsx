"use client";

import { CircleAlert, LoaderCircle, Lock } from "lucide-react";
import { useActionState, useState } from "react";
import { closeTicket, type SupportFormState } from "@/lib/support/actions";

type CloseTicketProps = {
  ticketId: string;
  labels: { button: string; question: string; confirm: string; cancel: string; pending: string; error: string };
};

/** The outline pill on the cream confirm box (markdown/design.md, Buttons). */
const outline =
  "inline-flex min-h-touch items-center justify-center gap-2 rounded-full border-[1.5px] border-outline px-4 text-sm font-semibold text-ink transition-[background-color,transform] duration-150 ease-out-quart hover:bg-card active:scale-[0.98] active:bg-sunken";

/** The trigger on the chat's dark forest header (D1, the mock "Admin-Support"). */
const onBand =
  "inline-flex min-h-touch w-fit items-center justify-center gap-2 rounded-full px-4.5 text-sm font-semibold text-on-band inset-ring-[1.5px] inset-ring-on-band-muted transition-[background-color,transform] duration-150 ease-out-quart hover:bg-band-raised active:scale-[0.98] active:bg-primary";

// "Tutup tiket" on the admin's chat (T21). Closing cannot be undone and ends the customer's chat, so it
// asks once more in place before closeTicket runs; the server checks the admin role again. Once the
// ticket is closed the chat hides this control and the customer's send box goes away (Realtime).
export function CloseTicket({ ticketId, labels }: CloseTicketProps) {
  const [state, formAction, pending] = useActionState<SupportFormState, FormData>(closeTicket, null);
  const [asking, setAsking] = useState(false);
  const failed = Boolean(state?.formError) && !pending;

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={onBand}>
        <Lock className="size-4 shrink-0" aria-hidden="true" />
        {labels.button}
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md bg-field p-3 text-ink">
      <input type="hidden" name="ticketId" value={ticketId} />
      <p className="text-sm font-medium text-ink">{labels.question}</p>
      <div role="alert" aria-atomic="true">
        {failed ? (
          <p className="flex items-start gap-1.5 text-sm font-medium text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{labels.error}</span>
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          autoFocus
          className={`inline-flex min-h-touch items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-on-primary transition-[background-color,transform] duration-150 ease-out-quart ${
            pending ? "cursor-progress bg-primary-container" : "bg-primary hover:bg-primary-container active:scale-[0.98] active:bg-band"
          }`}
        >
          {pending ? <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" /> : null}
          {pending ? labels.pending : labels.confirm}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setAsking(false)}
          className={`${outline} disabled:cursor-not-allowed disabled:border-border-control disabled:text-ink-muted`}
        >
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
