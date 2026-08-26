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
        "Russian pipeline gas is a modelled basket, but no channel here carries "
        "it: the 2022 loss was supplier-side curtailment and damaged "
        "infrastructure, not a coalition embargo, and curtailment is not one of "
        "the three mechanics above. Still absent: neon and the noble gases "
        "(chip inputs, below HS6 resolution)."
    ),
    channels=(
        Channel(
            key="ukraine_collapse",
            label="Ukraine's exports collapse",
            transmission="blockade + physical destruction",
            sources=("UKR",),
            baskets=("wheat", "maize", "barley", "sunflower_oil", "iron_ore"),
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
            transmission="export restriction",
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


# ---------------------------------------------------------------------------
# Custom conflicts, derived from the data instead of curated by hand.
#
# The curated scenario above encodes judgment: which channels a real war has,
# who sanctions whom, what merely wobbles. A custom scenario cannot have that
# judgment, so it claims less: one physical-disruption channel per selected
# country, covering exactly the modelled baskets where that country supplies a
# material share of world trade. The materiality floor keeps the tool honest —
# a country below it in every basket produces no channel rather than a fake one.
# ---------------------------------------------------------------------------

# A source below 1% of world trade in a basket is not a supply-shock story for
# that basket, however dominant the basket is for the country itself.
CUSTOM_MATERIALITY_WORLD_SHARE = 0.01

# Enough to carry a "this country's exports stop" story without dragging in
# trace positions that dilute the blocked-products list.
CUSTOM_MAX_BASKETS = 8

CUSTOM_NOTE = (
    "Custom scenario derived from the trade data: each selected country gets "
    "one physical-disruption channel covering the modelled baskets where it "
    "supplies at least 1% of world trade. Every buyer is hit — no sanctions "
    "or coalition assumptions, because those are political judgments a data "
    "derivation cannot make."
)

CUSTOM_OMISSIONS = (
    "Only the 22 modelled commodity baskets are visible: services, autos, "
    "machinery, pharmaceuticals and most manufactures are not counted, so a "
    "crisis in a diversified manufacturing economy is understated here. No "
    "pipeline flows, no second-order effects, no substitution dynamics."
)


def material_baskets(world_shares: dict[str, float]) -> list[tuple[str, float]]:
    """The baskets where a source is a material share of world trade."""
    rows = [
        (basket, share)
        for basket, share in world_shares.items()
        if share >= CUSTOM_MATERIALITY_WORLD_SHARE
    ]
    rows.sort(key=lambda r: r[1], reverse=True)
    return rows[:CUSTOM_MAX_BASKETS]


def custom_channel(iso3: str, name: str, baskets: tuple[str, ...]) -> Channel:
    """One country's exports stop moving — the only channel shape that can be
    derived from trade data alone."""
    return Channel(
        key=f"{iso3.lower()}_disruption",
        label=f"{name}: exports disrupted",
        transmission="physical disruption",
        sources=(iso3,),
        baskets=baskets,
        # Intensity maps straight onto the reduction: the slider is the claim.
        default_reduction=1.0,
        importer_filter=None,
        note=(
            f"Auto-derived channel: the baskets where {name} supplies at least "
            "1% of world trade. Physical framing — every buyer is hit."
        ),
    )


def build_custom_conflict(
    channels: tuple[Channel, ...], labels: tuple[str, ...]
) -> Conflict:
    return Conflict(
        key="custom",
        label="Custom crisis: " + " + ".join(labels),
        channels=channels,
        note=CUSTOM_NOTE,
        omissions=CUSTOM_OMISSIONS,
    )
