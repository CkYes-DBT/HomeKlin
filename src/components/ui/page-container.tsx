import type { ReactNode } from "react";

// Content column for customer and cleaner pages (the back-office shell has its own). "wide" is the
// customer redesign's column (D5, the Main and Customer-* mocks, 1200 px), under the wider customer bar.
export function PageContainer({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={`mx-auto flex w-full flex-col gap-6 px-safe pt-6 md:px-gutter-wide md:pt-8 ${wide ? "max-w-dashboard md:gap-7" : "max-w-content"}`}
    >
      {children}
    </div>
  );
}
