"""Country-code reconciliation (techstacks.md §2).

BACI uses UN M49 numeric codes. We need ISO3 for joins with PortWatch, WDI and
the map layer. `pycountry` covers the ordinary cases; the table below covers the
ones it cannot, which are exactly the ones that matter politically. Taiwan and
Kosovo are handled explicitly per techstacks.md rather than silently dropped.
"""

from __future__ import annotations

import functools

# BACI/M49 codes with no clean pycountry resolution. Values of None are
# deliberate drops: aggregates and residual categories, not countries.
MANUAL_M49: dict[int, str | None] = {
    490: "TWN",  # "Other Asia, nes" — in practice Taiwan in customs data
    158: "TWN",  # Taiwan, Province of China
    891: None,  # Serbia and Montenegro (pre-2006 aggregate)
    699: "IND",  # India, pre-1975 boundary code
    711: "ZAF",  # Southern African Customs Union
    757: "CHE",  # Switzerland incl. Liechtenstein
    842: "USA",  # USA incl. Puerto Rico and US Virgin Islands
    849: "USA",
    381: "ITA",  # Italy incl. San Marino
    251: "FRA",  # France incl. Monaco
    579: "NOR",  # Norway incl. Svalbard
}

# Residual/aggregate M49 codes that must never appear as a "country" in output.
DROP_M49: frozenset[int] = frozenset(
    {
        0,  # World
        129,  # Caribbean, nes
        221,  # Areas, nes
        290,  # Northern Africa, nes
        527,  # Oceania, nes
        577,  # Other Africa, nes
        637,  # Other America, nes
        697,  # Europe, nes
        838,  # Free Zones
        839,  # Special Categories
        879,  # Western Asia, nes
        899,  # Areas not elsewhere specified
    }
)


@functools.cache
def _pycountry_index() -> dict[int, str]:
    import pycountry

    index: dict[int, str] = {}
    for country in pycountry.countries:
        numeric = getattr(country, "numeric", None)
        if numeric:
            index[int(numeric)] = country.alpha_3
    return index


def m49_to_iso3(code: int) -> str | None:
    """Return ISO3, or None when the code is an aggregate that should be dropped."""
    if code in DROP_M49:
        return None
    if code in MANUAL_M49:
        return MANUAL_M49[code]
    return _pycountry_index().get(code)


def build_lookup(codes: list[int]) -> tuple[dict[int, str], list[int]]:
    """Map the codes present in the data. Returns (resolved, unresolved).

    Unresolved codes are surfaced rather than silently dropped — an unexpected
    one means BACI changed and the mapping table needs a line.
    """
    resolved: dict[int, str] = {}
    unresolved: list[int] = []
    for code in codes:
        iso3 = m49_to_iso3(code)
        if iso3:
            resolved[code] = iso3
        elif code not in DROP_M49:
            unresolved.append(code)
    return resolved, sorted(unresolved)
