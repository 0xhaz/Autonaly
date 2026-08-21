"use client";

import { useEffect, useState } from "react";

import CountryDrawer from "@/components/CountryDrawer";
import GlobalMap, { type LayerToggles } from "@/components/GlobalMap";

/**
 * The landing surface: an explorable world atlas with optional maritime layers.
 *
 * No exposure, no events, no queue — those are analysis, and analysis lives on
 * the signed-in dashboard and the review queue. Here a stranger gets general
 * knowledge: click a country for its profile, toggle the maritime network on.
 */

const LAYER_META: { key: keyof LayerToggles; label: string; hint: string; swatch: string }[] = [
  { key: "lanes", label: "Shipping lanes", hint: "Indicative maritime routes", swatch: "#a8c8ea" },
  { key: "ports", label: "Major ports", hint: "300 busiest, sized by vessel traffic", swatch: "#7fb2e8" },
  { key: "chokepoints", label: "Chokepoints", hint: "28 straits and canals, drawn as rings", swatch: "var(--warn)" },
];

export default function GlobalDashboard() {
  const [selected, setSelected] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerToggles>({
    lanes: false,
    ports: false,
    chokepoints: false,
  });

  // The drawer's bilateral view needs a commodity scope. On the atlas that
  // scope is "everything we model" — the engine's own catalogue, not an
  // event's basket list.
  const [allBaskets, setAllBaskets] = useState<string[]>(["crude_oil"]);
  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then((meta) => {
        const keys = (meta.baskets ?? []).map((b: { key: string }) => b.key);
        if (keys.length) setAllBaskets(keys);
      })
      .catch(() => {});
  }, []);

  const toggle = (key: keyof LayerToggles) =>
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--muted)" }}
        >
          Layers
        </span>
        {LAYER_META.map((meta) => {
          const on = layers[meta.key];
          return (
            <button
              key={meta.key}
              type="button"
              onClick={() => toggle(meta.key)}
              title={meta.hint}
              aria-pressed={on}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors"
              style={{
                border: `1px solid ${on ? meta.swatch : "var(--line)"}`,
                background: on
                  ? `color-mix(in srgb, ${meta.swatch} 14%, transparent)`
                  : "transparent",
                color: on ? "var(--text)" : "var(--muted)",
              }}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: on ? meta.swatch : "var(--line)" }}
              />
              {meta.label}
            </button>
          );
        })}
      </div>

      <GlobalMap selected={selected} onSelect={setSelected} layers={layers} />

      <CountryDrawer
        country={selected}
        baskets={allBaskets}
        sources={[]}
        exposure={undefined}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
