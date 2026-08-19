"""Conflict scenarios — one war, several distinct disruptions.

A war is not a single event in trade terms. The Russia-Ukraine archetype has at
least three channels, each with different sources, different commodities,
different affected buyers and different severities:

  1. The attacked country's exports collapse physically — blockaded ports,
     shelled infrastructure. Everyone who bought from it is hit.
  2. The aggressor's exports are sanctioned — by law, not physics, which means
     only the sanctioning coalition is cut off. Non-coalition buyers keep
     buying, often more cheaply. Modelling sanctions as a global cutoff would
     be confidently wrong in exactly the way this codebase keeps refusing.
  3. Adjacent supply wobbles — fertilizer, in this case, squeezed by finance,
     shipping risk and allied sanctions rather than banned outright.

Each channel is an ordinary exposure computation; the conflict is their
composition. Defaults are stylized to the observed 2022-23 pattern and stated
as such — the intensity slider varies them, it does not validate them.
"""

from __future__ import annotations

from dataclasses import dataclass

# Stylized energy-embargo coalition, 2022-23: EU27 plus the G7-aligned buyers
# that actually stopped purchasing. Membership is a modelling assumption and is
# printed with every result.
SANCTIONS_COALITION: tuple[str, ...] = (
    # EU27
    "AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA",
    "DEU", "GRC", "HUN", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD",
    "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE",
    # aligned
    "USA", "GBR", "CAN", "JPN", "AUS", "NOR", "CHE",
)


@dataclass(frozen=True)
class Channel:
    key: str
    label: str
    transmission: str
    sources: tuple[str, ...]
    baskets: tuple[str, ...]
    default_reduction: float
    importer_filter: tuple[str, ...] | None
    note: str


@dataclass(frozen=True)
class Conflict:
    key: str
    label: str
    channels: tuple[Channel, ...]
    note: str
    omissions: str
    """What the model cannot see — stated up front, not discovered later."""


RUSSIA_UKRAINE = Conflict(
    key="russia_ukraine",
    label="Russia–Ukraine war (stylized)",
    note=(
        "Three channels with different mechanics: physical collapse hits every "
        "buyer of the attacked country; sanctions hit only the coalition that "
        "imposes them; fertilizer is squeezed rather than stopped. Defaults are "
        "stylized to the observed 2022-23 pattern."
    ),
    omissions=(
        "Pipeline gas (not a modelled basket — it dominated EU-Russia energy), "
        "sunflower oil (Ukraine's flagship, no basket yet), and neon/noble "
        "gases (chip inputs, below HS6 resolution)."
    ),
    channels=(
        Channel(
            key="ukraine_collapse",
            label="Ukraine's exports collapse",
            transmission="blockade + physical destruction",
            sources=("UKR",),
            baskets=("wheat", "maize", "barley", "iron_ore"),
            # Seaborne grain fell on this order before the corridor deals;
            # rail "solidarity lanes" carried a fraction.
            default_reduction=0.85,
            importer_filter=None,
            note="Physical: every buyer is hit, wherever they are.",
        ),
        Channel(
            key="russia_sanctions",
            label="Coalition embargo on Russian energy",
            transmission="sanctions",
            sources=("RUS",),
            baskets=("crude_oil", "refined_products", "coal"),
            default_reduction=1.0,
            importer_filter=SANCTIONS_COALITION,
            note=(
                "Legal, not physical: only coalition buyers are cut off. China, "
                "India and Türkiye kept buying — their absence from this ranking "
                "is the point, not an omission."
            ),
        ),
        Channel(
            key="fertilizer_squeeze",
            label="Fertilizer squeeze (Russia + Belarus)",
            transmission="export_restriction",
            sources=("RUS", "BLR"),
            baskets=("nitrogen_fertilizer", "potash", "compound_fertilizer"),
            default_reduction=0.35,
            importer_filter=None,
            note=(
                "Squeezed by finance, shipping risk and Belarus potash "
                "sanctions rather than banned — grain and fertilizer were "
                "deliberately exempted from most sanctions."
            ),
        ),
    ),
)

CONFLICTS: tuple[Conflict, ...] = (RUSSIA_UKRAINE,)
BY_KEY: dict[str, Conflict] = {c.key: c for c in CONFLICTS}
