"""Country context from World Bank WDI, plus currency from pycountry.

The exposure engine answers "who is hurt". A reader landing on a country first
wants to know what the country *is* — how many people, how large an economy,
what it trades in. That context is what turns a ranking row into an encyclopedia
entry, and architecture.md D31 calls for it explicitly.

    uv run python scripts/fetch_country_context.py

Writes one artifact keyed like every other, so the engine reads it through the
same ArtifactStore port and the GCP cutover needs no special case.
"""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
VERSION, YEAR = "V202601", 2024

# World Bank indicator -> the key we publish it under.
INDICATORS = {
    "SP.POP.TOTL": "population",
    "NY.GDP.MKTP.CD": "gdp_usd",
    "NY.GDP.PCAP.CD": "gdp_per_capita_usd",
    "NE.TRD.GNFS.ZS": "trade_pct_gdp",
    "NY.GDP.MKTP.KD.ZG": "gdp_growth_pct",
}

API = "https://api.worldbank.org/v2/country/all/indicator/{indicator}"


def fetch_indicator(indicator: str, year: int) -> dict[str, float]:
    """Latest available value per ISO3, walking back if the target year is empty."""
    values: dict[str, float] = {}
    # A few reporters lag; accept the most recent of the last three years.
    for candidate in (year, year - 1, year - 2):
        url = f"{API.format(indicator=indicator)}?format=json&per_page=400&date={candidate}"
        with urllib.request.urlopen(url, timeout=60) as response:  # noqa: S310
            payload = json.load(response)
        rows = payload[1] if len(payload) > 1 and payload[1] else []
        for row in rows:
            iso3 = (row.get("countryiso3code") or "").strip()
            value = row.get("value")
            if iso3 and value is not None and iso3 not in values:
                values[iso3] = float(value)
    return values


# The World Bank does not publish Taiwan. It matters here — Taiwan is ~24% of
# world semiconductor exports and the 490->TWN reconciliation exists precisely so
# it appears in rankings. Rather than invent figures, the record is published
# with trade data and an explicit note that economic context is unavailable.
CONTEXT_EXCLUSIONS = {
    "TWN": "The World Bank does not publish indicators for Taiwan. "
           "Trade figures are from BACI and are unaffected.",
}


def country_metadata() -> dict[str, dict]:
    """Name, capital, region and income group, from the World Bank's own
    country table — the same source as the indicators, so nothing drifts."""
    url = "https://api.worldbank.org/v2/country?format=json&per_page=400"
    with urllib.request.urlopen(url, timeout=60) as response:  # noqa: S310
        payload = json.load(response)

    out: dict[str, dict] = {}
    for row in payload[1]:
        iso3 = (row.get("id") or "").strip()
        # Aggregates carry region "Aggregates"; they are not countries.
        region = (row.get("region") or {}).get("value", "")
        if not iso3 or region == "Aggregates":
            continue
        out[iso3] = {
            "name": row.get("name"),
            "iso2": row.get("iso2Code"),
            "capital": row.get("capitalCity") or None,
            "region": region or None,
            "income_group": (row.get("incomeLevel") or {}).get("value"),
        }
    return out


def currency_for(iso2: str | None) -> str | None:
    """Currency from CLDR via babel — offline and authoritative, and it covers
    territories the World Bank omits."""
    if not iso2:
        return None
    try:
        from babel.numbers import get_territory_currencies

        codes = get_territory_currencies(iso2)
        return codes[0] if codes else None
    except Exception:  # noqa: BLE001 - a missing currency is not fatal
        return None


def main() -> int:
    print("\n  Country context — World Bank WDI\n")

    context: dict[str, dict] = {}
    for indicator, key in INDICATORS.items():
        values = fetch_indicator(indicator, YEAR)
        print(f"  {indicator:20s} -> {key:20s} {len(values):3d} countries")
        for iso3, value in values.items():
            context.setdefault(iso3, {})[key] = round(value, 2)

    meta = country_metadata()
    print(f"  {'country metadata':20s} -> {'name/capital/region':20s} {len(meta):3d} countries")

    real: dict[str, dict] = {}
    for iso3, info in meta.items():
        row = dict(info)
        row["currency"] = currency_for(info.get("iso2"))
        row.update(context.get(iso3, {}))
        if iso3 in CONTEXT_EXCLUSIONS:
            row["context_note"] = CONTEXT_EXCLUSIONS[iso3]
        real[iso3] = row

    # Countries the World Bank omits entirely still deserve an entry, because the
    # trade data covers them.
    for iso3, note in CONTEXT_EXCLUSIONS.items():
        if iso3 not in real:
            real[iso3] = {"name": iso3, "context_note": note, "currency": currency_for(
                {"TWN": "TW"}.get(iso3))}

    dropped = len(meta) - len(real) if len(meta) > len(real) else 0

    out = REPO_ROOT / "artifacts" / "context" / VERSION / str(YEAR) / "countries.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(
            {
                "source": "World Bank World Development Indicators",
                "attribution": "Data: World Bank WDI (CC BY 4.0); currency via CLDR",
                "year": YEAR,
                "countries": real,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\n  wrote {out.relative_to(REPO_ROOT)} — {len(real)} countries "
          f"({dropped} aggregates dropped)\n")

    for check in ("EGY", "NLD", "VNM", "TWN"):
        row = real.get(check)
        print(f"  {check}: {row if row else 'MISSING'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
