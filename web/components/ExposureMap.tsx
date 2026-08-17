"use client";

// MapLibre v5 ships named exports only — there is no default export.
import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { useEffect, useRef } from "react";

import type { AffectedCountry } from "@/lib/types";

/**
 * Exposure choropleth.
 *
 * Deliberately has no basemap and no tile server: the country polygons ship as a
 * 248KB GeoJSON in /public and MapLibre renders them directly. That keeps the
 * page working offline, which matters when the demo is being recorded and when a
 * judge runs the repo cold.
 */

// Sequential ramp over the 0-100 score. Kept coarse on purpose — the table
// carries the precise figures, the map carries the shape of the story.
const RAMP: [number, string][] = [
  [0, "#1b2735"],
  [10, "#1d3a5c"],
  [25, "#1f5c86"],
  [45, "#2b83a6"],
  [65, "#e8a33d"],
  [85, "#d1495b"],
];

export default function ExposureMap({
  affected,
  highlight,
}: {
  affected: AffectedCountry[];
  highlight?: string | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    if (!container.current || map.current) return;

    const scores = new Map(affected.map((a) => [a.country, a.score ?? 0]));

    map.current = new MapLibreMap({
      container: container.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#0b0f14" } },
        ],
        glyphs: undefined,
      },
      center: [15, 25],
      zoom: 1.1,
      attributionControl: false,
    });

    const m = map.current;
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");

    m.on("load", async () => {
      const response = await fetch("/world.geo.json");
      const world = await response.json();

      // Score is joined onto the geometry here rather than via a feature-state
      // round trip — the dataset is 177 features, so simplicity wins.
      for (const feature of world.features) {
        const iso3 = feature.properties.iso3;
        feature.properties.score = scores.get(iso3) ?? null;
        feature.properties.scored = scores.has(iso3) ? 1 : 0;
      }

      m.addSource("world", { type: "geojson", data: world });

      m.addLayer({
        id: "countries",
        type: "fill",
        source: "world",
        paint: {
          "fill-color": [
            "case",
            ["==", ["get", "scored"], 0],
            "#131a24",
            ["interpolate", ["linear"], ["get", "score"], ...RAMP.flat()],
          ],
          "fill-opacity": 0.92,
        },
      });

      m.addLayer({
        id: "borders",
        type: "line",
        source: "world",
        paint: { "line-color": "#2a3a47", "line-width": 0.4 },
      });

      if (highlight) {
        m.addLayer({
          id: "highlight",
          type: "line",
          source: "world",
          filter: ["==", ["get", "iso3"], highlight],
          paint: { "line-color": "#ffffff", "line-width": 1.6 },
        });
      }

      const popup = new Popup({
        closeButton: false,
        className: "autonaly-popup",
      });

      m.on("mousemove", "countries", (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const { name, score, scored } = feature.properties as Record<string, unknown>;
        m.getCanvas().style.cursor = "pointer";
        popup
          .setLngLat(event.lngLat)
          .setHTML(
            `<div style="font:12px ui-sans-serif;color:#e6edf6">
               <strong>${name}</strong><br/>
               ${scored ? `exposure ${Number(score).toFixed(1)}/100` : "not ranked"}
             </div>`,
          )
          .addTo(m);
      });

      m.on("mouseleave", "countries", () => {
        m.getCanvas().style.cursor = "";
        popup.remove();
      });
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [affected, highlight]);

  return (
    <div
      ref={container}
      className="h-[380px] w-full overflow-hidden rounded-lg"
      style={{ border: "1px solid var(--line)" }}
    />
  );
}
