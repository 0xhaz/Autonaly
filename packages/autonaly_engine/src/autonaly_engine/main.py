"""Exposure engine (Cloud Run service #1).

Deterministic. No LLM anywhere in this process — that separation is the
architecture thesis, and it is enforced by this package having no genai
dependency at all rather than by convention.

    make engine-local     # uvicorn on :8080
    POST /exposure        # -> Rankings
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

import duckdb
from autonaly_core.schema import AffectedCountry, Rankings, Winner
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .scoring import Severity, exposure_score, substitution_capacity
from .store import (
    connect,
    country_context,
    country_economy,
    country_export_destinations,
    country_import_sources,
    country_totals,
    dependency_rows,
    importer_supplier_share,
    supplier_shares,
    world_basket_total,
)

log = logging.getLogger(__name__)

METHODOLOGY_VERSION = "1.0.0"
DEFAULT_VERSION, DEFAULT_YEAR = "V202601", 2024

# Materiality floor, in thousand USD. D9 scopes this product to *global supply
# impact, not severity*: a country importing under $100m of a basket is not a
# global-supply story, however dependent it is. Without this floor the ranking
# is topped by micro-importers at ~100% dependency (Armenia, $60m of wheat)
# while Egypt — 77% dependent on $5.2bn — falls off the page entirely.
DEFAULT_MIN_IMPORT_KUSD = 100_000.0

# A flat floor cannot work across baskets spanning three orders of magnitude:
# $100m is trivial against $1.5tn of crude and enormous against $5bn of magnets.
# So the floor also scales with the basket's world trade. At 5 basis points, a
# Hormuz energy ranking stops being topped by Seychelles ($0.3bn) while a
# rare-earth ranking keeps every meaningful importer.
MATERIALITY_BPS_OF_WORLD_TRADE = 5.0

app = FastAPI(
    title="Autonaly exposure engine",
    description="Deterministic trade-dependency scoring. DDR + HHI + severity ladder.",
    version=METHODOLOGY_VERSION,
)


class SeverityInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = "severe"
    transit_reduction: float = Field(default=1.0, ge=0, le=1)
    duration_months: int = Field(default=3, ge=0, le=120)


class ExposureRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_key: str
    sources: list[str] = Field(
        min_length=1, description="ISO3 codes of the disrupted supplier countries"
    )
    baskets: list[str] = Field(min_length=1, description="Commodity basket keys")
    severity: SeverityInput = Field(default_factory=SeverityInput)
    top_n: int = Field(default=20, ge=1, le=200)
    min_import_kusd: float = DEFAULT_MIN_IMPORT_KUSD
    importers: list[str] | None = Field(
        default=None,
        description="Restrict to these importers. None means global.",
    )
    attenuation: float = Field(
        default=1.0,
        ge=0,
        le=1,
        description=(
            "Scales severity when disrupted cargo has an alternative route. 1.0 is "
            "a true cutoff; the chokepoint route supplies the right value."
        ),
    )
    version: str = DEFAULT_VERSION
    year: int = DEFAULT_YEAR


class ChokepointRequest(BaseModel):
    """The chokepoint route (hackathon.md §4).

    The caller names a chokepoint and an observed transit reduction; the routing
    table supplies the trade geography and whether a bypass exists. Keeping this
    a distinct endpoint means the agent cannot accidentally score a chokepoint as
    though it were a supplier embargo.
    """

    model_config = ConfigDict(extra="forbid")

    event_key: str
    chokepoint: str
    transit_reduction: float = Field(ge=0, le=1)
    duration_months: int = Field(default=1, ge=0, le=120)
    severity_label: str = "observed"
    top_n: int = Field(default=20, ge=1, le=200)
    version: str = DEFAULT_VERSION
    year: int = DEFAULT_YEAR


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "methodology_version": METHODOLOGY_VERSION}


@app.get("/baskets")
def list_baskets() -> dict[str, list[dict]]:
    """The agent calls this to discover valid basket keys before routing."""
    from autonaly_core.baskets import BASKETS

    return {
        "baskets": [
            {
                "key": b.key,
                "label": b.label,
                "essentiality": b.essentiality.value,
                "codes": list(b.codes),
                "note": b.note,
            }
            for b in BASKETS
        ]
    }


@app.post("/exposure", response_model=Rankings)
def compute_exposure(request: ExposureRequest) -> Rankings:
    from autonaly_core.baskets import BY_KEY, ESSENTIALITY_WEIGHT

    unknown = [k for k in request.baskets if k not in BY_KEY]
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"unknown baskets {unknown}; valid keys: {sorted(BY_KEY)}",
        )

    baskets = [BY_KEY[k] for k in request.baskets]
    codes = tuple(sorted({c for b in baskets for c in b.codes}))
    sources = tuple(sorted(set(request.sources)))

    # Essentiality of a multi-basket request is its most critical component —
    # averaging would let a bulk industrial basket dilute a food emergency.
    weight = max(ESSENTIALITY_WEIGHT[b.essentiality] for b in baskets)

    severity = Severity(
        label=request.severity.label,
        transit_reduction=request.severity.transit_reduction * request.attenuation,
        duration_months=request.severity.duration_months,
    )

    con, paths = connect(request.version, request.year)
    started = datetime.now(UTC)

    world_total = world_basket_total(con, paths, codes)
    floor = max(
        request.min_import_kusd,
        world_total * MATERIALITY_BPS_OF_WORLD_TRADE / 10_000.0,
    )

    try:
        rows = dependency_rows(
            con,
            paths,
            codes,
            sources,
            floor,
            importers=tuple(request.importers) if request.importers else None,
        )
    except duckdb.Error as exc:  # pragma: no cover - surfaced as 503 for the agent
        raise HTTPException(status_code=503, detail=f"artifacts unavailable: {exc}") from exc

    affected = [
        AffectedCountry(
            country=importer,
            score=exposure_score(ddr, hhi, weight, severity),
            ddr=round(ddr, 4),
            hhi=round(hhi, 4),
            value_at_risk_kusd=round(ddr * total_kusd, 1),
            channel=f"import dependency on {'+'.join(sources)}",
            evidence=[
                f"${ddr * total_kusd / 1e6:,.2f}bn at risk of ${total_kusd / 1e6:,.2f}bn "
                f"basket imports across {n_suppliers} suppliers",
                f"{ddr * 100:.1f}% sourced from disrupted origins",
            ],
        )
        for importer, ddr, hhi, total_kusd, n_suppliers in rows
    ]
    affected.sort(key=lambda a: (a.score or 0, a.ddr or 0), reverse=True)
    ranked, affected = affected, affected[: request.top_n]

    # Winner filtering reads the full ranking, not the truncated page — a heavily
    # dependent country sitting just outside top_n is still a poor substitute.
    winners = _winners(con, paths, codes, sources, affected, ranked)

    log.info(
        "exposure event=%s sources=%s baskets=%s -> %d affected in %.0fms",
        request.event_key,
        sources,
        request.baskets,
        len(affected),
        (datetime.now(UTC) - started).total_seconds() * 1000,
    )

    # Computed over the full ranking, not the truncated page: the biggest
    # absolute exposure is a fact about the scenario and must not change when a
    # caller asks for top_n=5 instead of top_n=20.
    largest = max(ranked, key=lambda a: a.value_at_risk_kusd or 0.0, default=None)

    return Rankings(
        event_key=request.event_key,
        severity_label=severity.label,
        affected=affected,
        baskets=list(request.baskets),
        sources=list(sources),
        largest_absolute_exposure=largest.country if largest else None,
        winners=winners,
        methodology_version=METHODOLOGY_VERSION,
    )


@app.get("/concentration/{basket}")
def basket_concentration(basket: str, top_n: int = 8) -> dict:
    """Who dominates world exports of a basket.

    The export-restriction route needs this before it can score anything: a
    signal says "China restricts rare-earth exports" and the agent must resolve
    that to the disrupted origin and the basket where control actually binds.
    Returning it from the engine keeps the figures deterministic rather than
    recalled by a model.
    """
    from autonaly_core.baskets import BY_KEY

    if basket not in BY_KEY:
        raise HTTPException(
            status_code=422,
            detail=f"unknown basket {basket!r}; valid keys: {sorted(BY_KEY)}",
        )

    spec = BY_KEY[basket]
    con, paths = connect(DEFAULT_VERSION, DEFAULT_YEAR)
    shares = supplier_shares(con, paths, spec.codes)
    world = world_basket_total(con, paths, spec.codes)

    ranked = sorted(shares.items(), key=lambda kv: kv[1], reverse=True)[:top_n]
    return {
        "basket": basket,
        "label": spec.label,
        "world_trade_kusd": round(world, 1),
        "hhi": round(sum(s * s for s in shares.values()), 4),
        "top_exporters": [
            {"country": c, "world_share": round(s, 4)} for c, s in ranked
        ],
        "methodology_version": METHODOLOGY_VERSION,
    }


@app.get("/country/{iso3}")
def country_profile(
    iso3: str,
    baskets: str,
    sources: str = "",
    top_n: int = 8,
    version: str = DEFAULT_VERSION,
    year: int = DEFAULT_YEAR,
) -> dict:
    """Bilateral trade profile for one country in a basket set.

    Backs click-to-inspect on the map. A ranking answers "who is exposed"; this
    answers "why" — which suppliers a country actually depends on, how much of
    that sits with the disrupted origins, and what the country supplies to others
    in the same basket.

    Args:
        iso3: Country code.
        baskets: Comma-separated basket keys.
        sources: Comma-separated ISO3 codes treated as disrupted, for shading.
    """
    from autonaly_core.baskets import BY_KEY

    keys = [k for k in baskets.split(",") if k]
    unknown = [k for k in keys if k not in BY_KEY]
    if not keys or unknown:
        raise HTTPException(
            status_code=422, detail=f"unknown or empty baskets {unknown or keys}"
        )

    codes = tuple(sorted({c for k in keys for c in BY_KEY[k].codes}))
    disrupted = {s for s in sources.split(",") if s}

    con, paths = connect(version, year)
    imports = country_import_sources(con, paths, codes, iso3, top_n)
    exports = country_export_destinations(con, paths, codes, iso3, top_n)
    total_imports, total_exports, world_share = country_totals(con, paths, codes, iso3)

    context = country_context(paths.context).get(iso3, {})

    # Which modelled chokepoints this country's trade actually runs through, and
    # in which direction. This is the "why does this country matter to world
    # trade" answer that a ranking alone never gives.
    from autonaly_core.chokepoints import CHOKEPOINTS

    transits = []
    for cp in CHOKEPOINTS:
        as_origin = iso3 in cp.source_countries
        as_destination = bool(cp.importer_filter and iso3 in cp.importer_filter)
        if not (as_origin or as_destination):
            continue
        transits.append(
            {
                "key": cp.key,
                "label": cp.label,
                "role": "origin and destination"
                if as_origin and as_destination
                else ("exports transit" if as_origin else "imports arrive via"),
                "reroute": cp.reroute.value,
                "bypass": cp.reroute.value != "none",
            }
        )

    economy = country_economy(
        con, paths, iso3, {b.key: b.codes for b in BY_KEY.values() if not b.parent}
    )
    gdp = (context or {}).get("gdp_usd")
    if gdp:
        # kUSD -> USD before comparing with GDP.
        economy["exports_pct_gdp"] = round(economy["total_exports_kusd"] * 1000 / gdp * 100, 1)
        economy["imports_pct_gdp"] = round(economy["total_imports_kusd"] * 1000 / gdp * 100, 1)

    return {
        "country": iso3,
        "context": context or None,
        "economy": economy,
        "chokepoints": transits,
        "baskets": keys,
        "basket_labels": [BY_KEY[k].label for k in keys],
        "total_imports_kusd": round(total_imports, 1),
        "total_exports_kusd": round(total_exports, 1),
        "world_export_share": round(world_share, 4),
        "import_sources": [
            {
                "country": c,
                "value_kusd": round(v, 1),
                "share": round(s, 4),
                "disrupted": c in disrupted,
            }
            for c, v, s in imports
        ],
        "export_destinations": [
            {"country": c, "value_kusd": round(v, 1), "share": round(s, 4)}
            for c, v, s in exports
        ],
        "methodology_version": METHODOLOGY_VERSION,
    }


@app.get("/chokepoints")
def list_chokepoints() -> dict[str, list[dict]]:
    """Routing table, so the agent discovers valid chokepoints rather than guessing."""
    from autonaly_core.chokepoints import CHOKEPOINTS

    return {
        "chokepoints": [
            {
                "key": c.key,
                "label": c.label,
                "portwatch_name": c.portwatch_name,
                "baskets": list(c.baskets),
                "reroute": c.reroute.value,
                "attenuation": c.attenuation(),
                "lat": c.lat,
                "lon": c.lon,
                "global_exposure": c.importer_filter is None,
                "note": c.note,
            }
            for c in CHOKEPOINTS
        ]
    }


@app.post("/chokepoint", response_model=Rankings)
def compute_chokepoint_exposure(request: ChokepointRequest) -> Rankings:
    """Score a chokepoint disruption from an observed transit reduction.

    Delegates to /exposure with the geography and bypass attenuation the routing
    table supplies — so a Suez transit collapse and an equal Hormuz collapse do
    not produce the same numbers, because only one of them can be sailed around.
    """
    from autonaly_core.chokepoints import BY_KEY as CHOKEPOINT_KEYS

    if request.chokepoint not in CHOKEPOINT_KEYS:
        raise HTTPException(
            status_code=422,
            detail=(
                f"unknown chokepoint {request.chokepoint!r}; "
                f"valid keys: {sorted(CHOKEPOINT_KEYS)}"
            ),
        )

    cp = CHOKEPOINT_KEYS[request.chokepoint]
    return compute_exposure(
        ExposureRequest(
            event_key=request.event_key,
            sources=list(cp.source_countries),
            baskets=list(cp.baskets),
            severity=SeverityInput(
                label=request.severity_label,
                transit_reduction=request.transit_reduction,
                duration_months=request.duration_months,
            ),
            top_n=request.top_n,
            importers=list(cp.importer_filter) if cp.importer_filter else None,
            attenuation=cp.attenuation(),
            version=request.version,
            year=request.year,
        )
    )


# A country sourcing more than this share of its own supply from the disrupted
# origins cannot credibly backfill anyone else — it is looking for volume, not
# offering it. Without this, Germany appears as both a top-5 casualty and a
# winner of the same rare-earth restriction.
WINNER_MAX_OWN_DEPENDENCY = 0.5


def _winners(con, paths, codes, sources, affected, ranked) -> list[Winner]:
    """Beneficiaries: exporters with volume and headroom to redirect (D16)."""
    shares = supplier_shares(con, paths, codes)
    importers = tuple(a.country for a in affected)
    existing = importer_supplier_share(con, paths, codes, importers)
    own_dependency = {a.country: (a.ddr or 0.0) for a in ranked}

    scored: list[tuple[float, str]] = []
    for supplier, global_share in shares.items():
        if supplier in sources:
            continue
        if own_dependency.get(supplier, 0.0) > WINNER_MAX_OWN_DEPENDENCY:
            continue
        # Headroom measured against the most-exposed importer — the one whose
        # demand is actually up for grabs.
        top_importer = importers[0] if importers else None
        held = existing.get((top_importer, supplier), 0.0) if top_importer else 0.0
        capacity = substitution_capacity(global_share, False, held)
        if capacity > 0:
            scored.append((capacity, supplier))

    scored.sort(reverse=True)
    return [
        Winner(
            country=supplier,
            mechanism="substitute exporter with spare global share",
            evidence=[f"{shares[supplier] * 100:.1f}% of world exports in this basket"],
        )
        for _, supplier in scored[:5]
    ]
