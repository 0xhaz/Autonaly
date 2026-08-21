import { Suspense } from "react";

import GlobalDashboard from "@/components/GlobalDashboard";

/**
 * The public atlas. Events, exposure and the queue live behind sign-in —
 * this page is the general-knowledge surface anyone can explore.
 */
export default function HomePage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">World trade atlas</h1>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Click any country for its profile · toggle layers for the maritime network
        </p>
      </div>
      {/* Suspense: GlobalDashboard reads ?country= via useSearchParams */}
      <Suspense>
        <GlobalDashboard />
      </Suspense>
    </div>
  );
}
