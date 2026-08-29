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

    write_country_names(features)
    return 0


# The polygon file drops city-states and micro-islands (no drawable area at
# this simplification), but Hong Kong and Singapore still appear in rankings.
# Names therefore come from the context artifact for everyone, with the
# geojson's tidier names (e.g. "South Korea" over "Korea, Rep.") winning where
# both exist, plus explicit cleanups for the World Bank's official long forms.
WDI_NAME_CLEANUPS = {
    "CHN": "China",
    "USA": "United States",
    "HKG": "Hong Kong",
    "MAC": "Macao",
    "SGP": "Singapore",
    "BRN": "Brunei",
    "PRK": "North Korea",
    "KOR": "South Korea",
    "RUS": "Russia",
    "EGY": "Egypt",
    "IRN": "Iran",
    "SYR": "Syria",
    "VEN": "Venezuela",
    "YEM": "Yemen",
    "CIV": "Ivory Coast",
    "COD": "DR Congo",
    "COG": "Republic of the Congo",
    "KGZ": "Kyrgyzstan",
    "LAO": "Laos",
    "SVK": "Slovakia",
    "TUR": "Turkey",
    "VNM": "Vietnam",
}


def write_country_names(features: list[dict]) -> None:
    context_path = REPO_ROOT / "artifacts/context/V202601/2024/countries.json"
    names: dict[str, str] = {}
    if context_path.exists():
        countries = json.loads(context_path.read_text(encoding="utf-8"))["countries"]
        names = {
            iso3: WDI_NAME_CLEANUPS.get(iso3, row.get("name") or iso3)
            for iso3, row in countries.items()
        }
    for f in features:
        names[f["properties"]["iso3"]] = f["properties"]["name"]

    # Curated names last, so they win over both sources. They used to be applied
    # first and the polygon names then overwrote them, which is how a country
    # picker ended up offering "Korea, Rep." to people looking for South Korea,
    # and "People's Republic of China" filed under P.
    names.update({iso3: name for iso3, name in WDI_NAME_CLEANUPS.items() if iso3 in names})

    out = REPO_ROOT / "web/public/country-names.json"
    out.write_text(json.dumps(names, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    print(f"  wrote {out.relative_to(REPO_ROOT)} — {len(names)} names")


if __name__ == "__main__":
    raise SystemExit(main())
