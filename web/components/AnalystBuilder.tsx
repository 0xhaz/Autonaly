"use client";

import { useEffect, useMemo, useState } from "react";

import {
  COMMODITY_GROUPS,
  normaliseStrait,
  REGION_ORDER,
  reasonFor,
  regionFor,
} from "@/lib/chokepointCuration";

/**
 * Build-your-analyst onboarding.
 *
 * The user is not configuring software; they are hiring a specialist. So the
 * form reads as a brief: name the analyst, hand it a watchlist of commodities,
 * countries and chokepoints. Everything offered comes from the engine's own
 * catalogues — the user cannot ask for a basket the desk cannot score.
 */

interface Meta {
  baskets: { key: string; label: string; essentiality: string }[];
  chokepoints: { key: string; label: string }[];
}

interface Props {
  initial?: {
    analyst_name: string;
    baskets: string[];
    countries: string[];
    chokepoints: string[];
  } | null;
  onSaved: () => void;
}

const TEMPLATES = [
  {
    name: "Energy Desk",
    baskets: ["crude_oil", "refined_products", "lng", "lpg"],
    chokepoints: ["hormuz", "suez", "malacca"],
    countries: ["JPN", "KOR", "IND", "CHN"],
    watches: "Crude, refined products, LNG, LPG",
    via: "Hormuz · Suez · Malacca",
    where: "Japan, South Korea, India, China",
  },
  {
    name: "Food Security Desk",
    baskets: ["wheat", "maize", "rice", "nitrogen_fertilizer", "potash"],
    chokepoints: ["bosporus", "suez"],
    countries: ["EGY", "TUR", "KEN", "PAK"],
    watches: "Wheat, maize, rice, fertilizers",
    via: "Bosporus · Suez",
    where: "Egypt, Turkey, Kenya, Pakistan",
  },
  {
    name: "Tech Supply Desk",
    baskets: ["semiconductors", "rare_earth_magnets", "lithium", "cobalt"],
    chokepoints: ["malacca"],
    countries: ["TWN", "VNM", "KOR", "DEU"],
    watches: "Semiconductors, magnets, lithium, cobalt",
    via: "Malacca",
    where: "Taiwan, Vietnam, South Korea, Germany",
  },
];

export default function AnalystBuilder({ initial, onSaved }: Props) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [countries, setCountries] = useState<{ iso3: string; name: string }[]>([]);
  const [name, setName] = useState(initial?.analyst_name ?? "");
  const [baskets, setBaskets] = useState<Set<string>>(new Set(initial?.baskets ?? []));
  const [watched, setWatched] = useState<Set<string>>(new Set(initial?.countries ?? []));
  const [chokes, setChokes] = useState<Set<string>>(new Set(initial?.chokepoints ?? []));
  const [countryQuery, setCountryQuery] = useState("");
  const [allStraits, setAllStraits] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/meta").then((r) => r.json()).then(setMeta).catch(() => {});
    fetch("/layers/chokepoints.geo.json")
      .then((r) => r.json())
      .then((d) =>
        setAllStraits(
          d.features.map((f: { properties: { name: string } }) => f.properties.name),
        ),
      )
      .catch(() => {});
    fetch("/country-names.json")
      .then((r) => r.json())
      .then((names: Record<string, string>) =>
        setCountries(
          Object.entries(names)
            .map(([iso3, name]) => ({ iso3, name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      )
      .catch(() => {});
  }, []);

  const countryName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of countries) map[c.iso3] = c.name;
    return map;
  }, [countries]);

  const matches = useMemo(() => {
    if (!countryQuery) return [];
    const q = countryQuery.toLowerCase();
    return countries
      .filter(
        (c) =>
          !watched.has(c.iso3) &&
          (c.name.toLowerCase().includes(q) || c.iso3.toLowerCase().includes(q)),
      )
      .slice(0, 6);
  }, [countryQuery, countries, watched]);

  // The atlas draws 28 straits; the engine scores 8. Showing only the scored
  // ones made the page look thinner than the map for no visible reason — so
  // the rest appear too, inert, each carrying why it is not modelled.
  const uncurated = useMemo(() => {
    const modelled = new Set(
      (meta?.chokepoints ?? []).map((c) => normaliseStrait(c.label)),
    );
    return allStraits.filter((name) => !modelled.has(normaliseStrait(name)));
  }, [allStraits, meta]);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    setName((n) => n || t.name);
    setBaskets(new Set(t.baskets));
    setChokes(new Set(t.chokepoints));
    setWatched(new Set(t.countries));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        analyst_name: name || "My analyst",
        baskets: [...baskets],
        countries: [...watched],
        chokepoints: [...chokes],
      }),
    });
    setSaving(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "could not save");
      return;
    }
    onSaved();
  };

  const chip = (active: boolean) => ({
    border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
    background: active ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent",
    color: active ? "var(--text)" : "var(--muted)",
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Build your risk analyst</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Pick what it watches. When the desk files an event briefing, your analyst
          reads it against this watchlist and writes what it means for you.
        </p>
      </header>

      <section className="panel space-y-1 p-4">
        <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Start from a desk
        </label>
        <div className="grid gap-2 pt-1 sm:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button key={t.name} type="button" onClick={() => applyTemplate(t)}
              className="rounded-md p-3 text-left transition-colors hover:border-[color:var(--accent)]"
              style={{ border: "1px solid var(--line)", background: "var(--panel-2)" }}>
              <span className="block text-xs font-semibold" style={{ color: "var(--text)" }}>
                {t.name}
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
                {t.watches}
              </span>
              <span className="mono mt-1 block text-[10px]" style={{ color: "var(--accent)" }}>
                via {t.via}
              </span>
              <span className="block text-[10px]" style={{ color: "var(--muted)" }}>
                {t.where}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel space-y-2 p-4">
        <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Name your analyst
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Gulf Energy Watch"
          className="w-full rounded-md px-3 py-2 text-sm"
          style={{ background: "var(--panel-2)", border: "1px solid var(--line)", color: "var(--text)" }}
        />
      </section>

      <section className="panel space-y-2 p-4">
        <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Commodities · {baskets.size} watched
        </label>
        <div className="space-y-2.5 pt-1">
          {COMMODITY_GROUPS.map((group) => {
            const inGroup = (meta?.baskets ?? []).filter(
              (b) => b.essentiality === group.key,
            );
            if (inGroup.length === 0) return null;
            return (
              <div key={group.key}>
                <div className="mb-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  {group.label}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {inGroup.map((b) => (
                    <button key={b.key} type="button" onClick={() => toggle(baskets, setBaskets, b.key)}
                      className="rounded-full px-2.5 py-1 text-xs" style={chip(baskets.has(b.key))}>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel space-y-2 p-4">
        <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Countries · {watched.size} watched
        </label>
        <div className="flex flex-wrap gap-1.5">
          {[...watched].map((iso3) => (
            <button key={iso3} type="button" onClick={() => toggle(watched, setWatched, iso3)}
              className="rounded-full px-2.5 py-1 text-xs" style={chip(true)}>
              {countryName[iso3] ?? iso3} <span className="mono text-[10px]">{iso3}</span> ✕
            </button>
          ))}
        </div>
        <input
          value={countryQuery}
          onChange={(e) => setCountryQuery(e.target.value)}
          placeholder="Search countries…"
          className="w-full rounded-md px-3 py-2 text-sm"
          style={{ background: "var(--panel-2)", border: "1px solid var(--line)", color: "var(--text)" }}
        />
        {matches.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {matches.map((c) => (
              <button key={c.iso3} type="button"
                onClick={() => { toggle(watched, setWatched, c.iso3); setCountryQuery(""); }}
                className="rounded-full px-2.5 py-1 text-xs" style={chip(false)}>
                {c.name} <span className="mono">{c.iso3}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="panel space-y-2 p-4">
        <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Chokepoints · {chokes.size} watched
        </label>
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          The atlas draws {allStraits.length || 28} straits;{" "}
          {(meta?.chokepoints ?? []).length} are modelled and watchable. Dashed
          ones are on the map but not yet scored — hover for why.
        </p>
        <div className="space-y-2.5 pt-1">
          {REGION_ORDER.map((region) => {
            const modelled = (meta?.chokepoints ?? []).filter(
              (c) => regionFor(c.label) === region,
            );
            const pending = uncurated.filter((name) => regionFor(name) === region);
            if (modelled.length === 0 && pending.length === 0) return null;
            return (
              <div key={region}>
                <div className="mb-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  {region}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {modelled.map((c) => (
                    <button key={c.key} type="button" onClick={() => toggle(chokes, setChokes, c.key)}
                      className="rounded-full px-2.5 py-1 text-xs" style={chip(chokes.has(c.key))}>
                      {c.label}
                    </button>
                  ))}
                  {pending.map((name) => (
                    <span
                      key={name}
                      title={reasonFor(name)}
                      className="rounded-full px-2.5 py-1 text-xs"
                      style={{
                        border: "1px dashed var(--line)",
                        color: "var(--muted)",
                        opacity: 0.6,
                        cursor: "help",
                      }}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

      <button type="button" onClick={save} disabled={saving}
        className="rounded-md px-5 py-2.5 text-sm font-semibold"
        style={{ background: "var(--accent)", color: "var(--accent-contrast)", opacity: saving ? 0.6 : 1 }}>
        {saving ? "Saving…" : initial ? "Update analyst" : "Hire this analyst"}
      </button>
    </div>
  );
}
