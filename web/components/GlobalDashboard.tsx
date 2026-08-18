"use client";

import { useMemo, useState } from "react";

import CountryDrawer from "@/components/CountryDrawer";
import GlobalMap, { type LayerToggles, type MapEvent } from "@/components/GlobalMap";
import type { Briefing } from "@/lib/types";

/**
 * The landing surface: a map, and the controls that change what it shows.
 *
 * Summary cards used to sit above the map. They are gone deliberately — a
 * dashboard of headline numbers answers questions nobody had yet, and pushed the
 * one thing worth looking at below the fold. The numbers still exist, on the
 * country a reader actually asked about.
 *
 * Layers are how one map serves several audiences. A general reader wants a
 * clean world. A macro analyst wants the maritime network under it — the lanes,
 * the straits they funnel through, the ports that anchor them — and can switch
 * that on without it being imposed on everyone else.
 */

const LAYER_META: { key: keyof LayerToggles; label: string; hint: string; swatch: string }[] = [
  {
    key: "lanes",
    label: "Shipping lanes",
    hint: "Indicative maritime routes",
    swatch: "#a8c8ea",
  },
  {
    key: "ports",
    label: "Major ports",
    hint: "300 busiest, sized by vessel traffic",
    swatch: "#7fb2e8",
  },
  {
    key: "chokepoints",
    label: "Chokepoints",
    hint: "28 straits and canals, drawn as rings",
    swatch: "#e8a33d",
  },
];

export default function GlobalDashboard({
  briefings,
  events,
}: {
  briefings: Briefing[];
  events: MapEvent[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerToggles>({
    lanes: false,
    ports: false,
    chokepoints: false,
  });

  // Peak exposure per country, still computed — the drawer and the tooltip use
  // it even though nothing paints the whole world with it any more.
  const scores = useMemo(() => {
    const out: Record<string, number> = {};
    for (const b of briefings) {
      for (const a of b.rankings?.affected ?? []) {
        out[a.country] = Math.max(out[a.country] ?? 0, a.score ?? 0);
      }
    }
    return out;
  }, [briefings]);

  const { baskets, sources } = useMemo(() => {
    const scored = briefings.filter((b) => b.rankings?.baskets?.length);
    const widest = scored.sort(
      (a, b) => b.rankings!.baskets!.length - a.rankings!.baskets!.length,
    )[0];
    return {
      baskets: widest?.rankings?.baskets ?? ["crude_oil"],
      sources: widest?.rankings?.sources ?? [],
    };
  }, [briefings]);

  const exposureFor = (iso3: string) =>
    briefings
      .flatMap((b) => b.rankings?.affected ?? [])
      .filter((a) => a.country === iso3)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

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
                background: on ? `color-mix(in srgb, ${meta.swatch} 14%, transparent)` : "transparent",
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

      <GlobalMap
        scores={scores}
        events={events}
        selected={selected}
        onSelect={setSelected}
        layers={layers}
      />

      <CountryDrawer
        country={selected}
        baskets={baskets}
        sources={sources}
        exposure={selected ? exposureFor(selected) : undefined}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
