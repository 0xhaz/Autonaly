"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";

import BriefingWorkspace from "@/components/BriefingWorkspace";
import type { Rankings } from "@/lib/types";

/**
 * Stress-test the network before the news does.
 *
 * Two things concentrate maritime risk, and the simulator models both:
 * chokepoints — where geography forces every ship through one passage — and
 * ports, where a country's own throughput concentrates. Both run on the
 * deterministic engine with no model in the loop.
 *
 * Shipping lanes are deliberately not a target: open sea reroutes freely, so a
 * "blocked lane" has no meaning the data could support. Lanes are context;
 * pinch points carry the risk. Port severity is grounded in IMF PortWatch's
 * published share of each country's maritime exports, not a guess.
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

interface Port {
  name: string;
  vessels: number;
  industry?: string | null;
  lat: number | null;
  lon: number | null;
  export_share: number;
  import_share: number;
}

type Mode = "chokepoint" | "port";

/**
 * The straits on the map but not yet in the model, with the honest reason.
 * Assigning trade flows to a strait from memory produces confidently wrong
 * data — it happened twice before the rule existed — so each of these waits
 * for deliberate curation. Several are structurally negligible and say so.
 */
const UNCURATED_REASONS: Record<string, string> = {
  "Cape of Good Hope": "This is the bypass route itself — it appears as attenuation on Suez and Bab el-Mandeb.",
  "Lombok Strait": "Primary bypass for Malacca; its closure is already Malacca's attenuation.",
  "Sunda Strait": "Primary bypass for Malacca; its closure is already Malacca's attenuation.",
  "Makassar Strait": "Parallel Indonesian passage; traffic diverts to adjacent straits.",
  "Luzon Strait": "Eastern bypass of the Taiwan Strait; through-traffic reroutes here.",
  "Magellan Strait": "Redundant with Panama and the Drake Passage for modern tonnage.",
  "Bering Strait": "Negligible commercial transit today.",
  "Tsugaru Strait": "Parallel Japanese passage with ready alternatives.",
  "Korea Strait": "Flows cannot be defensibly separated from adjacent routes in country-level data.",
  "Dover Strait": "Ships route north of the UK at trivial cost; closure is a nuisance, not a shock.",
  "Oresund Strait": "The Great Belt carries the deep-draft Baltic traffic; Oresund alone has a ready bypass.",
  "Kerch Strait": "Azov flows are a small, port-level slice of Black Sea trade — needs port-share modelling.",
  "Bohai Strait": "A Chinese import gateway; inbound flows cannot be attributed at country level.",
};
const DEFAULT_UNCURATED = "Routing not yet curated — flows must be assigned deliberately, not guessed.";

export default function Simulator() {
  const [mode, setMode] = useState<Mode>("chokepoint");

  // chokepoint mode
  const [chokepoints, setChokepoints] = useState<ChokepointMeta[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [allStraits, setAllStraits] = useState<string[]>([]);
  // port mode
  const [portsByCountry, setPortsByCountry] = useState<Record<string, Port[]>>({});
  const [countryNames, setCountryNames] = useState<Record<string, string>>({});
  const [portCountry, setPortCountry] = useState<string>("NLD");
  const [portName, setPortName] = useState<string>("");

  const [reduction, setReduction] = useState(100);
  const [months, setMonths] = useState(3);
  const [rankings, setRankings] = useState<Rankings | null>(null);
  const [assumption, setAssumption] = useState<string | null>(null);
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
    fetch("/layers/chokepoints.geo.json")
      .then((r) => r.json())
      .then((d) =>
        setAllStraits(
          d.features.map((f: { properties: { name: string } }) => f.properties.name),
        ),
      )
      .catch(() => {});
    fetch("/layers/ports-by-country.json")
      .then((r) => r.json())
      .then((d) => setPortsByCountry(d))
      .catch(() => {});
    fetch("/world.geo.json")
      .then((r) => r.json())
      .then((w) => {
        const names: Record<string, string> = {};
        for (const f of w.features) names[f.properties.iso3] = f.properties.name;
        setCountryNames(names);
      })
      .catch(() => {});
  }, []);

  const current = chokepoints.find((c) => c.key === selected);
  const countryOptions = useMemo(
    () =>
      Object.keys(portsByCountry)
        .map((iso3) => ({ iso3, name: countryNames[iso3] ?? iso3 }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [portsByCountry, countryNames],
  );
  const ports = useMemo(
    () => (portsByCountry[portCountry] ?? []).filter((p) => p.export_share > 0),
    [portsByCountry, portCountry],
  );
  // No reconciliation effect needed: an unknown portName (after a country
  // switch) simply falls back to the country's largest port.
  const currentPort = ports.find((p) => p.name === portName) ?? ports[0];

  const reset = () => {
    setRankings(null);
    setAssumption(null);
    setBrief(null);
    setBriefError(null);
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    setBrief(null);
    setBriefError(null);

    const [url, body] =
      mode === "chokepoint"
        ? [
            "/api/simulate",
            {
              chokepoint: selected,
              transit_reduction: reduction / 100,
              duration_months: months,
            },
          ]
        : [
            "/api/simulate-port",
            {
              country: portCountry,
              port_share: currentPort?.export_share ?? 0,
              severity: reduction / 100,
              duration_months: months,
            },
          ];

    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setRunning(false);
    if (!response.ok) {
      setError("simulation failed");
      return;
    }
    const data = await response.json();
    setAssumption(data.assumption?.note ?? null);
    setRankings(data);
  };

  const askDesk = async () => {
    if (!rankings) return;
    setBriefing(true);
    setBriefError(null);
    const scenario =
      mode === "chokepoint" && current
        ? {
            type: "chokepoint",
            chokepoint: current.key,
            label: current.label,
            transit_reduction: reduction / 100,
            duration_months: months,
            reroute: current.reroute,
          }
        : {
            type: "port",
            label: `Port of ${currentPort?.name}`,
            country: portCountry,
            port_share_of_country_maritime_exports: currentPort?.export_share,
            share_of_port_lost: reduction / 100,
            effective_reduction:
              Math.round((currentPort?.export_share ?? 0) * (reduction / 100) * 10000) / 10000,
            duration_months: months,
            diversion: "other national ports absorb the remainder",
          };
    const response = await fetch("/api/scenario-brief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario, rankings }),
    });
    setBriefing(false);
    if (!response.ok) {
      setBriefError("The desk could not complete this brief.");
      return;
    }
    const data = await response.json();
    setBrief(data.narrative);
  };

  const marker =
    mode === "chokepoint" && current
      ? { lat: current.lat, lon: current.lon, label: current.label }
      : currentPort?.lat != null && currentPort?.lon != null
        ? { lat: currentPort.lat, lon: currentPort.lon, label: `Port of ${currentPort.name}` }
        : null;

  const selectStyle = {
    background: "var(--panel-2)",
    border: "1px solid var(--line)",
    color: "var(--text)",
  } as const;

  return (
    <div className="space-y-5">
      <section className="panel space-y-4 p-4">
        <div className="flex gap-1 rounded-md p-0.5" style={{ background: "var(--panel-2)", width: "fit-content" }}>
          {(["chokepoint", "port"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                reset();
              }}
              className="rounded-[5px] px-4 py-1.5 text-xs font-medium capitalize"
              style={{
                background: mode === m ? "var(--panel)" : "transparent",
                color: mode === m ? "var(--text)" : "var(--muted)",
                border: mode === m ? "1px solid var(--line)" : "1px solid transparent",
              }}
            >
              {m === "chokepoint" ? "Chokepoint" : "Port blockage"}
            </button>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto]">
          {mode === "chokepoint" ? (
            <label className="space-y-1.5">
              <span className="block text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Chokepoint
              </span>
              <select
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  reset();
                }}
                className="w-full rounded-md px-3 py-2 text-sm"
                style={selectStyle}
              >
                <optgroup label={`Modelled (${chokepoints.length})`}>
                  {chokepoints.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </optgroup>
                {allStraits.filter(
                  (name) => !chokepoints.some((c) => c.label === name || name.includes(c.label)),
                ).length > 0 && (
                  <optgroup label="On the map, awaiting curation">
                    {allStraits
                      .filter(
                        (name) =>
                          !chokepoints.some(
                            (c) =>
                              c.label === name ||
                              name.replace("Strait of ", "").includes(c.label.replace("Strait of ", "")) ||
                              c.label.replace("Strait of ", "").includes(name.replace("Strait of ", "")),
                          ),
                      )
                      .map((name) => (
                        <option key={name} disabled title={UNCURATED_REASONS[name] ?? DEFAULT_UNCURATED}>
                          {name} — {(UNCURATED_REASONS[name] ?? DEFAULT_UNCURATED).split("—")[0].split(";")[0].slice(0, 46)}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </label>
          ) : (
            <label className="space-y-1.5">
              <span className="block text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Country · port
              </span>
              <div className="flex gap-2">
                <select
                  value={portCountry}
                  onChange={(e) => {
                    setPortCountry(e.target.value);
                    reset();
                  }}
                  className="w-1/2 rounded-md px-2 py-2 text-sm"
                  style={selectStyle}
                >
                  {countryOptions.map((c) => (
                    <option key={c.iso3} value={c.iso3}>{c.name}</option>
                  ))}
                </select>
                <select
                  value={currentPort?.name ?? ""}
                  onChange={(e) => {
                    setPortName(e.target.value);
                    reset();
                  }}
                  className="w-1/2 rounded-md px-2 py-2 text-sm"
                  style={selectStyle}
                >
                  {ports.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} · {(p.export_share * 100).toFixed(0)}%
                    </option>
                  ))}
                </select>
              </div>
            </label>
          )}

          <label className="space-y-1.5">
            <span className="block text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              {mode === "chokepoint" ? "Transit reduction" : "Share of port lost"} ·{" "}
              <span className="mono">{reduction}%</span>
            </span>
            <input
              type="range" min={10} max={100} step={5}
              value={reduction}
              onChange={(e) => setReduction(Number(e.target.value))}
              className="w-full"
            />
          </label>

          <label className="space-y-1.5">
            <span className="block text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Duration · <span className="mono">{months} mo</span>
            </span>
            <input
              type="range" min={1} max={12} step={1}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="w-full"
            />
          </label>

          <button
            type="button"
            onClick={run}
            disabled={running || (mode === "chokepoint" ? !selected : !currentPort)}
            className="self-end rounded-md px-5 py-2 text-sm font-semibold"
            style={{ background: "var(--accent)", color: "#04121f", opacity: running ? 0.6 : 1 }}
          >
            {running ? "Computing…" : "Run scenario"}
          </button>
        </div>

        {mode === "chokepoint" && current && (
          <p className="rounded-md p-2.5 text-xs" style={{ background: "var(--panel-2)", color: current.reroute === "none" ? "#e8a33d" : "var(--muted)" }}>
            {current.reroute === "none"
              ? "No alternative sea route — a closure here is a supply cutoff."
              : "Cargo can divert around this chokepoint — a closure is a cost and delay shock, and scores are attenuated accordingly."}{" "}
            {current.note}
          </p>
        )}
        {mode === "port" && currentPort && (
          <p className="rounded-md p-2.5 text-xs" style={{ background: "var(--panel-2)", color: "var(--muted)" }}>
            {currentPort.name} handles{" "}
            <span className="mono" style={{ color: "var(--text)" }}>
              {(currentPort.export_share * 100).toFixed(1)}%
            </span>{" "}
            of {countryNames[portCountry] ?? portCountry}&apos;s maritime exports (IMF
            PortWatch). Blocking it removes that share of the country&apos;s export
            capacity, scaled by how much of the port is lost. Shipping lanes are not
            simulatable on purpose: open sea reroutes freely — only pinch points and
            ports concentrate risk.
          </p>
        )}
      </section>

      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

      {rankings && rankings.affected.length > 0 && (
        <>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Hypothetical scenario · methodology {rankings.methodology_version} · same
            deterministic engine that scores real events · no model involved
            {assumption ? ` · ${assumption}` : ""}
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

            {briefError && <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>{briefError}</p>}

            {brief && (
              <div className="mt-4 rounded-md p-4" style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}>
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
                          <strong style={{ color: "var(--text)" }}>{m[1]}</strong> {m[2]}
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
            key={`${mode}-${rankings.event_key}-${reduction}-${months}-${portName}`}
            rankings={rankings}
            sources={rankings.sources ?? []}
            marker={marker}
          />
        </>
      )}
    </div>
  );
}
