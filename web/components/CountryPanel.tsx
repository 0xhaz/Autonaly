"use client";

import { useEffect, useState } from "react";

import { formatKusd, formatPercent, type AffectedCountry } from "@/lib/types";

/**
 * Click-to-inspect panel.
 *
 * The ranking answers "who is exposed". This answers "why": which suppliers a
 * country actually depends on, how much of that sits with the disrupted origins,
 * and what the same country ships outward. A country can be a casualty as a buyer
 * and consequential as a seller, and only showing both makes that legible.
 *
 * Colour follows the data-viz rules: one series, one hue (sequential blue slot 1)
 * for ordinary trade, with the status critical step reserved for disrupted
 * origins — always paired with a "disrupted" label so the meaning is never
 * carried by hue alone.
 */

const SERIES = "#3987e5";
const DISRUPTED = "#d03b3b";

interface Row {
  country: string;
  value_kusd: number;
  share: number;
  disrupted?: boolean;
}

interface Profile {
  country: string;
  basket_labels: string[];
  total_imports_kusd: number;
  total_exports_kusd: number;
  world_export_share: number;
  import_sources: Row[];
  export_destinations: Row[];
}

function BarRow({ row, max }: { row: Row; max: number }) {
  const width = max > 0 ? (row.share / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <span className="mono w-9 shrink-0 text-xs" style={{ color: "var(--text)" }}>
        {row.country}
      </span>
      <div className="relative h-[14px] flex-1 overflow-hidden rounded-[3px]">
        <div
          className="h-full rounded-[3px]"
          style={{
            width: `${Math.max(width, 1.5)}%`,
            background: row.disrupted ? DISRUPTED : SERIES,
          }}
        />
      </div>
      <span className="mono w-12 shrink-0 text-right text-xs" style={{ color: "var(--muted)" }}>
        {(row.share * 100).toFixed(1)}%
      </span>
      <span className="mono w-16 shrink-0 text-right text-xs" style={{ color: "var(--muted)" }}>
        {formatKusd(row.value_kusd)}
      </span>
    </div>
  );
}

function Bars({ title, rows, note }: { title: string; rows: Row[]; note?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.share));
  return (
    <section>
      <h4
        className="mb-1 text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--muted)" }}
      >
        {title}
      </h4>
      {rows.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          No recorded trade in this basket.
        </p>
      ) : (
        <div>
          {rows.map((r) => (
            <BarRow key={r.country} row={r} max={max} />
          ))}
        </div>
      )}
      {note && (
        <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
          {note}
        </p>
      )}
    </section>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div
        className="mono text-sm font-semibold"
        style={{ color: accent ? "#e8a33d" : "var(--text)" }}
      >
        {value}
      </div>
    </div>
  );
}

export default function CountryPanel({
  country,
  baskets,
  sources,
  exposure,
}: {
  country: string | null;
  baskets: string[];
  sources: string[];
  exposure?: AffectedCountry;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derived, not stored: "loading" is simply the profile not yet matching the
  // selected country. Storing it would mean a setState in the effect body and a
  // cascading render on every selection.
  const loading = country !== null && profile?.country !== country && error === null;

  useEffect(() => {
    // No synchronous setState for the empty case — the render below already
    // handles `country === null`, so clearing state here would only cascade.
    if (!country) return;
    let cancelled = false;

    const query = new URLSearchParams({
      baskets: baskets.join(","),
      sources: sources.join(","),
      top_n: "8",
    });

    fetch(`/api/country/${country}?${query}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (cancelled) return;
        setError(null);
        setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setError("No trade profile available for this country.");
      });

    return () => {
      cancelled = true;
    };
  }, [country, baskets, sources]);

  if (!country) {
    return (
      <div className="panel flex h-full min-h-[300px] items-center justify-center p-6">
        <p className="max-w-[220px] text-center text-sm" style={{ color: "var(--muted)" }}>
          Select a country on the map to inspect who it depends on, and who depends on it.
        </p>
      </div>
    );
  }

  const disruptedShare =
    profile?.import_sources
      .filter((r) => r.disrupted)
      .reduce((sum, r) => sum + r.share, 0) ?? 0;

  return (
    <div className="panel h-full max-h-[560px] space-y-4 overflow-y-auto p-4">
      <header className="flex items-baseline justify-between">
        <h3 className="mono text-lg font-semibold">{country}</h3>
        {exposure?.score != null && (
          <span className="mono text-xs" style={{ color: "var(--muted)" }}>
            score {exposure.score.toFixed(1)}
          </span>
        )}
      </header>

      {loading && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          loading…
        </p>
      )}
      {error && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {error}
        </p>
      )}

      {profile?.country === country && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Basket imports" value={formatKusd(profile.total_imports_kusd)} />
            <Metric label="Basket exports" value={formatKusd(profile.total_exports_kusd)} />
            {exposure ? (
              <>
                <Metric
                  label="At risk"
                  value={formatKusd(exposure.value_at_risk_kusd)}
                  accent
                />
                <Metric label="Dependency" value={formatPercent(exposure.ddr)} />
              </>
            ) : (
              <>
                <Metric
                  label="From disrupted"
                  value={formatPercent(disruptedShare)}
                  accent={disruptedShare > 0}
                />
                <Metric
                  label="World export share"
                  value={formatPercent(profile.world_export_share)}
                />
              </>
            )}
          </div>

          <Bars
            title="Imports from"
            rows={profile.import_sources}
            note={
              sources.length > 0
                ? `Red bars are disrupted origins (${sources.slice(0, 6).join(", ")}${sources.length > 6 ? "…" : ""}).`
                : undefined
            }
          />
          <Bars title="Exports to" rows={profile.export_destinations} />

          <p className="text-[11px]" style={{ color: "var(--muted)" }}>
            {profile.basket_labels.join(" · ")}
          </p>
        </>
      )}
    </div>
  );
}
