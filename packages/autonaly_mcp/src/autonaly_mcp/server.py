"""MCP server — the engine, agent-queryable.

Architecture D26.3: the same artifacts serve the website, a REST API and an
MCP server; this is the third surface, shipped as a thin adapter so an AI
agent can ask the questions the site answers. Every tool is a pass-through to
the deterministic engine — no model anywhere in this process, which means an
agent composing these tools inherits the provenance story for free.

Run against a local engine:

    AUTONALY_ENGINE_URL=http://localhost:8080 uv run autonaly-mcp

D30: tool-call logs from this surface are demand telemetry — which questions
agents actually ask is the second validation antenna beside web analytics.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx
from mcp.server.mcpserver import MCPServer

log = logging.getLogger(__name__)

ENGINE_URL = os.environ.get("AUTONALY_ENGINE_URL", "http://localhost:8080")

mcp = MCPServer(
    name="autonaly",
    instructions=(
        "Deterministic trade-dependency analysis: who gets hurt when physical "
        "supply breaks. Exposure scores come from customs data and a published "
        "formula (DDR x HHI x essentiality x severity) - no model generates "
        "numbers. Exposure only, never probability. Latest-year trade weights, "
        "first-order effects; 24 commodity baskets."
    ),
)

# The default client is process-wide; tests substitute an in-process ASGI
# transport via configure() rather than standing up a network engine.
_client: httpx.Client | None = None


def configure(client: httpx.Client) -> None:
    global _client
    _client = client


def _get(path: str, params: dict[str, Any] | None = None) -> dict:
    global _client
    if _client is None:
        _client = httpx.Client(base_url=ENGINE_URL, timeout=60)
    response = _client.get(path, params=params)
    response.raise_for_status()
    return response.json()


def _post(path: str, body: dict[str, Any]) -> dict:
    global _client
    if _client is None:
        _client = httpx.Client(base_url=ENGINE_URL, timeout=120)
    response = _client.post(path, json=body)
    if response.status_code == 422:
        # Agents deserve the engine's own explanation, not a stack trace.
        return {"error": response.json().get("detail", "invalid request")}
    response.raise_for_status()
    return response.json()


@mcp.tool()
def list_commodity_baskets() -> str:
    """The 22 modelled commodity baskets (grains, energy, fertilizers,
    critical minerals) with their HS6 codes and essentiality weights. Basket
    keys from here are the vocabulary every other tool speaks."""
    return json.dumps(_get("/baskets"))


@mcp.tool()
def get_country_exposure(iso3: str) -> str:
    """A country's trade profile: economy totals, top import/export baskets,
    the chokepoints its trade transits, and its curated crisis history for
    the last century. iso3: three-letter country code, e.g. 'EGY'."""
    profile = _get(f"/country/{iso3.upper()}", params={"baskets": "wheat"})
    return json.dumps(profile)


@mcp.tool()
def get_chokepoint_status() -> str:
    """The eight modelled maritime chokepoints with their reroute options and
    attenuation — whether cargo can sail around a closure decides if it is a
    delay or a cutoff."""
    return json.dumps(_get("/chokepoints"))


@mcp.tool()
def simulate_disruption(
    source_countries: list[str],
    baskets: list[str],
    transit_reduction: float = 1.0,
    duration_months: int = 6,
    top_n: int = 10,
) -> str:
    """Simulate a supply disruption: exports of the given commodity baskets
    from the source countries are reduced. Returns ranked country exposure
    (score, dependency ratio, concentration, dollars at risk) plus likely
    beneficiaries. Deterministic - same inputs, same numbers."""
    return json.dumps(
        _post(
            "/exposure",
            {
                "event_key": "mcp",
                "sources": [c.upper() for c in source_countries],
                "baskets": baskets,
                "severity": {
                    "label": "mcp scenario",
                    "transit_reduction": transit_reduction,
                    "duration_months": duration_months,
                },
                "top_n": top_n,
            },
        )
    )


@mcp.tool()
def simulate_chokepoint_closure(
    chokepoint: str,
    transit_reduction: float = 1.0,
    duration_months: int = 3,
    top_n: int = 10,
) -> str:
    """Simulate closing a maritime chokepoint (suez, hormuz, malacca,
    bosporus, gibraltar, panama, taiwan_strait, bab_el_mandeb). Scores are
    attenuated when a sea bypass exists, and only the importer side the
    route actually serves is ranked."""
    return json.dumps(
        _post(
            "/chokepoint",
            {
                "event_key": "mcp",
                "chokepoint": chokepoint,
                "transit_reduction": transit_reduction,
                "duration_months": duration_months,
                "top_n": top_n,
            },
        )
    )


@mcp.tool()
def simulate_conflict(
    countries: list[str],
    intensity: float = 1.0,
    duration_months: int = 6,
) -> str:
    """Simulate a crisis in up to three countries: each gets a physical-
    disruption channel covering the baskets where it supplies at least 1% of
    world trade (derived from data, not curated). Returns per-channel
    rankings, blocked products with world shares, and combined dollars at
    risk. Use conflict key 'russia_ukraine' via the curated variant instead
    when modelling that war - it carries sanctions-coalition judgment a
    derivation cannot."""
    return json.dumps(
        _post(
            "/conflict",
            {
                "conflict": "custom",
                "countries": [c.upper() for c in countries],
                "intensity": intensity,
                "duration_months": duration_months,
                "top_n": 12,
            },
        )
    )


@mcp.tool()
def get_crisis_history(iso3: str) -> str:
    """A century of curated supply crises involving a country - wars,
    blockades, embargoes, export bans, disasters - each with its years, a
    factual account, and the transferable 'rhyme'. Curated records, never
    generated."""
    return json.dumps(_get(f"/history/{iso3.upper()}"))


@mcp.tool()
def find_historical_analogues(
    countries: list[str] | None = None,
    baskets: list[str] | None = None,
    chokepoints: list[str] | None = None,
) -> str:
    """The historical reference class for a hypothetical: past crises sharing
    the scenario's geography or commodities, ranked by overlap with recency
    breaking ties. History doesn't repeat, but it rhymes."""
    return json.dumps(
        _get(
            "/history-analogues",
            params={
                "countries": ",".join(countries or []),
                "baskets": ",".join(baskets or []),
                "chokepoints": ",".join(chokepoints or []),
                "limit": 5,
            },
        )
    )


@mcp.resource("autonaly://methodology")
def methodology() -> str:
    """How every number is computed, and what the model deliberately cannot see."""
    return (
        "Autonaly methodology 1.0.0 (deterministic, no trained models):\n"
        "score = 100 x DDR x (0.5 + 0.5 x HHI) x essentiality x severity.\n"
        "DDR: share of the importer's basket imports sourced from the "
        "disrupted origin (CEPII BACI HS6 bilateral flows, latest year).\n"
        "HHI: the importer's supplier-concentration index for the basket.\n"
        "Severity: transit reduction x duration factor saturating at 6 months; "
        "chokepoint severity is measured from IMF PortWatch vessel transits "
        "and attenuated when a sea bypass exists.\n"
        "Materiality floor: max($100m, 5bps of basket world trade) - rankings "
        "answer 'where is the global supply impact', not 'who is most "
        "dependent'.\n"
        "Limits, stated on every surface: latest-year weights; first-order "
        "effects only; no inventories or substitution; only 24 commodity "
        "baskets visible; financial crises refused (invisible in customs "
        "data); exposure published, probability never."
    )


def main() -> int:
    logging.basicConfig(level=logging.INFO)
    mcp.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
