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

// The landing map is an explorer, not a heatmap. Countries rest in the surface
// neutral so nothing competes for attention; the cursor is what lights a country
// up, and a committed selection holds a deeper blue. Exposure still travels with
// the country — it is in the hover tooltip and in the drawer — it just no longer
// paints twenty fills at once.
// Land has to separate from two things at once: the ocean inside the frame and
// the page behind it. At #151d28 it did neither — the map read as an empty
// rectangle. Land now sits several steps above the water, and the water sits a
// step above the page, so the frame has depth without any of it competing with
// the interaction colours.
const OCEAN = "#0d1620";
const NEUTRAL = "#27384c";
const BORDER = "#42586e";
const HOVER = "#3987e5";
const SELECTED = "#1c5cab";

const EMPTY = { type: "FeatureCollection", features: [] } as const;

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

export interface LayerToggles {
  lanes: boolean;
  ports: boolean;
  chokepoints: boolean;
}

export default function GlobalMap({
  scores,
  events,
  selected,
  onSelect,
  layers,
}: {
  scores: Record<string, number>;
  events: MapEvent[];
  selected?: string | null;
  onSelect?: (iso3: string) => void;
  layers: LayerToggles;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre>(null);
  const [world, setWorld] = useState<{ features: WorldFeature[] } | null>(null);

  const onSelectRef = useRef(onSelect);
  const prevSelected = useRef<string | null>(null);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const [overlays, setOverlays] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/world.geo.json").then((r) => r.json()),
      // Optional layers load once and stay in memory; toggling is a visibility
      // change, not a refetch.
      fetch("/layers/shipping-lanes.geo.json").then((r) => r.json()).catch(() => null),
      fetch("/layers/ports.geo.json").then((r) => r.json()).catch(() => null),
      fetch("/layers/chokepoints.geo.json").then((r) => r.json()).catch(() => null),
    ])
      .then(([w, lanes, ports, chokepoints]) => {
        if (cancelled) return;
        setOverlays({ lanes, ports, chokepoints });
        setWorld(w);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!container.current || !world || !overlays || map.current) return;
    let disposed = false;

    (async () => {
      const maplibre: MapLibre = await import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ MAPLIBRE_URL
      );
      if (disposed || !container.current || map.current) return;

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
          // promoteId makes iso3 the feature id, which is what feature-state
          // needs in order to track which country is under the cursor.
          world: { type: "geojson", data: scored, promoteId: "iso3" },
          events: { type: "geojson", data: eventPoints },
          lanes: { type: "geojson", data: overlays.lanes ?? EMPTY },
          ports: { type: "geojson", data: overlays.ports ?? EMPTY },
          chokepoints: { type: "geojson", data: overlays.chokepoints ?? EMPTY },
        },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": OCEAN } },
          {
            id: "countries",
            type: "fill",
            source: "world",
            paint: {
              "fill-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                SELECTED,
                ["boolean", ["feature-state", "hover"], false],
                HOVER,
                NEUTRAL,
              ],
              "fill-opacity": 1,
            },
          },
          {
            id: "hover-outline",
            type: "line",
            source: "world",
            paint: {
              "line-color": "#cfe2fb",
              "line-width": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                1.4,
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
          // --- optional layers, hidden until the reader asks for them ---
          {
            id: "lanes",
            type: "line",
            source: "lanes",
            layout: { visibility: "none", "line-cap": "round" },
            paint: {
              // Lanes have to read over both ocean and land, and at 0.5 opacity
              // over dark water they effectively vanished.
              "line-color": "#a8c8ea",
              "line-width": 0.8,
              "line-opacity": 0.75,
              // Dotted, because these are indicative lanes rather than surveyed
              // routes — a solid line would claim more precision than the data has.
              "line-dasharray": [2, 2.5],
            },
          },
          {
            id: "ports",
            type: "circle",
            source: "ports",
            layout: { visibility: "none" },
            paint: {
              // Radius carries vessel traffic, so the busiest ports read first.
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["get", "vessels"],
                0, 1.6,
                20000, 3.4,
                120000, 6,
              ],
              "circle-color": "#7fb2e8",
              "circle-opacity": 0.85,
              "circle-stroke-width": 0.5,
              "circle-stroke-color": OCEAN,
            },
          },
          {
            id: "chokepoints",
            type: "circle",
            source: "chokepoints",
            layout: { visibility: "none" },
            paint: {
              // Hollow ring, not a filled dot. Chokepoints would otherwise be the
              // same amber as an unscored *event* marker, and the two mean very
              // different things — one is permanent geography, the other is a
              // briefing that could not be scored. Form separates them where
              // colour alone would not.
              "circle-radius": 5.5,
              "circle-color": "rgba(0,0,0,0)",
              "circle-stroke-width": 1.6,
              "circle-stroke-color": "#e8a33d",
              "circle-opacity": 1,
            },
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
              "circle-stroke-color": OCEAN,
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
        // Without this the world repeats horizontally as you zoom out, so the
        // same country appears several times and the event markers duplicate
        // with it. minZoom keeps the globe filling the frame.
        //
        // maxBounds was tried here and removed: combined with a zoom floor it
        // produced an unsatisfiable constraint and crashed MapLibre's transform
        // maths on zoom-out.
        renderWorldCopies: false,
        minZoom: 1.1,
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

      let hovered: string | null = null;
      const setHover = (iso3: string | null) => {
        if (hovered === iso3) return;
        if (hovered) m.setFeatureState({ source: "world", id: hovered }, { hover: false });
        hovered = iso3;
        if (hovered) m.setFeatureState({ source: "world", id: hovered }, { hover: true });
      };

      m.on("mousemove", "countries", (event: { features?: unknown[]; lngLat: unknown }) => {
        const f = event.features?.[0] as
          | { id?: string; properties: Record<string, unknown> }
          | undefined;
        if (!f) return;
        const p = f.properties;
        setHover(typeof p.iso3 === "string" ? p.iso3 : null);
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

      for (const [layer, label] of [
        ["ports", "port"],
        ["chokepoints", "chokepoint"],
      ] as const) {
        m.on("mousemove", layer, (event: { features?: unknown[]; lngLat: unknown }) => {
          const f = event.features?.[0] as
            | { properties: Record<string, unknown> }
            | undefined;
          if (!f) return;
          const vessels = Number(f.properties.vessels || 0);
          showPopup(
            event,
            `<div style="font:12px ui-sans-serif;color:#0b0f14">
               <strong>${f.properties.name}</strong><br/>
               ${label} · ${vessels.toLocaleString()} vessels/yr
             </div>`,
          );
        });
        m.on("mouseleave", layer, () => {
          m.getCanvas().style.cursor = "";
          popup.remove();
        });
      }

      m.on("mouseleave", "countries", () => {
        m.getCanvas().style.cursor = "";
        setHover(null);
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
  }, [world, overlays]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      const map_ = map.current;
      if (!map_?.getLayer?.("lanes")) return;
      for (const [id, on] of [
        ["lanes", layers.lanes],
        ["ports", layers.ports],
        ["chokepoints", layers.chokepoints],
      ] as const) {
        map_.setLayoutProperty(id, "visibility", on ? "visible" : "none");
      }
    };
    if (m.isStyleLoaded()) apply();
    else m.once("idle", apply);
  }, [layers, world, overlays]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const apply = () => {
      const map_ = map.current;
      if (!map_?.getSource?.("world")) return;
      try {
        if (prevSelected.current) {
          map_.setFeatureState(
            { source: "world", id: prevSelected.current },
            { selected: false },
          );
        }
        prevSelected.current = selected ?? null;
        if (selected) {
          map_.setFeatureState({ source: "world", id: selected }, { selected: true });
        }
      } catch {
        // Selection colour is presentation. Losing it must never surface as a
        // page error — the drawer already names the selected country.
      }
    };

    if (m.isStyleLoaded()) apply();
    else m.once("idle", apply);
  }, [selected, world]);


  return (
    <div className="space-y-2">
      <div
        ref={container}
        className="h-[min(80vh,900px)] w-full overflow-hidden rounded-lg"
        style={{ border: "1px solid var(--line)" }}
      />
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]"
        style={{ color: "var(--muted)" }}
      >
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: HOVER }}
          />
          hover
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: SELECTED }}
          />
          selected
        </span>
        <span style={{ color: "#d03b3b" }}>● scored event</span>
        <span style={{ color: "#fab219" }}>● unscored — data quality</span>
        <span className="ml-auto">click any country to inspect</span>
      </div>
    </div>
  );
}
