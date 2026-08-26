"use client";

import type { AgentTrail } from "@/lib/types";

/**
 * The routing decision, shown in the product rather than the logs.
 *
 * The coordinator's choice of specialist is the one genuinely autonomous act
 * in the system. A reviewer deciding whether to approve should be able to see
 * which desk handled the event and what it consulted without opening a console.
 */

const pretty = (name: string) => name.replace(/_/g, " ");

export default function AgentTrailStrip({ trail }: { trail?: AgentTrail | null }) {
  if (!trail) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-3 py-2 text-[11px]"
      style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}
    >
      <span className="uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        produced by
      </span>
      <span className="mono" style={{ color: "var(--text)" }}>
        {pretty(trail.coordinator)}
      </span>
      {trail.specialist ? (
        <>
          <span style={{ color: "var(--muted)" }}>→</span>
          <span className="mono font-semibold" style={{ color: "var(--accent)" }}>
            {pretty(trail.specialist)}
          </span>
        </>
      ) : (
        <span style={{ color: "var(--warn)" }}>· handled by the coordinator alone</span>
      )}
      {trail.route && (
        <span style={{ color: "var(--muted)" }}>
          · routed as <span className="mono">{pretty(trail.route)}</span>
        </span>
      )}
      {trail.tools_used.length > 0 && (
        <span style={{ color: "var(--muted)" }}>
          · {trail.tools_used.length} tools: <span className="mono">{trail.tools_used.map(pretty).join(", ")}</span>
        </span>
      )}
      {trail.model && (
        <span className="mono" style={{ color: "var(--muted)" }}>
          · {trail.model}
        </span>
      )}
    </div>
  );
}
