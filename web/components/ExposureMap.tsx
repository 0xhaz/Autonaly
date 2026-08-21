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
// Semantic heat ramp: risk is the canonical case where multi-hue is right —
// blue reads calm, yellow elevated, red severe, and the scale legend makes the
// mapping explicit. The domain still adapts to the briefing's actual range so a
// bypass-attenuated event is not stretched to full red.
// ColorBrewer RdYlBu (reversed): its pale-yellow centre is the point — a naive
// blue->yellow blend passes through muddy olive, and this ramp is engineered
// not to.
const RAMP_COLORS = ["#4575b4", "#91bfdb", "#ffe090", "#fc8d59", "#d73027"];

// Land outside the ranking has to be visible against the water without competing
// with the ramp. Lightness alone cannot do that job here — a light neutral made
// unranked countries read as *more* prominent than genuinely low-scoring ones,
// inverting the meaning. So hue carries the distinction: grey means "not ranked",
// blue is reserved for magnitude, and lightness varies only within the blue.
// MapLibre cannot read CSS variables; tokens resolve at init and the map
// rebuilds on theme change (themeVersion in the init effect deps).
const cssColor = (name: string, fallback: string): string => {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
  );
};


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

export interface MapMarker {
  lat: number;
  lon: number;
  label: string;
}

export default function ExposureMap({
  affected,
  highlight,
  selected,
  onSelect,
  marker,
}: {
  affected: AffectedCountry[];
  highlight?: string | null;
  selected?: string | null;
  onSelect?: (iso3: string) => void;
  marker?: MapMarker | null;
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

  const [themeVersion, setThemeVersion] = useState(0);
  useEffect(() => {
    const bump = () => setThemeVersion((v) => v + 1);
    window.addEventListener("autonaly-theme", bump);
    return () => window.removeEventListener("autonaly-theme", bump);
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

    const OCEAN = cssColor("--map-ocean", "#0d1620");
    const UNSCORED = cssColor("--map-unscored", "#333b44");
    const AMBER = cssColor("--warn", "#e8a33d");
    const BORDER = cssColor("--map-border", "#4a5866");
    const HOVER_OUTLINE = cssColor("--map-lane", "#cfe2fb");
    // "Largest value at risk" outline: maximum contrast against the fill in
    // either theme.
    const LARGEST = cssColor("--text", "#ffffff");

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
      // promoteId makes iso3 the feature id, which feature-state needs to
      // track the country under the cursor.
      sources: { world: { type: "geojson", data: scored, promoteId: "iso3" } },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": OCEAN } },
        {
          id: "countries",
          type: "fill",
          source: "world",
          paint: {
            "fill-color": [
              "case",
              ["==", ["get", "scored"], 0],
              UNSCORED,
              ["interpolate", ["linear"], ["get", "score"], ...rampStops(maxScore)],
            ],
            // Base layer; hover brings a single country forward.
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              1,
              0.55,
            ],
          },
        },
        {
          id: "hover-outline",
          type: "line",
          source: "world",
          paint: {
            "line-color": HOVER_OUTLINE,
            "line-width": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              1.6,
              0,
            ],
          },
        },
        {
          id: "borders",
          type: "line",
          source: "world",
          paint: { "line-color": BORDER, "line-width": 0.5 },
        },
        ...(highlight
          ? [
              {
                id: "highlight",
                type: "line",
                source: "world",
                filter: ["==", ["get", "iso3"], highlight],
                paint: { "line-color": LARGEST, "line-width": 1.6 },
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
          paint: { "line-color": AMBER, "line-width": 2 },
        },
      ],
    };

    const m = new maplibre.Map({
      container: container.current,
      style,
      center: [15, 25],
      zoom: 1.05,
      attributionControl: false,
      // Without this the world repeats horizontally as you zoom out, so the
      // same country appears several times. minZoom keeps the globe filling
      // the frame. maxBounds was tried and removed — with a zoom floor it
      // crashed MapLibre's transform maths.
      renderWorldCopies: false,
      minZoom: 1.1,
    });
    map.current = m;

    m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

    if (marker) {
      // A DOM marker rather than a symbol layer: CSS animates the radar ping
      // for free, and there is exactly one of these per map.
      const el = document.createElement("div");
      el.className = "radar-marker";
      el.title = marker.label;
      el.innerHTML =
        '<span class="ring"></span><span class="ring delay"></span><span class="core"></span>';
      new maplibre.Marker({ element: el })
        .setLngLat([marker.lon, marker.lat])
        .addTo(m);
    }

    const popup = new maplibre.Popup({ closeButton: false, closeOnMove: true });

    let hovered: string | null = null;
    const setHover = (iso3: string | null) => {
      if (hovered === iso3) return;
      if (hovered) m.setFeatureState({ source: "world", id: hovered }, { hover: false });
      hovered = iso3;
      if (hovered) m.setFeatureState({ source: "world", id: hovered }, { hover: true });
    };

    m.on("mousemove", "countries", (event: { features?: unknown[]; lngLat: unknown }) => {
      const feature = event.features?.[0] as { properties: Record<string, unknown> } | undefined;
      if (!feature) return;
      const props = feature.properties;
      setHover(typeof props.iso3 === "string" ? props.iso3 : null);
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
      setHover(null);
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
  }, [world, themeVersion]);

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
          <span>risk</span>
          <span className="mono">0</span>
          <span
            className="h-2 w-32 rounded-sm"
            style={{ background: `linear-gradient(to right, ${RAMP_COLORS.join(",")})` }}
          />
          <span className="mono">{domainMax.toFixed(1)}</span>
          <span>low → severe</span>
        </span>
        {marker && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "#ff5148" }}
            />
            {marker.label}
          </span>
        )}
        <span>· bright outline = largest value at risk</span>
        <span style={{ color: "#e8a33d" }}>· amber = selected</span>
        <span className="ml-auto">click any country to inspect</span>
      </div>
    </div>
  );
}
