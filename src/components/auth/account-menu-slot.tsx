import { Suspense } from "react";
import { AccountMenu } from "@/components/shell/account-menu";
import type { AppTone } from "@/components/shell/mobile-shell";
import { getCurrentUser } from "@/lib/auth/dal";

type AccountMenuSlotProps = {
  variant: "bottom" | "top";
  tone?: AppTone;
};

// The customer's account menu with the session behind it. Reading the session needs the request, so it
// streams in behind <Suspense> and the navigation around it stays in the prerendered shell; until then
// the trigger shows, disabled, so nothing moves when the name arrives. Any role may be signed in on a
// customer page (the pages are public), so the menu names whoever it is and signs them out.
export function AccountMenuSlot({ variant, tone }: AccountMenuSlotProps) {
  return (
    <Suspense fallback={<AccountMenu variant={variant} tone={tone} />}>
      <SignedInMenu variant={variant} tone={tone} />
    </Suspense>
  );
}

async function SignedInMenu({ variant, tone }: AccountMenuSlotProps) {
  const user = await getCurrentUser();
  return <AccountMenu variant={variant} tone={tone} user={user ? { name: user.fullName.trim() } : null} />;
}
