import { Suspense } from "react";

import Simulator from "@/components/Simulator";

export default function SimulatePage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Scenario simulator</h1>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Stress-test a strait before the news does — deterministic, instant, no AI in the loop
        </p>
      </div>
      {/* Suspense: Simulator reads ?saved= via useSearchParams */}
      <Suspense>
        <Simulator />
      </Suspense>
    </div>
  );
}
