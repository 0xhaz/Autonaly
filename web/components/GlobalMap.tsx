"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The landing map: every live event on one world view.
 *
 * A knowledge platform should open on the world, not on a work queue. Country
 * shading is the *worst* exposure any current event puts on that country — a max
 * rather than a sum, because two unrelated crises scoring 30 each do not make a
 * 60, and adding them would invent a severity nothing measured.
 *
 * Event markers sit at the chokepoint's real coordinates, so "where is this
 * happening" is answered by the map rather than by reading a title.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MapLibre = any;

const MAPLIBRE_URL = "/vendor/maplibre/maplibre-gl.mjs";

// Single-hue sequential blue, dark->light for a dark surface.
const RAMP_COLORS = ["#104281", "#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"];
const MIN_DOMAIN = 5;

function rampStops(maxScore: number): (number | string)[] {
  const domain = Math.max(MIN_DOMAIN, maxScore);
  return RAMP_COLORS.flatMap((color, i) => [
    (domain * i) / (RAMP_COLORS.length - 1),
    color,
  ]);
}

export interface MapEvent {
  id: string;
  title: string;
  status: string;
  scoring: string;
  lat: number;
  lon: number;
  unscored: boolean;
}

interface WorldFeature {
  type: "Feature";
  properties: { iso3: string; name: string };
  geometry: unknown;
}

export default function GlobalMap({
  scores,
  events,
  selected,
  onSelect,
}: {
  scores: Record<string, number>;
  events: MapEvent[];
  selected?: string | null;
  onSelect?: (iso3: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre>(null);
  const [world, setWorld] = useState<{ features: WorldFeature[] } | null>(null);

  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

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
      const maplibre: MapLibre = await import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ MAPLIBRE_URL
      );
      if (disposed || !container.current || map.current) return;

      const maxScore = Math.max(0, ...Object.values(scores));

      const scored = {
        type: "FeatureCollection" as const,
        features: world.features.map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            score: scores[f.properties.iso3] ?? 0,
            scored: scores[f.properties.iso3] !== undefined ? 1 : 0,
          },
        })),
      };

      const eventPoints = {
        type: "FeatureCollection" as const,
        features: events
          .filter((e) => e.lat !== 0 || e.lon !== 0)
          .map((e) => ({
            type: "Feature" as const,
            properties: { id: e.id, title: e.title, unscored: e.unscored ? 1 : 0 },
            geometry: { type: "Point" as const, coordinates: [e.lon, e.lat] },
          })),
      };

      const style = {
        version: 8,
        sources: {
          world: { type: "geojson", data: scored },
          events: { type: "geojson", data: eventPoints },
        },
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
          {
            id: "selection",
            type: "line",
            source: "world",
            filter: ["==", ["get", "iso3"], selected ?? "__none__"],
            paint: { "line-color": "#e8a33d", "line-width": 2 },
          },
          // Halo then core, so a marker reads against any shading beneath it.
          {
            id: "event-halo",
            type: "circle",
            source: "events",
            paint: {
              "circle-radius": 11,
              "circle-color": [
                "case",
                ["==", ["get", "unscored"], 1],
                "#fab219",
                "#d03b3b",
              ],
              "circle-opacity": 0.18,
            },
          },
          {
            id: "event-core",
            type: "circle",
            source: "events",
            paint: {
              "circle-radius": 4.5,
              "circle-color": [
                "case",
                ["==", ["get", "unscored"], 1],
                "#fab219",
                "#d03b3b",
              ],
              "circle-stroke-width": 1.5,
              "circle-stroke-color": "#0b0f14",
            },
          },
        ],
      };

      const m = new maplibre.Map({
        container: container.current,
        style,
        // Centred on the landmass band rather than the equator: the world's
        // trade sits north of it, and an equator-centred view spends its lower
        // third on empty ocean.
        center: [30, 32],
        zoom: 1.45,
        attributionControl: false,
      });
      map.current = m;
      m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

      const popup = new maplibre.Popup({ closeButton: false, closeOnMove: true });

      const showPopup = (
        event: { lngLat: unknown; features?: unknown[] },
        html: string,
      ) => {
        m.getCanvas().style.cursor = "pointer";
        popup.setLngLat(event.lngLat).setHTML(html).addTo(m);
      };

      m.on("mousemove", "countries", (event: { features?: unknown[]; lngLat: unknown }) => {
        const f = event.features?.[0] as { properties: Record<string, unknown> } | undefined;
        if (!f) return;
        const p = f.properties;
        showPopup(
          event,
          `<div style="font:12px ui-sans-serif;color:#0b0f14">
             <strong>${p.name}</strong><br/>
             ${p.scored ? `peak exposure ${Number(p.score).toFixed(1)}/100` : "not currently exposed"}
           </div>`,
        );
      });

      m.on("mousemove", "event-core", (event: { features?: unknown[]; lngLat: unknown }) => {
        const f = event.features?.[0] as { properties: Record<string, unknown> } | undefined;
        if (!f) return;
        showPopup(
          event,
          `<div style="font:12px ui-sans-serif;color:#0b0f14"><strong>${f.properties.title}</strong></div>`,
        );
      });

      m.on("mouseleave", "countries", () => {
        m.getCanvas().style.cursor = "";
        popup.remove();
      });

      m.on("click", "countries", (event: { features?: unknown[] }) => {
        const f = event.features?.[0] as { properties: Record<string, unknown> } | undefined;
        const iso3 = f?.properties?.iso3;
        if (typeof iso3 === "string") onSelectRef.current?.(iso3);
      });
    })();

    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      if (!map.current?.getLayer?.("selection")) return;
      try {
        map.current.setFilter("selection", ["==", ["get", "iso3"], selected ?? "__none__"]);
      } catch {
        // Decoration only — never surface as a page error.
      }
    };
    if (m.isStyleLoaded()) apply();
    else m.once("idle", apply);
  }, [selected, world]);

  const domainMax = Math.max(MIN_DOMAIN, ...Object.values(scores));

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
          <span>peak exposure</span>
          <span className="mono">0</span>
          <span
            className="h-2 w-32 rounded-sm"
            style={{ background: `linear-gradient(to right, ${RAMP_COLORS.join(",")})` }}
          />
          <span className="mono">{domainMax.toFixed(1)}</span>
        </span>
        <span style={{ color: "#d03b3b" }}>● scored event</span>
        <span style={{ color: "#fab219" }}>● unscored — data quality</span>
        <span className="ml-auto">click any country to inspect</span>
      </div>
    </div>
  );
}
