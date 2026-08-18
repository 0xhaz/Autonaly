"use client";

import { useState } from "react";

/**
 * The citable claim.
 *
 * A knowledge product is only useful if someone can quote it. A wall of ratios
 * cannot be quoted — nobody carries `ddr: 0.5101` into a paragraph. One sentence
 * with one figure and a source period can be pasted straight into copy, which is
 * what a journalist on deadline actually needs.
 */
export default function CiteLine({ claim, vintage }: { claim: string; vintage: string }) {
  const [copied, setCopied] = useState(false);
  const full = `${claim} (Autonaly, ${vintage})`;

  return (
    <div
      className="panel p-4"
      style={{
        borderLeft: "3px solid var(--accent)",
        background: "color-mix(in srgb, var(--accent) 7%, transparent)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--accent)" }}
          >
            Cite this
          </p>
          <p className="mt-1.5 text-sm" style={{ color: "var(--text)" }}>
            {claim}
          </p>
          <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
            Autonaly · {vintage} · Data: BACI/CEPII; UN Global Platform, IMF PortWatch
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(full);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
