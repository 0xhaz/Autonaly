"""Chokepoint routing table — curated, because routing must not be invented.

architecture.md D13.4 is explicit: use PortWatch transit shares, *do not reinvent
maritime routing*. So PortWatch supplies the observed severity and this table
supplies the trade geography, as curated domain knowledge (the D19 kind of
curation that accumulates as moat rather than as code).

Two properties of a chokepoint drive everything:

**Who transits it.** Not every flow from an origin passes through. Asian exports
to Europe transit Suez; Asian exports to the United States cross the Pacific.
Scoring Suez against *all* importers of Asian goods would overstate exposure by
including trade that never goes near the canal — so each chokepoint declares the
importer side it actually serves.

**Whether cargo can go around.** This is the difference between a delay and a
cutoff, and conflating them is the most likely way to publish an indefensible
number. Hormuz has no bypass: Gulf seaborne exports have one exit. Suez does —
the Cape of Good Hope, at roughly ten extra days and materially higher cost.
A Suez closure is a freight-cost and lead-time shock; a Hormuz closure is a
supply cutoff. The `reroute` field keeps that distinction in the data instead of
in a footnote nobody reads.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class Reroute(StrEnum):
    NONE = "none"
    """No alternative sea route exists. Disruption is a genuine supply cutoff."""

    LONGER_ROUTE = "longer_route"
    """Cargo can divert at a cost in days and freight. Delay, not cutoff."""


# Applied to the observed transit reduction when a bypass exists. Rerouted cargo
# still arrives, so the supply-side shock is a fraction of the transit collapse.
# Deliberately blunt and published as a simplification (D14) — it is a stated
# assumption, not a calibrated elasticity, and v1 does not pretend otherwise.
REROUTE_ATTENUATION: dict[Reroute, float] = {
    Reroute.NONE: 1.0,
    Reroute.LONGER_ROUTE: 0.35,
}


@dataclass(frozen=True)
class Chokepoint:
    key: str
    portwatch_name: str
    """Must match `portname` in PortWatch's Daily_Chokepoints_Data exactly."""

    label: str
    source_countries: tuple[str, ...]
    """Exporters whose seaborne exports predominantly transit this chokepoint."""

    baskets: tuple[str, ...]
    reroute: Reroute
    lat: float = 0.0
    lon: float = 0.0
    """Position, so an event can be drawn where it actually happens. Values from
    IMF PortWatch's chokepoint database."""

    importer_filter: tuple[str, ...] | None = None
    """Importers actually served by this route. None means global."""

    note: str = ""

    def attenuation(self) -> float:
        return REROUTE_ATTENUATION[self.reroute]


# Europe and the Mediterranean — the importer side Suez actually serves.
_EUROPE_MED = (
    "ALB", "AUT", "BEL", "BGR", "BIH", "CHE", "CYP", "CZE", "DEU", "DNK", "ESP",
    "EST", "FIN", "FRA", "GBR", "GRC", "HRV", "HUN", "IRL", "ISL", "ITA", "LTU",
    "LUX", "LVA", "MAR", "MDA", "MKD", "MLT", "MNE", "NLD", "NOR", "POL", "PRT",
    "ROU", "SRB", "SVK", "SVN", "SWE", "TUN", "TUR", "UKR", "DZA", "EGY", "ISR",
    "LBN", "LBY", "SYR",
)

# Gulf exporters behind Hormuz. Every barrel and cargo leaves through the strait.
_GULF = ("SAU", "ARE", "IRQ", "KWT", "QAT", "IRN", "BHR")

CHOKEPOINTS: tuple[Chokepoint, ...] = (
    Chokepoint(
        key="suez",
        lat=30.59,
        lon=32.44,
        portwatch_name="Suez Canal",
        label="Suez Canal",
        source_countries=(
            # Asian manufacturing and Gulf energy bound for Europe.
            "CHN", "IND", "VNM", "THA", "MYS", "IDN", "KOR", "JPN", "TWN",
            "BGD", "LKA", "PAK", "SGP", "PHL", "KHM",
            *_GULF, "OMN",
        ),
        baskets=(
            "crude_oil", "refined_products", "lng", "semiconductors",
            "rare_earth_magnets",
        ),
        reroute=Reroute.LONGER_ROUTE,
        importer_filter=_EUROPE_MED,
        note=(
            "Asia/Gulf to Europe. Cape of Good Hope diversion adds roughly ten days; "
            "the 2021 Ever Given grounding cut daily transits from ~55 to 2."
        ),
    ),
    Chokepoint(
        key="hormuz",
        lat=26.3,
        lon=56.86,
        portwatch_name="Strait of Hormuz",
        label="Strait of Hormuz",
        source_countries=_GULF,
        baskets=("crude_oil", "lng", "lpg", "refined_products"),
        reroute=Reroute.NONE,
        importer_filter=None,
        note=(
            "No bypass: Gulf seaborne exports have a single exit, so a closure is a "
            "supply cutoff rather than a delay. Note RK2 — AIS quality degrades here "
            "under GPS jamming, which PortWatch flags explicitly."
        ),
    ),
    Chokepoint(
        key="malacca",
        lat=2.5,
        lon=101.3,
        portwatch_name="Malacca Strait",
        label="Strait of Malacca",
        source_countries=(*_GULF, "OMN", "AUS", "IDN", "MYS", "SGP", "IND", "BRA", "ZAF"),
        baskets=("crude_oil", "lng", "lpg", "refined_products", "coal", "iron_ore"),
        reroute=Reroute.LONGER_ROUTE,
        importer_filter=("CHN", "JPN", "KOR", "TWN", "PHL", "VNM", "THA", "SGP", "MYS", "IDN"),
        note=(
            "The Gulf-to-East-Asia energy artery and the busiest of the Asian "
            "straits. Lombok and Sunda are the alternatives — navigable, but "
            "longer and shallower, so a closure is a cost shock rather than a cutoff."
        ),
    ),
    Chokepoint(
        key="bosporus",
        lat=41.1,
        lon=29.1,
        portwatch_name="Bosporus Strait",
        label="Bosporus Strait",
        source_countries=("RUS", "UKR", "ROU", "BGR", "GEO"),
        baskets=(
            "wheat", "maize", "barley", "crude_oil", "refined_products",
            "nitrogen_fertilizer",
        ),
        reroute=Reroute.NONE,
        importer_filter=None,
        note=(
            "The Black Sea's only maritime exit. Ukrainian and Russian grain and "
            "Black Sea crude have no seaborne alternative, which is why closures "
            "here transmit straight into food and energy prices."
        ),
    ),
    Chokepoint(
        key="gibraltar",
        lat=35.97,
        lon=-5.5,
        portwatch_name="Gibraltar Strait",
        label="Strait of Gibraltar",
        source_countries=("USA", "BRA", "CAN", "NGA", "DZA", "MAR", "NOR", "GBR"),
        baskets=("crude_oil", "refined_products", "lng", "wheat", "maize", "soybeans"),
        reroute=Reroute.NONE,
        importer_filter=_EUROPE_MED,
        note=(
            "The Mediterranean's Atlantic door. Cargo entering the basin from the "
            "west has no other way in — Suez serves the eastern approach, not this one."
        ),
    ),
    Chokepoint(
        key="bab_el_mandeb",
        lat=12.79,
        lon=43.35,
        portwatch_name="Bab el-Mandeb Strait",
        label="Bab el-Mandeb Strait",
        source_countries=(
            "CHN", "IND", "VNM", "THA", "MYS", "IDN", "KOR", "JPN", "TWN",
            "BGD", "LKA", "PAK", "SGP", *_GULF, "OMN",
        ),
        baskets=("crude_oil", "refined_products", "lng", "semiconductors"),
        reroute=Reroute.LONGER_ROUTE,
        importer_filter=_EUROPE_MED,
        note="Red Sea approach to Suez; shares the Cape diversion alternative.",
    ),
)

BY_KEY: dict[str, Chokepoint] = {c.key: c for c in CHOKEPOINTS}
BY_PORTWATCH_NAME: dict[str, Chokepoint] = {c.portwatch_name: c for c in CHOKEPOINTS}


def get(key: str) -> Chokepoint:
    if key not in BY_KEY:
        raise KeyError(f"unknown chokepoint {key!r}; known: {sorted(BY_KEY)}")
    return BY_KEY[key]
