"use client";

import { useMemo, useState } from "react";

import CountryPanel from "@/components/CountryPanel";
import ExposureMap from "@/components/ExposureMap";
import { formatKusd, formatPercent, type Rankings } from "@/lib/types";

/**
 * The interactive half of a briefing.
 *
 * A knowledge product has to let someone interrogate the data, not just read a
 * conclusion about it. The map and the table are two views of one selection:
 * clicking either inspects that country's bilateral position, so "Egypt scores
 * 2.6" becomes "Egypt buys 36% of this basket from Saudi Arabia, and sells 32%
 * of its own exports back to them."
 */

function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="panel p-4">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div
        className="mono mt-1 text-2xl font-semibold tabular-nums"
        style={{ color: accent ? "#e8a33d" : "var(--text)" }}
      >
        {value}
      </div>
      {sub && (
        <div className="mono mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function BriefingWorkspace({
  rankings,
  sources,
}: {
  rankings: Rankings;
  sources: string[];
}) {
  const largest = rankings.largest_absolute_exposure ?? null;
  const [selected, setSelected] = useState<string | null>(largest);

  const baskets = rankings.baskets ?? [];

  const totals = useMemo(() => {
    const atRisk = rankings.affected.reduce(
      (sum, a) => sum + (a.value_at_risk_kusd ?? 0),
      0,
    );
    const worst = rankings.affected[0];
    const largestRow = rankings.affected.find((a) => a.country === largest);
    return { atRisk, worst, largestRow };
  }, [rankings, largest]);

  const exposureFor = (iso3: string | null) =>
    rankings.affected.find((a) => a.country === iso3);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Value at risk (ranked)"
          value={formatKusd(totals.atRisk)}
          sub={`${rankings.affected.length} countries ranked`}
          accent
        />
        <StatTile
          label="Largest absolute"
          value={largest ?? "—"}
          sub={totals.largestRow ? formatKusd(totals.largestRow.value_at_risk_kusd) : undefined}
        />
        <StatTile
          label="Most dependent"
          value={totals.worst?.country ?? "—"}
          sub={
            totals.worst
              ? `${formatPercent(totals.worst.ddr)} from disrupted origins`
              : undefined
          }
        />
        <StatTile
          label="Severity"
          value={rankings.severity_label}
          sub={`methodology ${rankings.methodology_version}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          <ExposureMap
            affected={rankings.affected}
            highlight={largest}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
        <CountryPanel
          country={selected}
          baskets={baskets}
          sources={sources}
          exposure={exposureFor(selected)}
        />
      </div>

      <section className="panel overflow-hidden">
        <div className="flex items-baseline justify-between border-b p-4" style={{ borderColor: "var(--line)" }}>
          <div>
            <h2 className="text-sm font-semibold">Ranked exposure</h2>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              Ordered by dependency intensity. Every score carries the ratios behind it.
            </p>
          </div>
          <span className="text-[11px]" style={{ color: "var(--muted)" }}>
            click a row to inspect
          </span>
        </div>
        <div className="overflow-x-auto p-2">
          <table className="rank">
            <thead>
              <tr>
                <th>Country</th>
                <th>Score</th>
                <th>Dependency</th>
                <th>Concentration</th>
                <th>Value at risk</th>
              </tr>
            </thead>
            <tbody>
              {rankings.affected.map((a) => (
                <tr
                  key={a.country}
                  onClick={() => setSelected(a.country)}
                  style={{
                    cursor: "pointer",
                    background:
                      a.country === selected ? "var(--panel-2)" : undefined,
                  }}
                >
                  <td className="mono font-semibold">
                    {a.country}
                    {a.country === largest && (
                      <span className="ml-2 chip chip-curated">largest</span>
                    )}
                  </td>
                  <td className="mono">{a.score?.toFixed(1) ?? "—"}</td>
                  <td className="mono">{formatPercent(a.ddr)}</td>
                  <td className="mono">{a.hhi?.toFixed(3) ?? "—"}</td>
                  <td className="mono">{formatKusd(a.value_at_risk_kusd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
