"""Build the map's world geometry from Natural Earth.

Strips every property except ISO3 and a display name, which takes the file from
~819KB to something a page can ship without a tile server. MapLibre renders it as
a plain GeoJSON source, so the map has no external dependency and works offline —
which matters when the demo is being recorded.

    uv run python scripts/build_world_geojson.py

Source: Natural Earth 110m admin-0 countries (public domain).
"""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT = REPO_ROOT / "web" / "public" / "world.geo.json"
SOURCE = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    "master/geojson/ne_110m_admin_0_countries.geojson"
)

# Natural Earth leaves ISO_A3 as "-99" for disputed or partially recognised
# territories. ADM0_A3 carries a usable code in those cases, and these are the
# ones that matter to us: Taiwan and Kosovo are explicitly handled upstream in
# the country reconciliation, so dropping them here would silently hole the map.
ISO_FALLBACKS = {"ADM0_A3", "SOV_A3", "GU_A3"}


def resolve_iso3(props: dict) -> str | None:
    iso = (props.get("ISO_A3") or "").strip()
    if iso and iso != "-99":
        return iso
    for key in ISO_FALLBACKS:
        candidate = (props.get(key) or "").strip()
        if candidate and candidate != "-99":
            return candidate
    return None


def main() -> int:
    with urllib.request.urlopen(SOURCE) as response:  # noqa: S310 - pinned public URL
        source = json.load(response)

    features = []
    dropped = []
    for feature in source["features"]:
        props = feature["properties"]
        iso3 = resolve_iso3(props)
        name = props.get("NAME_EN") or props.get("NAME") or iso3
        if not iso3:
            dropped.append(name)
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {"iso3": iso3, "name": name},
                "geometry": feature["geometry"],
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")),
        encoding="utf-8",
    )

    size_kb = OUT.stat().st_size / 1024
    print(f"  wrote {OUT.relative_to(REPO_ROOT)} — {len(features)} countries, {size_kb:.0f}KB")
    if dropped:
        print(f"  dropped (no resolvable ISO3): {dropped}")

    for check in ("TWN", "EGY", "NLD", "CHN"):
        present = any(f["properties"]["iso3"] == check for f in features)
        print(f"  {check}: {'present' if present else 'MISSING'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
