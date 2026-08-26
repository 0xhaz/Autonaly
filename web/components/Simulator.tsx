"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import BriefingWorkspace from "@/components/BriefingWorkspace";
import ExportToDocs from "@/components/ExportToDocs";
import HistoricalRhymes from "@/components/HistoricalRhymes";
import {
  normaliseStrait,
  REGION_ORDER,
  reasonFor,
  regionFor,
} from "@/lib/chokepointCuration";
import { formatKusd, type Rankings } from "@/lib/types";

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

type Mode = "chokepoint" | "port" | "conflict";

interface ConflictChannel {
  key: string;
  label: string;
  transmission: string;
  note: string;
  sources: string[];
  coalition_only: boolean;
  effective_reduction: number;
  blocked_products: { basket: string; label: string; source_world_share: number }[];
  rankings: Rankings;
}

interface ConflictResult {
  conflict: string;
  label: string;
  note: string;
  omissions: string;
  intensity: number;
  skipped?: { country: string; name: string; reason: string }[];
  channels: ConflictChannel[];
  combined: {
    country: string;
    total_value_at_risk_kusd: number;
    channels: { channel: string }[];
  }[];
}

interface ConflictMeta {
  key: string;
  label: string;
  note: string;
  channels: { key: string; label: string }[];
}

interface CustomCountry {
  iso3: string;
  name: string;
  material_baskets: number;
}


export default function Simulator() {
  // A crisis page's "run the modern version" deep link (?custom=RUS,UKR)
  // prefills a custom conflict and runs it once the controls hydrate.
  const searchParams = useSearchParams();
  // A watched chokepoint on the dashboard links straight here.
  const chokepointPrefill = searchParams.get("chokepoint") ?? "";
  const customPrefill = (searchParams.get("custom") ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 3);

  const [mode, setMode] = useState<Mode>(customPrefill.length ? "conflict" : "chokepoint");

  // chokepoint mode
  const [chokepoints, setChokepoints] = useState<ChokepointMeta[]>([]);
  const [selected, setSelected] = useState<string>(chokepointPrefill);
  const [allStraits, setAllStraits] = useState<string[]>([]);
  const [conflicts, setConflicts] = useState<ConflictMeta[]>([]);
  const [conflictKey, setConflictKey] = useState<string>(customPrefill.length ? "custom" : "");
  const [conflictResult, setConflictResult] = useState<ConflictResult | null>(null);
  const [channelKey, setChannelKey] = useState<string>("");
  const [customCountries, setCustomCountries] = useState<CustomCountry[]>([]);
  const [customPicked, setCustomPicked] = useState<string[]>(customPrefill);
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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [copied, setCopied] = useState(false);
  // A scenario reopened from the dashboard: params are applied to state, the
  // deterministic engine replays the run, and the stored brief (the one thing
  // that cannot be recomputed) is restored after the results land.
  const autoRunRef = useRef(customPrefill.length > 0 || chokepointPrefill.length > 0);
  const savedBriefRef = useRef<string | null>(null);
  // Concurrency guard: StrictMode double-mounts and double-clicks must not
  // issue two engine calls for one intent.
  const inFlightRef = useRef(false);

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then((meta) => {
        setChokepoints(meta.chokepoints ?? []);
        if (meta.chokepoints?.length) setSelected((k) => k || meta.chokepoints[0].key);
        setConflicts(meta.conflicts ?? []);
        if (meta.conflicts?.length) setConflictKey((k) => k || meta.conflicts[0].key);
        setCustomCountries(meta.customConflictCountries ?? []);
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
    fetch("/country-names.json")
      .then((r) => r.json())
      .then((names: Record<string, string>) => setCountryNames(names))
      .catch(() => {});
  }, []);

  const savedId = searchParams.get("saved");
  useEffect(() => {
    if (!savedId) return;
    fetch(`/api/scenarios/${savedId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(({ scenario }) => {
        const p = scenario.params as Record<string, unknown>;
        setMode(scenario.mode);
        setReduction(Number(p.reduction ?? 100));
        setMonths(Number(p.months ?? 3));
        if (scenario.mode === "chokepoint") setSelected(String(p.selected ?? ""));
        if (scenario.mode === "port") {
          setPortCountry(String(p.portCountry ?? "NLD"));
          setPortName(String(p.portName ?? ""));
        }
        if (scenario.mode === "conflict") {
          setConflictKey(String(p.conflictKey ?? ""));
          setCustomPicked(Array.isArray(p.countries) ? p.countries.map(String) : []);
        }
        savedBriefRef.current = scenario.brief ?? null;
        autoRunRef.current = true;
      })
      .catch(() => setError("saved scenario unavailable"));
  }, [savedId]);

  const uncuratedStraits = useMemo(() => {
    const modelled = new Set(chokepoints.map((c) => normaliseStrait(c.label)));
    return allStraits.filter((name) => !modelled.has(normaliseStrait(name)));
  }, [allStraits, chokepoints]);

  const current = chokepoints.find((c) => c.key === selected);
  const currentConflict = conflicts.find((c) => c.key === conflictKey);
  const currentChannel = conflictResult?.channels.find((c) => c.key === channelKey);
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
    setSaveState("idle");
    setRankings(null);
    setAssumption(null);
    setConflictResult(null);
    setBrief(null);
    setBriefError(null);
  };

  const run = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setRunning(true);
    setError(null);
    if (!savedBriefRef.current) setBrief(null);
    setBriefError(null);
    setSaveState("idle");

    if (mode === "conflict") {
      const response = await fetch("/api/simulate-conflict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conflict: conflictKey,
          ...(conflictKey === "custom" ? { countries: customPicked } : {}),
          intensity: reduction / 100,
          duration_months: months,
        }),
      });
      setRunning(false);
      inFlightRef.current = false;
      if (!response.ok) {
        setError("simulation failed");
        return;
      }
      const data: ConflictResult = await response.json();
      setConflictResult(data);
      setChannelKey(data.channels[0]?.key ?? "");
      setRankings(null);
      if (savedBriefRef.current) {
        setBrief(savedBriefRef.current);
        savedBriefRef.current = null;
      }
      return;
    }

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
    inFlightRef.current = false;
    if (!response.ok) {
      setError("simulation failed");
      return;
    }
    const data = await response.json();
    setAssumption(data.assumption?.note ?? null);
    setRankings(data);
    if (savedBriefRef.current) {
      setBrief(savedBriefRef.current);
      savedBriefRef.current = null;
    }
  };

  useEffect(() => {
    if (!autoRunRef.current) return;
    const ready =
      mode === "chokepoint"
        ? Boolean(current)
        : mode === "port"
          ? Boolean(currentPort)
          : conflictKey === "custom"
            ? customPicked.length > 0
            : Boolean(currentConflict);
    if (!ready) return;
    autoRunRef.current = false;
    // Deferred so the run's state updates start outside the effect pass. No
    // cleanup on purpose: under StrictMode's mount-unmount-mount, a cleanup
    // would cancel the one scheduled run and the spent ref would never
    // reschedule it. autoRunRef + inFlightRef already guarantee single-fire.
    setTimeout(() => void run(), 0);
    // run() is recreated per render; the ref guard makes this fire once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, current, currentPort, conflictKey, customPicked, currentConflict]);

  const askDesk = async () => {
    if (mode === "conflict" && conflictResult) {
      setBriefing(true);
      setBriefError(null);
      const response = await fetch("/api/scenario-brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenario: {
            type: "conflict",
            label: conflictResult.label,
            intensity: conflictResult.intensity,
            duration_months: months,
            channels: conflictResult.channels.map((c) => ({
              label: c.label,
              transmission: c.transmission,
              effective_reduction: c.effective_reduction,
              coalition_only: c.coalition_only,
            })),
            omissions: conflictResult.omissions,
          },
          rankings: conflictResult,
        }),
      });
      setBriefing(false);
      if (!response.ok) {
        setBriefError("The desk could not complete this brief.");
        return;
      }
      const data = await response.json();
      setBrief(data.narrative);
      return;
    }
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
    mode === "conflict"
      ? null
      : mode === "chokepoint" && current
      ? { lat: current.lat, lon: current.lon, label: current.label }
      : currentPort?.lat != null && currentPort?.lon != null
        ? { lat: currentPort.lat, lon: currentPort.lon, label: `Port of ${currentPort.name}` }
        : null;

  const selectStyle = {
    background: "var(--panel-2)",
    border: "1px solid var(--line)",
    color: "var(--text)",
  } as const;

  const saveScenario = async () => {
    setSaveState("saving");
    const name = (iso3: string) => countryNames[iso3] ?? iso3;
    const [label, headline, params] =
      mode === "chokepoint"
        ? [
            current?.label ?? "Chokepoint",
            rankings
              ? `${name(rankings.largest_absolute_exposure ?? "")} largest · ${rankings.affected.length} ranked`
              : "",
            { selected, reduction, months },
          ]
        : mode === "port"
          ? [
              `Port of ${currentPort?.name} (${name(portCountry)})`,
              rankings
                ? `${name(rankings.largest_absolute_exposure ?? "")} largest · ${rankings.affected.length} ranked`
                : "",
              { portCountry, portName: currentPort?.name, reduction, months },
            ]
          : [
              conflictResult?.label ?? "Conflict",
              conflictResult?.combined[0]
                ? `${name(conflictResult.combined[0].country)} ${formatKusd(conflictResult.combined[0].total_value_at_risk_kusd)} at risk · ${conflictResult.channels.length} channel${conflictResult.channels.length === 1 ? "" : "s"}`
                : "",
              { conflictKey, countries: customPicked, reduction, months },
            ];
    const response = await fetch("/api/scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, label, headline, params, brief }),
    });
    setSaveState(response.ok ? "saved" : "error");
  };

  const copyBrief = async () => {
    if (!brief) return;
    const label =
      mode === "conflict"
        ? conflictResult?.label
        : mode === "chokepoint"
          ? current?.label
          : `Port of ${currentPort?.name}`;
    await navigator.clipboard.writeText(
      `# ${label} — hypothetical scenario\n\n${brief}\n\n— Autonaly scenario desk · every figure engine-verified · this event never happened`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // What the Google Docs export carries: the scenario's name, and whichever
  // ranking the run produced.
  const docsLabel =
    mode === "conflict"
      ? (conflictResult?.label ?? "Conflict scenario")
      : mode === "chokepoint"
        ? (current?.label ?? "Chokepoint scenario")
        : `Port of ${currentPort?.name ?? ""}`;

  const docsFacts = (() => {
    const name = (iso3: string) => countryNames[iso3] ?? iso3;
    if (mode === "conflict" && conflictResult) {
      const top = conflictResult.combined[0];
      return [
        { label: "Channels modelled", value: String(conflictResult.channels.length) },
        { label: "Intensity", value: `${Math.round(conflictResult.intensity * 100)}%` },
        { label: "Duration", value: `${months} months` },
        ...(top
          ? [{ label: "Largest combined exposure", value: `${name(top.country)} — ${formatKusd(top.total_value_at_risk_kusd)}` }]
          : []),
      ];
    }
    if (!rankings) return undefined;
    const total = rankings.affected.reduce((sum, a) => sum + (a.value_at_risk_kusd ?? 0), 0);
    const largest = rankings.affected.find((a) => a.country === rankings.largest_absolute_exposure);
    const worst = rankings.affected[0];
    return [
      { label: "Value at risk (ranked)", value: `${formatKusd(total)} across ${rankings.affected.length} countries` },
      ...(largest ? [{ label: "Largest absolute exposure", value: `${name(largest.country)} — ${formatKusd(largest.value_at_risk_kusd)}` }] : []),
      ...(worst ? [{ label: "Most dependent", value: `${name(worst.country)} — ${((worst.ddr ?? 0) * 100).toFixed(1)}% from disrupted origins` }] : []),
      { label: "Severity", value: `${rankings.severity_label} · ${reduction}% reduction over ${months} months` },
    ];
  })();

  const docsWinners = (() => {
    const name = (iso3: string) => countryNames[iso3] ?? iso3;
    const list =
      mode === "conflict"
        ? currentChannel?.rankings.winners
        : rankings?.winners;
    if (!list?.length) return undefined;
    return {
      headers: ["Country", "Why it gains"],
      rows: list.map((w) => [name(w.country), w.evidence?.[0] ?? w.mechanism]),
    };
  })();

  const docsTable = (() => {
    const name = (iso3: string) => countryNames[iso3] ?? iso3;
    if (mode === "conflict" && conflictResult) {
      return {
        headers: ["Country", "Total value at risk", "Channels"],
        rows: conflictResult.combined.slice(0, 15).map((r) => [
          name(r.country),
          formatKusd(r.total_value_at_risk_kusd),
          String(r.channels.length),
        ]),
      };
    }
    if (rankings) {
      return {
        headers: ["Country", "Score", "Dependency", "Value at risk"],
        rows: rankings.affected.slice(0, 15).map((a) => [
          name(a.country),
          a.score?.toFixed(1) ?? "—",
          a.ddr != null ? `${(a.ddr * 100).toFixed(1)}%` : "—",
          formatKusd(a.value_at_risk_kusd),
        ]),
      };
    }
    return undefined;
  })();

  // The desk's-read panel is identical across chokepoint, port, and conflict
  // results — one definition, rendered wherever a result exists.
  const deskPanel = (
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
              <div className="flex flex-wrap items-center gap-2">
                {!brief && (
                  <button
                    type="button"
                    onClick={askDesk}
                    disabled={briefing}
                    className="rounded-md px-4 py-2 text-sm font-semibold"
                    style={{ background: "var(--accent)", color: "var(--accent-contrast)", opacity: briefing ? 0.6 : 1 }}
                  >
                    {briefing ? "The desk is reading…" : "Ask the desk about this scenario"}
                  </button>
                )}
                {brief && (
                  <button
                    type="button"
                    onClick={copyBrief}
                    className="rounded-md px-4 py-2 text-sm font-medium"
                    style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
                  >
                    {copied ? "Copied" : "Copy as Markdown"}
                  </button>
                )}
                {brief && (
                  <ExportToDocs
                    title={`${docsLabel} — hypothetical scenario`}
                    subtitle={`Autonaly scenario desk · ${months}-month disruption · every figure engine-verified · this event never happened`}
                    narrative={brief}
                    tableCaption="Ranked exposure"
                    table={docsTable}
                    facts={docsFacts}
                    winners={docsWinners}
                  />
                )}
                <button
                  type="button"
                  onClick={saveScenario}
                  disabled={saveState === "saving" || saveState === "saved"}
                  className="rounded-md px-4 py-2 text-sm font-medium"
                  style={{
                    border: "1px solid var(--line)",
                    color: saveState === "saved" ? "var(--ok)" : "var(--text)",
                  }}
                >
                  {saveState === "saving"
                    ? "Saving…"
                    : saveState === "saved"
                      ? "Saved to dashboard"
                      : "Save to dashboard"}
                </button>
              </div>
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
                <span className="chip" style={{ color: "var(--warn)", borderColor: "color-mix(in srgb, var(--warn) 40%, transparent)" }}>
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
                      <p key={i} className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>
                        <strong style={{ color: "var(--text)" }}>{m[1]}</strong> {m[2]}
                      </p>
                    );
                  }
                  return (
                    <p key={i} className="mt-1.5 text-sm" style={{ color: "var(--text-soft)" }}>
                      {t.replace(/\*\*/g, "")}
                    </p>
                  );
                })}
              </div>
            </div>
          )}
        </section>
  );

  return (
    <div className="space-y-5">
      <section className="panel space-y-4 p-4">
        <div className="flex gap-1 rounded-md p-0.5" style={{ background: "var(--panel-2)", width: "fit-content" }}>
          {(["chokepoint", "port", "conflict"] as const).map((m) => (
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
              {m === "chokepoint" ? "Chokepoint" : m === "port" ? "Port blockage" : "Conflict"}
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
                {REGION_ORDER.map((region) => {
                  const inRegion = chokepoints.filter((c) => regionFor(c.label) === region);
                  if (inRegion.length === 0) return null;
                  return (
                    <optgroup key={region} label={region}>
                      {inRegion.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </optgroup>
                  );
                })}
                {uncuratedStraits.length > 0 && (
                  <optgroup label={`On the map, awaiting curation (${uncuratedStraits.length})`}>
                    {REGION_ORDER.flatMap((region) =>
                      uncuratedStraits
                        .filter((name) => regionFor(name) === region)
                        .map((name) => (
                          <option key={name} disabled title={reasonFor(name)}>
                            {region.split(" ")[0]} · {name} —{" "}
                            {reasonFor(name).split("—")[0].split(";")[0].slice(0, 40)}
                          </option>
                        )),
                    )}
                  </optgroup>
                )}
              </select>
            </label>
          ) : mode === "port" ? (
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
          ) : (
            <label className="space-y-1.5">
              <span className="block text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Conflict scenario
              </span>
              <select
                value={conflictKey}
                onChange={(e) => {
                  setConflictKey(e.target.value);
                  reset();
                }}
                className="w-full rounded-md px-3 py-2 text-sm"
                style={selectStyle}
              >
                <optgroup label="Curated scenarios">
                  {conflicts.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Build your own">
                  <option value="custom">Custom crisis — pick countries…</option>
                </optgroup>
              </select>
            </label>
          )}

          <label className="space-y-1.5">
            <span className="block text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              {mode === "chokepoint" ? "Transit reduction" : mode === "port" ? "Share of port lost" : "Conflict intensity"} ·{" "}
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
            disabled={running || (mode === "chokepoint" ? !selected : mode === "port" ? !currentPort : conflictKey === "custom" ? customPicked.length === 0 : !conflictKey)}
            className="self-end rounded-md px-5 py-2 text-sm font-semibold"
            style={{ background: "var(--accent)", color: "var(--accent-contrast)", opacity: running ? 0.6 : 1 }}
          >
            {running ? "Computing…" : "Run scenario"}
          </button>
        </div>

        {mode === "conflict" && conflictKey === "custom" && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Countries in crisis ({customPicked.length}/3)
              </span>
              {customPicked.map((iso3) => (
                <button
                  key={iso3}
                  type="button"
                  onClick={() => {
                    setCustomPicked(customPicked.filter((c) => c !== iso3));
                    reset();
                  }}
                  className="chip chip-curated"
                  style={{ textTransform: "none", cursor: "pointer" }}
                  title="Remove"
                >
                  {customCountries.find((c) => c.iso3 === iso3)?.name ?? iso3} ✕
                </button>
              ))}
              {customPicked.length < 3 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value && !customPicked.includes(e.target.value)) {
                      setCustomPicked([...customPicked, e.target.value]);
                      reset();
                    }
                  }}
                  className="rounded-md px-2 py-1.5 text-xs"
                  style={selectStyle}
                >
                  <option value="">Add a country…</option>
                  {customCountries
                    .filter((c) => !customPicked.includes(c.iso3))
                    .map((c) => (
                      <option key={c.iso3} value={c.iso3}>
                        {c.name} · {c.material_baskets} basket{c.material_baskets === 1 ? "" : "s"}
                      </option>
                    ))}
                </select>
              )}
            </div>
            <p className="rounded-md p-2.5 text-xs" style={{ background: "var(--panel-2)", color: "var(--muted)" }}>
              Channels are derived from the trade data, not curated: each country
              you pick gets one physical-disruption channel covering the modelled
              baskets where it supplies at least 1% of world trade. Only countries
              with such a position are listed — a country below that floor in
              every basket has no defensible supply-shock story here.
            </p>
          </div>
        )}
        {mode === "chokepoint" && current && (
          <p className="rounded-md p-2.5 text-xs" style={{ background: "var(--panel-2)", color: current.reroute === "none" ? "var(--warn)" : "var(--muted)" }}>
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
        {mode === "conflict" && conflictKey !== "custom" && currentConflict && (
          <p className="rounded-md p-2.5 text-xs" style={{ background: "var(--panel-2)", color: "var(--muted)" }}>
            {currentConflict.note} A conflict is not one shock but several with
            different reach: physical destruction cuts exports to every buyer,
            while sanctions bind only the coalition imposing them. Intensity
            scales all channels together.
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

          {deskPanel}

          <BriefingWorkspace
            key={`${mode}-${rankings.event_key}-${reduction}-${months}-${portName}`}
            rankings={rankings}
            sources={rankings.sources ?? []}
            marker={marker}
          />

          <HistoricalRhymes
            countries={mode === "port" ? [portCountry, ...(rankings.sources ?? [])] : rankings.sources ?? []}
            baskets={rankings.baskets ?? []}
            chokepoints={mode === "chokepoint" && current ? [current.key] : []}
          />
        </>
      )}

      {conflictResult && (
        <>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Hypothetical conflict scenario · {conflictResult.label} · every channel
            computed by the same deterministic engine that scores real events · no
            model involved
          </p>

          <p className="rounded-md p-3 text-xs" style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--muted)" }}>
            <span style={{ color: "var(--warn)" }}>Read the numbers as marginal risk on
            today&apos;s network:</span>{" "}
            {conflictResult.conflict === "russia_ukraine"
              ? "the 2024 trade weights already embed the rewiring the real war forced — Europe's pivot away from Russian seaborne energy is priced in, which is why Germany ranks small and pipeline-locked Slovakia and Hungary rank large. "
              : "exposure is computed on 2024 trade weights, so it measures who depends on these flows today — not how the network would rewire under a real crisis. "}
            Not modelled: {conflictResult.omissions}
          </p>

          {(conflictResult.skipped?.length ?? 0) > 0 && (
            <p className="rounded-md p-3 text-xs" style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--warn)" }}>
              Not simulated:{" "}
              {conflictResult.skipped!
                .map((s) => `${s.name} — ${s.reason}`)
                .join("; ")}
              .
            </p>
          )}

          {deskPanel}

          <section className="panel overflow-hidden">
            <div className="border-b p-4" style={{ borderColor: "var(--line)" }}>
              <h2 className="text-sm font-semibold">Combined exposure across all channels</h2>
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                Dollars at risk summed over every channel that reaches each country.
              </p>
            </div>
            <div className="overflow-x-auto p-2">
              <table className="rank">
                <thead>
                  <tr>
                    <th>Country</th>
                    <th>Total value at risk</th>
                    <th>Hit through</th>
                  </tr>
                </thead>
                <tbody>
                  {conflictResult.combined.slice(0, 12).map((row) => (
                    <tr key={row.country}>
                      <td className="font-medium">
                        {countryNames[row.country] ?? row.country}{" "}
                        <span className="mono text-[11px]" style={{ color: "var(--muted)" }}>
                          {row.country}
                        </span>
                      </td>
                      <td className="mono">{formatKusd(row.total_value_at_risk_kusd)}</td>
                      <td>
                        <span className="flex flex-wrap justify-end gap-1">
                          {row.channels.map((c) => (
                            <span key={c.channel} className="chip chip-computed" style={{ textTransform: "none" }}>
                              {conflictResult.channels.find((ch) => ch.key === c.channel)?.label ?? c.channel}
                            </span>
                          ))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel p-4">
            <h2 className="text-sm font-semibold">Blocked and restricted exports</h2>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              What stops moving, by channel — with each product&apos;s share of world
              trade supplied by the disrupted countries.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {conflictResult.channels.map((ch) => (
                <div key={ch.key} className="rounded-md p-3" style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{ch.label}</span>
                    <span className="mono text-[11px]" style={{ color: "var(--warn)" }}>
                      −{Math.round(ch.effective_reduction * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                    {ch.transmission}
                    {ch.coalition_only ? " · binds coalition importers only" : " · hits every importer"}
                  </div>
                  <ul className="mt-2 space-y-1">
                    {ch.blocked_products.map((bp) => (
                      <li key={bp.basket} className="flex items-baseline justify-between gap-2 text-xs">
                        <span>{bp.label}</span>
                        <span className="mono" style={{ color: "var(--muted)" }}>
                          {(bp.source_world_share * 100).toFixed(1)}% of world
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <HistoricalRhymes
            countries={[...new Set(conflictResult.channels.flatMap((c) => c.sources))]}
            baskets={[...new Set(conflictResult.channels.flatMap((c) => c.rankings.baskets ?? []))]}
            chokepoints={[]}
          />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Inspect channel
            </span>
            {conflictResult.channels.map((ch) => (
              <button
                key={ch.key}
                type="button"
                onClick={() => setChannelKey(ch.key)}
                className="rounded-md px-3 py-1.5 text-xs font-medium"
                style={{
                  background: channelKey === ch.key ? "var(--panel)" : "transparent",
                  color: channelKey === ch.key ? "var(--text)" : "var(--muted)",
                  border: channelKey === ch.key ? "1px solid var(--accent)" : "1px solid var(--line)",
                }}
              >
                {ch.label}
              </button>
            ))}
          </div>

          {currentChannel && (
            <>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {currentChannel.note}
              </p>
              <BriefingWorkspace
                key={`conflict-${conflictKey}-${channelKey}-${reduction}-${months}`}
                rankings={currentChannel.rankings}
                sources={currentChannel.sources}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
