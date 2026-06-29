import { type ReactNode } from "react";

import { PainelHeader } from "@/components/PainelHeader";

export function PainelLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_15%_0%,rgba(37,99,235,.08),transparent_30rem),linear-gradient(180deg,#ffffff_0%,#f5f5f3_100%)]">
      <PainelHeader />
      <main className="p-4 sm:p-6 lg:p-8">
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
