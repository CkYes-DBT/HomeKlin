import type { ReactNode } from "react";

type AuthCardProps = {
  title: string;
  /** The card's body: the lead (it depends on the form shown), any notice, the form and its links. */
  children: ReactNode;
  /** Under the card, on the page ("Butuh bantuan untuk masuk?"). */
  below?: ReactNode;
};

// The sign-in card (the SignIn and Phone-SignIn mocks): a white card with a 20 px radius on the cream
// page, at most 440 px wide, the page's one h1 at its top. On phones it spans the column under the
// heading; on desktop it sits in the middle of the right-hand side (src/app/[locale]/(auth)/layout.tsx).
export function AuthCard({ title, children, below }: AuthCardProps) {
  return (
    <div className="mx-auto flex w-full max-w-110 flex-col gap-5">
      <section aria-labelledby="auth-title" className="flex flex-col rounded-lg bg-card p-5 sm:p-8">
        <h1 id="auth-title" className="font-display text-headline-sm font-semibold text-ink">
          {title}
        </h1>
        {children}
      </section>
      {below}
    </div>
  );
}

/** The card's lead line, under the h1. */
export function AuthLead({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-body text-ink-muted">{children}</p>;
}

/** Stands in for the lead and the form while the page checks whether the visitor is already signed in. Same heights, so nothing jumps. */
export function AuthFormSkeleton({ fields }: { fields: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col">
      <span className="mt-2 h-4 w-full rounded-full bg-sunken" />
      <span className="mt-2 h-4 w-2/3 rounded-full bg-sunken" />
      <div className="mt-6 flex flex-col gap-4">
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <span className="h-5 w-24 rounded-full bg-sunken" />
            <span className="h-12 rounded-sm bg-sunken" />
          </div>
        ))}
      </div>
      <span className="mt-6 h-13 rounded-full bg-sunken" />
      <span className="mx-auto mt-4 h-11 w-48 rounded-full bg-sunken" />
    </div>
  );
}
