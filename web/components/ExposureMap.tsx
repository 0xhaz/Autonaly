"use client";

import { useEffect, useRef, useState } from "react";

import type { AffectedCountry } from "@/lib/types";

/**
 * Exposure choropleth.
 *
 * No basemap and no tile server: the country polygons ship as a 248KB GeoJSON in
 * /public and MapLibre renders them directly, so the page works offline — during
 * a recording, and for anyone running the repo cold.
 *
 * The geometry is fetched *before* the map is constructed and the source is
 * declared inline in the style. That ordering is deliberate. Building the map
 * first and calling addSource/addLayer afterwards races against React re-running
 * this effect — `affected` is a fresh array identity on every render — which
 * tore the map down mid-initialisation and left a dead instance. The only
 * symptom was a source that never finished loading: no exception, no render, and
 * an internal "no tile manager" error visible only from a debugger.
 *
 * MapLibre is loaded from /vendor/maplibre rather than imported through the
 * bundler, and that is not a stylistic choice. MapLibre spawns its tile worker
 * with `new Worker(new URL("./maplibre-gl-worker.mjs", import.meta.url))`.
 * Inside a Next bundle `import.meta.url` resolves to the page chunk, so the
 * worker is handed the HTML document to execute. It fails silently: the map
 * builds, layers attach, and every source stays permanently unloaded with an
 * empty canvas and no error. Serving MapLibre's own dist keeps that relative URL
 * correct. The files are copied from node_modules by a prebuild step, so nothing
 * vendored is committed and the page still needs no network.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MapLibre = any;

const MAPLIBRE_URL = "/vendor/maplibre/maplibre-gl.mjs";

// Sequential ramp, applied across the range this briefing actually spans rather
// than a fixed 0-100. A chokepoint with a bypass legitimately scores 1-3, and on
// an absolute scale the whole map renders near-black — technically faithful and
// completely unreadable. The legend below the map states the range so the
// shading can never imply a severity the numbers do not support.
// Single-hue sequential blue, dark->light for a dark surface, so "near zero"
// recedes toward the background. The earlier ramp ran blue->teal->amber->red,
// which is the rainbow-for-magnitude anti-pattern: multi-hue ramps invent
// category boundaries the data does not have.
const RAMP_COLORS = ["#104281", "#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"];

// Never stretch a trivial range into a full-spectrum map.
const MIN_DOMAIN = 5;

function rampStops(maxScore: number): (number | string)[] {
  const domain = Math.max(MIN_DOMAIN, maxScore);
  return RAMP_COLORS.flatMap((color, i) => [
    (domain * i) / (RAMP_COLORS.length - 1),
    color,
  ]);
}

interface WorldFeature {
  type: "Feature";
  properties: { iso3: string; name: string };
  geometry: unknown;
}

export default function ExposureMap({
  affected,
  highlight,
  selected,
  onSelect,
}: {
  affected: AffectedCountry[];
  highlight?: string | null;
  selected?: string | null;
  onSelect?: (iso3: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre>(null);
  // Held in a ref so a new callback identity never rebuilds the map. Assigned in
  // an effect, since writing a ref during render is not allowed.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const [world, setWorld] = useState<{ features: WorldFeature[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/world.geo.json")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setWorld(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!container.current || !world || map.current) return;
    let disposed = false;

    (async () => {
      // Non-literal specifier: a string literal here makes TypeScript try to
      // resolve a runtime URL as a module path, and the magic comments keep the
      // bundler from rewriting it.
      const maplibre: MapLibre = await import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ MAPLIBRE_URL
      );
      if (disposed || !container.current || map.current) return;

    const scores = new Map(affected.map((a) => [a.country, a.score ?? 0]));
    const maxScore = Math.max(0, ...affected.map((a) => a.score ?? 0));
    const scored = {
      type: "FeatureCollection" as const,
      features: world.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          // Always numeric: a null makes the fill-color `interpolate`
          // unevaluable inside the tile worker.
          score: scores.get(f.properties.iso3) ?? 0,
          scored: scores.has(f.properties.iso3) ? 1 : 0,
        },
      })),
    };

    const style = {
      version: 8,
      // No `glyphs` key at all: MapLibre validates the spec strictly, and an
      // explicit `glyphs: undefined` fails as "string expected", aborting the
      // style load and leaving an empty canvas.
      sources: { world: { type: "geojson", data: scored } },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": "#0b0f14" } },
        {
          id: "countries",
          type: "fill",
          source: "world",
          paint: {
            "fill-color": [
              "case",
              ["==", ["get", "scored"], 0],
              "#131a24",
              ["interpolate", ["linear"], ["get", "score"], ...rampStops(maxScore)],
            ],
            "fill-opacity": 0.92,
          },
        },
        {
          id: "borders",
          type: "line",
          source: "world",
          paint: { "line-color": "#2a3a47", "line-width": 0.4 },
        },
        ...(highlight
          ? [
              {
                id: "highlight",
                type: "line",
                source: "world",
                filter: ["==", ["get", "iso3"], highlight],
                paint: { "line-color": "#ffffff", "line-width": 1.6 },
              },
            ]
          : []),
        // Declared in the style rather than added afterwards: addLayer before
        // the style finishes loading throws "Style is not done loading".
        {
          id: "selection",
          type: "line",
          source: "world",
          filter: ["==", ["get", "iso3"], selected ?? "__none__"],
          paint: { "line-color": "#e8a33d", "line-width": 2 },
        },
      ],
    };

    const m = new maplibre.Map({
      container: container.current,
      style,
      center: [15, 25],
      zoom: 1.05,
      attributionControl: false,
    });
    map.current = m;

    m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

    const popup = new maplibre.Popup({ closeButton: false, closeOnMove: true });

    m.on("mousemove", "countries", (event: { features?: unknown[]; lngLat: unknown }) => {
      const feature = event.features?.[0] as { properties: Record<string, unknown> } | undefined;
      if (!feature) return;
      const props = feature.properties;
      m.getCanvas().style.cursor = "pointer";
      popup
        .setLngLat(event.lngLat)
        .setHTML(
          `<div style="font:12px ui-sans-serif;color:#0b0f14">
             <strong>${props.name}</strong><br/>
             ${props.scored ? `exposure ${Number(props.score).toFixed(1)}/100` : "not ranked"}
           </div>`,
        )
        .addTo(m);
    });

    m.on("mouseleave", "countries", () => {
      m.getCanvas().style.cursor = "";
      popup.remove();
    });

    m.on("click", "countries", (event: { features?: unknown[] }) => {
      const feature = event.features?.[0] as
        | { properties: Record<string, unknown> }
        | undefined;
      const iso3 = feature?.properties?.iso3;
      if (typeof iso3 === "string") onSelectRef.current?.(iso3);
    });


    })();

    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
    // `affected` and `highlight` are read at construction. They describe a single
    // briefing and do not change while this page is mounted, so rebuilding the
    // map on their identity would only reintroduce the teardown race.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    // The style can still be loading when a selection arrives (the initial
    // selection is set before first paint), and setFilter throws with
    // "Style is not done loading" — apply it on `idle` in that case.
    const apply = () => {
      if (!map.current?.getLayer?.("selection")) return;
      try {
        map.current.setFilter("selection", [
          "==",
          ["get", "iso3"],
          selected ?? "__none__",
        ]);
      } catch {
        // A selection outline is decoration. Losing it must never surface as a
        // page error — the panel below already states which country is selected.
      }
    };
    if (m.isStyleLoaded()) apply();
    else m.once("idle", apply);
  }, [selected, world]);

  const domainMax = Math.max(MIN_DOMAIN, ...affected.map((a) => a.score ?? 0));

  return (
    <div className="space-y-2">
      <div
        ref={container}
        className="h-[520px] w-full overflow-hidden rounded-lg"
        style={{ border: "1px solid var(--line)" }}
      />
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]"
        style={{ color: "var(--muted)" }}
      >
        <span className="flex items-center gap-2">
          <span>exposure score</span>
          <span className="mono">0</span>
          <span
            className="h-2 w-32 rounded-sm"
            style={{ background: `linear-gradient(to right, ${RAMP_COLORS.join(",")})` }}
          />
          <span className="mono">{domainMax.toFixed(1)}</span>
        </span>
        <span>· white outline = largest value at risk</span>
        <span style={{ color: "#e8a33d" }}>· amber = selected</span>
        <span className="ml-auto">click any country to inspect</span>
      </div>
    </div>
  );
}
