/**
 * Marine labels for both maps.
 *
 * MapLibre renders text through a `glyphs` font endpoint, and these maps
 * deliberately ship no glyphs — an explicit `glyphs: undefined` aborts style
 * validation, and hosting font PBFs would be a build dependency for twenty
 * static labels. So the labels are DOM markers, the same mechanism as the
 * chokepoint radar ping: they inherit the theme through CSS variables for
 * free, and they cost nothing at style-load time.
 *
 * Seas hide below a zoom threshold so the world view stays readable; the
 * five oceans are always on.
 */

const SEA_MIN_ZOOM = 2.4;

interface MarineLabel {
  name: string;
  rank: "ocean" | "sea";
  lat: number;
  lon: number;
}

interface MarkerLike {
  remove: () => void;
}

interface MapLike {
  getZoom: () => number;
  on: (event: string, handler: () => void) => void;
}

interface MapLibreLike {
  Marker: new (options: { element: HTMLElement }) => {
    setLngLat: (coords: [number, number]) => {
      addTo: (map: MapLike) => MarkerLike;
    };
  };
}

/**
 * Adds the labels and keeps sea visibility in step with zoom.
 * Returns a disposer; the caller already tears the map down on unmount, but
 * markers live outside the canvas and must be removed explicitly.
 */
export async function addOceanLabels(
  maplibre: MapLibreLike,
  map: MapLike,
): Promise<() => void> {
  let labels: MarineLabel[] = [];
  try {
    const response = await fetch("/layers/oceans.json");
    labels = (await response.json()).labels ?? [];
  } catch {
    return () => {};
  }

  const markers: MarkerLike[] = [];
  const seaElements: HTMLElement[] = [];

  for (const label of labels) {
    const el = document.createElement("div");
    el.className = `marine-label marine-${label.rank}`;
    el.textContent = label.name;
    if (label.rank === "sea") seaElements.push(el);
    markers.push(
      new maplibre.Marker({ element: el }).setLngLat([label.lon, label.lat]).addTo(map),
    );
  }

  const syncZoom = () => {
    const show = map.getZoom() >= SEA_MIN_ZOOM;
    for (const el of seaElements) el.style.display = show ? "" : "none";
  };
  syncZoom();
  map.on("zoom", syncZoom);

  return () => {
    for (const marker of markers) marker.remove();
  };
}
