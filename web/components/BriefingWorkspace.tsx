"use client";

import { useEffect, useMemo, useState } from "react";

import CountryPanel from "@/components/CountryPanel";
import ExposureMap, { type MapMarker } from "@/components/ExposureMap";
import { GLOSSARY_SHORT } from "@/lib/glossary";
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
  hint,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <div className="panel p-4">
      <div
        className="text-[10px] uppercase tracking-wider"
        style={{ color: "var(--muted)", cursor: hint ? "help" : undefined }}
        title={hint}
      >
        {label}
        {hint && <span aria-hidden> ⓘ</span>}
      </div>
      <div
        className="mono mt-1 text-2xl font-semibold tabular-nums"
        style={{ color: accent ? "var(--warn)" : "var(--text)" }}
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
  marker,
}: {
  rankings: Rankings;
  sources: string[];
  marker?: MapMarker | null;
}) {
  // ISO3 -> full name. Generated from the context artifact rather than the map
  // polygons, because city-states like Hong Kong and Singapore rank in
  // briefings but have no drawable area in the simplified geometry.
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    fetch("/country-names.json")
      .then((r) => r.json())
      .then((map: Record<string, string>) => {
        if (!cancelled) setNames(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
          hint={GLOSSARY_SHORT["Value at risk"]}
          value={formatKusd(totals.atRisk)}
          sub={`${rankings.affected.length} countries ranked`}
          accent
        />
        <StatTile
          label="Largest absolute"
          hint={GLOSSARY_SHORT["Largest absolute"]}
          value={largest ?? "—"}
          sub={totals.largestRow ? formatKusd(totals.largestRow.value_at_risk_kusd) : undefined}
        />
        <StatTile
          label="Most dependent"
          hint={GLOSSARY_SHORT["Most dependent"]}
          value={totals.worst?.country ?? "—"}
          sub={
            totals.worst
              ? `${formatPercent(totals.worst.ddr)} from disrupted origins`
              : undefined
          }
        />
        <StatTile
          label="Severity"
          hint={GLOSSARY_SHORT["Severity"]}
          value={rankings.severity_label.replace(/_/g, " ")}
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
            marker={marker}
          />
        </div>
        <CountryPanel
          country={selected}
          baskets={baskets}
          sources={sources}
          exposure={exposureFor(selected)}
        />
      </div>

      {(rankings.winners?.length ?? 0) > 0 && (
        <section className="panel p-4">
          <h2 className="text-sm font-semibold">Who benefits</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Substitute exporters with world share and headroom to redirect — a
            rendering of existing trade data, not a forecast.
          </p>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {rankings.winners!.map((w) => (
              <li key={w.country} className="flex gap-3 rounded-md p-2.5" style={{ background: "var(--panel-2)" }}>
                <span className="mono font-semibold" style={{ color: "var(--ok)" }}>
                  {names[w.country] ?? w.country}
                </span>
                <span className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                  {w.evidence?.[0] ?? w.mechanism}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel overflow-hidden">
        <div className="flex items-baseline justify-between border-b p-4" style={{ borderColor: "var(--line)" }}>
          <div>
            <h2 className="text-sm font-semibold">Ranked exposure</h2>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              Ordered by dependency intensity — not by dollars. Every score carries the
              ratios behind it; hover any column for what it means.{" "}
              <a href="/methodology" style={{ color: "var(--accent)" }}>
                Full methodology →
              </a>
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
                <th title={GLOSSARY_SHORT["Score"]} style={{ cursor: "help" }}>Score ⓘ</th>
                <th title={GLOSSARY_SHORT["Dependency (DDR)"]} style={{ cursor: "help" }}>Dependency ⓘ</th>
                <th title={GLOSSARY_SHORT["Concentration (HHI)"]} style={{ cursor: "help" }}>Concentration ⓘ</th>
                <th title={GLOSSARY_SHORT["Value at risk"]} style={{ cursor: "help" }}>Value at risk ⓘ</th>
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
                  <td className="font-medium">
                    {names[a.country] ?? a.country}{" "}
                    <span className="mono text-[11px]" style={{ color: "var(--muted)" }}>
                      {a.country}
                    </span>
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
