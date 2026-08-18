"""Optional map layers: shipping lanes, ports, chokepoints.

Different audiences want different things on the same map. A macro analyst wants
the maritime network — which lanes carry trade, which straits they funnel
through, which ports anchor them. A general reader wants none of it. So these
ship as layers the reader turns on, not as permanent furniture.

All three are static geometry, so they live in the web bundle rather than behind
the engine — no request, no cold start, and the map still works offline.

    uv run python scripts/fetch_map_layers.py

Source: IMF PortWatch (UN Global Platform).
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT = REPO_ROOT / "web" / "public" / "layers"
ROOT = "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services"

ROUTES = f"{ROOT}/Global_Shipping_Routes/FeatureServer/15/query"
PORTS = f"{ROOT}/PortWatch_ports_database/FeatureServer/0/query"
CHOKEPOINTS = f"{ROOT}/PortWatch_chokepoints_database/FeatureServer/0/query"

# 2,065 ports is noise at world zoom and a slow layer. The busiest few hundred
# carry the story and stay legible.
PORT_LIMIT = 300


def get(url: str, params: dict) -> dict:
    query = urllib.parse.urlencode(params)
    with urllib.request.urlopen(f"{url}?{query}", timeout=120) as response:  # noqa: S310
        return json.load(response)


def shipping_lanes() -> dict:
    payload = get(ROUTES, {"where": "1=1", "outFields": "FID", "f": "json"})
    paths: list[list[list[float]]] = []
    for feature in payload.get("features", []):
        paths.extend(feature.get("geometry", {}).get("paths", []))

    # Round to 3dp (~110m). Lane geometry is indicative, not navigational, and
    # full precision triples the file for no visible difference.
    trimmed = [[[round(x, 3), round(y, 3)] for x, y in path] for path in paths if len(path) > 1]

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {},
                "geometry": {"type": "MultiLineString", "coordinates": trimmed},
            }
        ],
    }


def ports() -> dict:
    payload = get(
        PORTS,
        {
            "where": "1=1",
            "outFields": "portname,country,ISO3,lat,lon,vessel_count_total,industry_top1",
            "orderByFields": "vessel_count_total DESC",
            "resultRecordCount": str(PORT_LIMIT),
            "returnGeometry": "false",
            "f": "json",
        },
    )
    features = []
    for row in payload.get("features", []):
        a = row["attributes"]
        if a.get("lat") is None or a.get("lon") is None:
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "name": a.get("portname"),
                    "iso3": a.get("ISO3"),
                    "country": a.get("country"),
                    "vessels": a.get("vessel_count_total") or 0,
                    "industry": a.get("industry_top1"),
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [round(a["lon"], 4), round(a["lat"], 4)],
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


def chokepoints() -> dict:
    payload = get(
        CHOKEPOINTS,
        {
            "where": "1=1",
            "outFields": "portname,lat,lon,vessel_count_total,industry_top1",
            "returnGeometry": "false",
            "f": "json",
        },
    )
    features = []
    for row in payload.get("features", []):
        a = row["attributes"]
        if a.get("lat") is None:
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "name": a.get("portname"),
                    "vessels": a.get("vessel_count_total") or 0,
                    "industry": a.get("industry_top1"),
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [round(a["lon"], 4), round(a["lat"], 4)],
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    print("\n  Map layers — IMF PortWatch\n")

    for name, builder in (
        ("shipping-lanes", shipping_lanes),
        ("ports", ports),
        ("chokepoints", chokepoints),
    ):
        data = builder()
        path = OUT / f"{name}.geo.json"
        path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
        count = (
            len(data["features"][0]["geometry"]["coordinates"])
            if name == "shipping-lanes"
            else len(data["features"])
        )
        print(f"  {name:16s} {count:5d} features   {path.stat().st_size / 1024:7.0f} KB")

    print("\n  Data: UN Global Platform; IMF PortWatch\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
