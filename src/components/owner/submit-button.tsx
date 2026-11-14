import { LoaderCircle } from "lucide-react";
import { primaryButton } from "@/components/agency/styles";

type OwnerSubmitButtonProps = { pending: boolean; label: string; pendingLabel: string };

// The owner forms' one action (T29c; forest look since D3): the back office's primary pill, busy with a
// spinner and words while the server works. aria-disabled keeps it focusable; the form ignores a second
// submit while one is on its way, so a double click sends one request.
export function OwnerSubmitButton({ pending, label, pendingLabel }: OwnerSubmitButtonProps) {
  return (
    <button type="submit" aria-disabled={pending || undefined} className={`${primaryButton} px-6`}>
      {pending ? <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" /> : null}
      {pending ? pendingLabel : label}
    </button>
  );
}
