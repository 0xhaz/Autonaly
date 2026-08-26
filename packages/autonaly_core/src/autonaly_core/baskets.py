"""Commodity baskets — HS6 for computation, human groups for display (OP3).

This closes OP3, and P1 showed why it matters more than the scoring formula:

    Asked at a single HS6 code, Russia is not a top-3 wheat exporter and China
    holds 21% of rare earths. Asked at the right basket, Russia is the largest
    wheat exporter at 15.8% and China holds 62% of permanent magnets.

Neither wrong answer raises an error. It produces a confident, well-formatted,
wrong briefing — the failure mode this product can least afford. So baskets are
declared once, here, validated against the product table on every pipeline run,
and consumed by every scenario.

Codes verified against HS22 V202601 (5,609 codes). Each basket names its
`essentiality` per D13.2, which the engine uses as the criticality weight.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class Essentiality(StrEnum):
    """Criticality weight class (architecture.md D13.2)."""

    STAPLE = "staple"
    ENERGY = "energy"
    FERTILIZER = "fertilizer"
    CRITICAL_MINERAL = "critical_mineral"
    INDUSTRIAL = "industrial"


ESSENTIALITY_WEIGHT: dict[Essentiality, float] = {
    Essentiality.STAPLE: 1.0,
    Essentiality.ENERGY: 1.0,
    Essentiality.FERTILIZER: 0.9,
    Essentiality.CRITICAL_MINERAL: 0.8,
    Essentiality.INDUSTRIAL: 0.6,
}


@dataclass(frozen=True)
class Basket:
    key: str
    label: str
    essentiality: Essentiality
    codes: tuple[str, ...]
    note: str = ""
    parent: str | None = None
    """Set when this basket is a deliberate subset of a broader one (e.g. the
    magnet basket inside rare earths). Subsets must not be double-counted."""

    def sql_in(self) -> str:
        return "(" + ",".join(f"'{c}'" for c in self.codes) + ")"


BASKETS: tuple[Basket, ...] = (
    # --- staples -----------------------------------------------------------
    Basket(
        key="wheat",
        label="Wheat",
        essentiality=Essentiality.STAPLE,
        codes=("100111", "100119", "100191", "100199"),
        note="Durum and non-durum, seed and non-seed. Splitting these hides Russia.",
    ),
    Basket(
        key="maize",
        label="Maize",
        essentiality=Essentiality.STAPLE,
        codes=("100510", "100590"),
    ),
    Basket(
        key="rice",
        label="Rice",
        essentiality=Essentiality.STAPLE,
        codes=("100610", "100620", "100630", "100640"),
    ),
    Basket(
        key="barley",
        label="Barley",
        essentiality=Essentiality.STAPLE,
        codes=("100310", "100390"),
    ),
    Basket(
        key="soybeans",
        label="Soybeans",
        essentiality=Essentiality.STAPLE,
        codes=("120110", "120190"),
    ),
    # --- energy ------------------------------------------------------------
    Basket(
        key="crude_oil",
        label="Crude petroleum",
        essentiality=Essentiality.ENERGY,
        codes=("270900",),
        note="Hormuz and Suez both transmit primarily through this basket.",
    ),
    Basket(
        key="refined_products",
        label="Refined petroleum products",
        essentiality=Essentiality.ENERGY,
        codes=("271000",),
        note="HS22 keeps refined products at a single 6-digit code.",
    ),
    Basket(
        key="lng",
        label="Liquefied natural gas",
        essentiality=Essentiality.ENERGY,
        codes=("271111",),
        note="Qatari LNG is the Hormuz-specific exposure.",
    ),
    Basket(
        key="lpg",
        label="LPG and other petroleum gases",
        essentiality=Essentiality.ENERGY,
        codes=("271112", "271113", "271114", "271119", "271129"),
        note=(
            "271121 used to sit here, and at 61% of the basket by value it meant "
            "an 'LPG' exposure figure was mostly pipeline gas. It has its own "
            "basket now."
        ),
    ),
    Basket(
        key="pipeline_gas",
        label="Pipeline natural gas",
        essentiality=Essentiality.ENERGY,
        codes=("271121",),
        note=(
            "Natural gas in the gaseous state — gas that arrived by pipe rather "
            "than by ship. $157.7bn of world trade in 2024, which is why it must "
            "not be pooled with LPG. Deliberately absent from every maritime "
            "chokepoint: a pipeline does not transit a strait, so counting it as "
            "cargo at Hormuz or Malacca overstates them. LNG (271111) is the "
            "shipped substitute and stays in its own basket."
        ),
    ),
    Basket(
        key="coal",
        label="Coal",
        essentiality=Essentiality.ENERGY,
        codes=("270111", "270112", "270119", "270120"),
    ),
    # --- fertilizer --------------------------------------------------------
    Basket(
        key="nitrogen_fertilizer",
        label="Nitrogen fertilizer",
        essentiality=Essentiality.FERTILIZER,
        codes=("310210", "310221", "310229", "310230", "310240", "310250", "310260",
               "310280", "310290"),
    ),
    Basket(
        key="potash",
        label="Potash fertilizer",
        essentiality=Essentiality.FERTILIZER,
        codes=("310420", "310430", "310490"),
        note="Belarus/Russia concentration — the 2022 fertilizer shock.",
    ),
    Basket(
        key="phosphate_fertilizer",
        label="Phosphate fertilizer",
        essentiality=Essentiality.FERTILIZER,
        codes=("310311", "310319", "310390"),
        note="HS22 split superphosphates into 310311/310319; there is no 310310.",
    ),
    Basket(
        key="compound_fertilizer",
        label="Compound fertilizer (NPK)",
        essentiality=Essentiality.FERTILIZER,
        codes=("310510", "310520", "310530", "310540", "310551", "310559", "310560",
               "310590"),
    ),
    # --- critical minerals -------------------------------------------------
    Basket(
        key="rare_earths",
        label="Rare earths (all forms)",
        essentiality=Essentiality.CRITICAL_MINERAL,
        codes=("280530", "284610", "284690", "850511"),
        note="Spans ore, compounds and magnets deliberately — see rare_earth_magnets.",
    ),
    Basket(
        key="rare_earth_magnets",
        label="Rare-earth permanent magnets",
        essentiality=Essentiality.CRITICAL_MINERAL,
        codes=("850511",),
        parent="rare_earths",
        note=(
            "Where Chinese control actually binds: ~62% of exports here versus ~21% "
            "of raw metal (280530). Export-restriction scenarios route to this basket."
        ),
    ),
    Basket(
        key="lithium",
        label="Lithium compounds",
        essentiality=Essentiality.CRITICAL_MINERAL,
        codes=("282520", "283691"),
    ),
    Basket(
        key="cobalt",
        label="Cobalt",
        essentiality=Essentiality.CRITICAL_MINERAL,
        codes=("260500", "282200", "810520"),
    ),
    Basket(
        key="graphite",
        label="Graphite",
        essentiality=Essentiality.CRITICAL_MINERAL,
        codes=("250410", "250490", "380110"),
    ),
    # --- industrial --------------------------------------------------------
    Basket(
        key="semiconductors",
        label="Semiconductors",
        essentiality=Essentiality.INDUSTRIAL,
        codes=("854231", "854232", "854233", "854239", "854290"),
        note="Taiwan concentration — depends on the 490->TWN mapping holding.",
    ),
    Basket(
        key="iron_ore",
        label="Iron ore",
        essentiality=Essentiality.INDUSTRIAL,
        codes=("260111", "260112", "260120"),
    ),
    Basket(
        key="aluminium",
        label="Aluminium (unwrought)",
        essentiality=Essentiality.INDUSTRIAL,
        codes=("760110", "760120"),
    ),
)

BY_KEY: dict[str, Basket] = {b.key: b for b in BASKETS}


def get(key: str) -> Basket:
    if key not in BY_KEY:
        raise KeyError(f"unknown basket {key!r}; known: {sorted(BY_KEY)}")
    return BY_KEY[key]


def all_codes(exclude_subsets: bool = True) -> set[str]:
    """Every HS6 code referenced. Subsets excluded so codes aren't counted twice."""
    return {
        code
        for b in BASKETS
        if not (exclude_subsets and b.parent)
        for code in b.codes
    }


@dataclass
class BasketValidation:
    unknown_codes: dict[str, list[str]] = field(default_factory=dict)
    empty_baskets: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.unknown_codes and not self.empty_baskets

    def describe(self) -> str:
        if self.ok:
            return f"{len(BASKETS)} baskets, {len(all_codes())} codes, all present"
        parts = []
        if self.unknown_codes:
            parts.append(f"unknown codes: {self.unknown_codes}")
        if self.empty_baskets:
            parts.append(f"baskets with no trade: {self.empty_baskets}")
        return "; ".join(parts)


def validate(known_codes: set[str], traded_codes: set[str] | None = None) -> BasketValidation:
    """Check every declared code exists, and optionally that it carries trade.

    A typo'd HS6 silently contributes zero rather than failing, which would
    understate an exposure — so this runs as a pipeline gate, not a unit test.
    """
    result = BasketValidation()
    for basket in BASKETS:
        missing = [c for c in basket.codes if c not in known_codes]
        if missing:
            result.unknown_codes[basket.key] = missing
        if traded_codes is not None and not (set(basket.codes) & traded_codes):
            result.empty_baskets.append(basket.key)
    return result
