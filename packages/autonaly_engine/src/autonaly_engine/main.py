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
from .store import connect, dependency_rows, importer_supplier_share, supplier_shares

log = logging.getLogger(__name__)

METHODOLOGY_VERSION = "1.0.0"
DEFAULT_VERSION, DEFAULT_YEAR = "V202601", 2024

# Materiality floor, in thousand USD. D9 scopes this product to *global supply
# impact, not severity*: a country importing under $100m of a basket is not a
# global-supply story, however dependent it is. Without this floor the ranking
# is topped by micro-importers at ~100% dependency (Armenia, $60m of wheat)
# while Egypt — 77% dependent on $5.2bn — falls off the page entirely.
DEFAULT_MIN_IMPORT_KUSD = 100_000.0

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
        transit_reduction=request.severity.transit_reduction,
        duration_months=request.severity.duration_months,
    )

    con, paths = connect(request.version, request.year)
    started = datetime.now(UTC)

    try:
        rows = dependency_rows(con, paths, codes, sources, request.min_import_kusd)
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
        largest_absolute_exposure=largest.country if largest else None,
        winners=winners,
        methodology_version=METHODOLOGY_VERSION,
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
