"use client";

import { Show, SignInButton } from "@clerk/nextjs";
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
  lat: number;
  lon: number;
}

export default function Simulator() {
  const [chokepoints, setChokepoints] = useState<ChokepointMeta[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [reduction, setReduction] = useState(100);
  const [months, setMonths] = useState(3);
  const [rankings, setRankings] = useState<Rankings | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefing, setBriefing] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

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
    setBrief(null);
    setBriefError(null);
    setRankings(await response.json());
  };

  const askDesk = async () => {
    if (!rankings || !current) return;
    setBriefing(true);
    setBriefError(null);
    const response = await fetch("/api/scenario-brief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenario: {
          chokepoint: current.key,
          label: current.label,
          transit_reduction: reduction / 100,
          duration_months: months,
          reroute: current.reroute,
        },
        rankings,
      }),
    });
    setBriefing(false);
    if (!response.ok) {
      setBriefError("The desk could not complete this brief.");
      return;
    }
    const body = await response.json();
    setBrief(body.narrative);
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
          <section className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">The desk&apos;s read</h2>
                <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                  The analyst writes a brief for your hypothetical — same provenance
                  guard as a real event, clearly labelled as one that never happened.
                </p>
              </div>
              <Show when="signed-in">
                {!brief && (
                  <button
                    type="button"
                    onClick={askDesk}
                    disabled={briefing}
                    className="rounded-md px-4 py-2 text-sm font-semibold"
                    style={{ background: "var(--accent)", color: "#04121f", opacity: briefing ? 0.6 : 1 }}
                  >
                    {briefing ? "The desk is reading…" : "Ask the desk about this scenario"}
                  </button>
                )}
              </Show>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button
                    type="button"
                    className="rounded-md px-4 py-2 text-sm font-medium"
                    style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
                  >
                    Sign in to ask the desk
                  </button>
                </SignInButton>
              </Show>
            </div>

            {briefError && (
              <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>{briefError}</p>
            )}

            {brief && (
              <div
                className="mt-4 rounded-md p-4"
                style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="chip" style={{ color: "#e8a33d", borderColor: "color-mix(in srgb, #e8a33d 40%, transparent)" }}>
                    hypothetical
                  </span>
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                    every figure engine-verified
                  </span>
                </div>
                <div className="narrative">
                  {brief.split("\n").map((line, i) => {
                    const t = line.trim();
                    if (!t) return null;
                    const m = t.match(/^\*\*(.+?)\*\*\s*(.*)$/);
                    if (m) {
                      return (
                        <p key={i} className="mt-2 text-sm" style={{ color: "#cdd9e8" }}>
                          <strong style={{ color: "var(--text)" }}>{m[1]}</strong>{" "}
                          {m[2]}
                        </p>
                      );
                    }
                    return (
                      <p key={i} className="mt-1.5 text-sm" style={{ color: "#cdd9e8" }}>
                        {t.replace(/\*\*/g, "")}
                      </p>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <BriefingWorkspace
            // Remount per scenario: the map builds its style once, so a fresh
            // run must not inherit the previous run's shading.
            key={`${rankings.event_key}-${reduction}-${months}`}
            rankings={rankings}
            sources={rankings.sources ?? []}
            marker={
              current ? { lat: current.lat, lon: current.lon, label: current.label } : null
            }
          />
        </>
      )}
    </div>
  );
}
