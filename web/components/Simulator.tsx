"use client";

import { useEffect, useState } from "react";

import BriefingWorkspace from "@/components/BriefingWorkspace";
import type { Rankings } from "@/lib/types";

/**
 * Stress-test a strait before the news does.
 *
 * The analyst picks a chokepoint and a severity; the deterministic engine
 * answers with the same ranking machinery that scores real events. There is no
 * model in this loop and no waiting on one — simulation is separable from
 * prediction, and this is the simulation half made into a hand tool.
 */

interface ChokepointMeta {
  key: string;
  label: string;
  reroute: string;
  attenuation: number;
  note: string;
}

export default function Simulator() {
  const [chokepoints, setChokepoints] = useState<ChokepointMeta[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [reduction, setReduction] = useState(100);
  const [months, setMonths] = useState(3);
  const [rankings, setRankings] = useState<Rankings | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then((meta) => {
        setChokepoints(meta.chokepoints ?? []);
        if (meta.chokepoints?.length) setSelected(meta.chokepoints[0].key);
      })
      .catch(() => setError("engine unavailable"));
  }, []);

  const current = chokepoints.find((c) => c.key === selected);

  const run = async () => {
    setRunning(true);
    setError(null);
    const response = await fetch("/api/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chokepoint: selected,
        transit_reduction: reduction / 100,
        duration_months: months,
      }),
    });
    setRunning(false);
    if (!response.ok) {
      setError("simulation failed");
      return;
    }
    setRankings(await response.json());
  };

  return (
    <div className="space-y-5">
      <section className="panel space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto]">
          <label className="space-y-1.5">
            <span
              className="block text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted)" }}
            >
              Chokepoint
            </span>
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setRankings(null);
              }}
              className="w-full rounded-md px-3 py-2 text-sm"
              style={{
                background: "var(--panel-2)",
                border: "1px solid var(--line)",
                color: "var(--text)",
              }}
            >
              {chokepoints.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span
              className="block text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted)" }}
            >
              Transit reduction · <span className="mono">{reduction}%</span>
            </span>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={reduction}
              onChange={(e) => setReduction(Number(e.target.value))}
              className="w-full"
            />
          </label>

          <label className="space-y-1.5">
            <span
              className="block text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted)" }}
            >
              Duration · <span className="mono">{months} mo</span>
            </span>
            <input
              type="range"
              min={1}
              max={12}
              step={1}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="w-full"
            />
          </label>

          <button
            type="button"
            onClick={run}
            disabled={running || !selected}
            className="self-end rounded-md px-5 py-2 text-sm font-semibold"
            style={{
              background: "var(--accent)",
              color: "#04121f",
              opacity: running ? 0.6 : 1,
            }}
          >
            {running ? "Computing…" : "Run scenario"}
          </button>
        </div>

        {current && (
          <p
            className="rounded-md p-2.5 text-xs"
            style={{
              background: "var(--panel-2)",
              color: current.reroute === "none" ? "#e8a33d" : "var(--muted)",
            }}
          >
            {current.reroute === "none"
              ? "No alternative sea route — a closure here is a supply cutoff."
              : "Cargo can divert around this chokepoint — a closure is a cost and delay shock, and scores are attenuated accordingly."}{" "}
            {current.note}
          </p>
        )}
      </section>

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {rankings && rankings.affected.length > 0 && (
        <>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Hypothetical scenario · methodology {rankings.methodology_version} · same
            deterministic engine that scores real events · no model involved
          </p>
          <BriefingWorkspace rankings={rankings} sources={rankings.sources ?? []} />
        </>
      )}
    </div>
  );
}
