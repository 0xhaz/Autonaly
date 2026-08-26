"""Event schema — the load-bearing artifact (architecture.md §5, D18; OP2 closed = JSON).

Everything renders from this: pages, scores, review queue, and every agent tool
boundary. These models ARE the Pydantic gates referenced in hackathon.md §4 —
malformed LLM output fails here, retries with error context, then goes to DLQ.

Status: first cut. Finalised during P1 (workplan.md §3) once BACI column
semantics are confirmed against real data.
"""

from __future__ import annotations

import hashlib
from datetime import date, datetime
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

Score = Annotated[float, Field(ge=0, le=100)]
Ratio = Annotated[float, Field(ge=0, le=1)]


# --------------------------------------------------------------------------
# enums (architecture.md D6, D8, D11)
# --------------------------------------------------------------------------


class EventType(StrEnum):
    WAR = "war"
    BLOCKADE = "blockade"
    EMBARGO = "embargo"
    EXPORT_RESTRICTION = "export_restriction"
    PANDEMIC = "pandemic"
    NATURAL_DISASTER = "natural_disaster"
    CHOKEPOINT = "chokepoint"


class EventStatus(StrEnum):
    HISTORICAL = "historical"
    WATCHLIST = "watchlist"
    HYPOTHETICAL = "hypothetical"


class Scoring(StrEnum):
    COMPUTED = "computed"
    CURATED = "curated"


class Transmission(StrEnum):
    PHYSICAL_DESTRUCTION = "physical_destruction"
    BLOCKADE = "blockade"
    SANCTIONS = "sanctions"
    EXPORT_RESTRICTION = "export_restriction"
    PORT_CONGESTION = "port_congestion"


class Route(StrEnum):
    """The Taskmaster moment — which tool path the agent picks (hackathon.md §4)."""

    CHOKEPOINT = "chokepoint"
    EXPORT_RESTRICTION = "export_restriction"
    NATURAL_DISASTER = "natural_disaster"


class BriefingStatus(StrEnum):
    PENDING = "pending"
    PUBLISHED = "published"
    REJECTED = "rejected"


# --------------------------------------------------------------------------
# event record components
# --------------------------------------------------------------------------


class DisruptedSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    country: str | None = None
    chokepoint: str | None = None
    commodities: list[str] = Field(default_factory=list, description="HS6 codes")
    share_of_global: Ratio | None = None


class SeverityLevel(BaseModel):
    """Escalation ladder, not a binary event (D15)."""

    model_config = ConfigDict(extra="forbid")

    label: str
    transit_reduction: Ratio
    duration_months: int = Field(ge=0)


class AffectedCountry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    country: str
    score: Score | None = None
    ddr: Ratio | None = Field(default=None, description="Direct dependency ratio (D13.1)")
    hhi: float | None = Field(default=None, description="Supplier concentration (D13.2)")
    value_at_risk_kusd: float | None = Field(
        default=None,
        description=(
            "Absolute import value from disrupted sources. Carried alongside the "
            "ratio because intensity and magnitude answer different questions: a "
            "99%-dependent country importing $60m is not the story a briefing "
            "should lead with when a 77%-dependent one imports $5.2bn."
        ),
    )
    gdp_usd: float | None = Field(
        default=None,
        description="World Bank GDP, carried so exposure can be sized against the economy.",
    )
    at_risk_pct_gdp: float | None = Field(
        default=None,
        description=(
            "Value at risk as a percentage of GDP. Pure arithmetic on two figures "
            "already published, and the one that turns a number into a judgement: "
            "$7.6bn is a rounding error for one economy and a crisis for another."
        ),
    )
    channel: str
    evidence: list[str] = Field(default_factory=list)


class Winner(BaseModel):
    """Every scenario lists beneficiaries (D16)."""

    model_config = ConfigDict(extra="forbid")

    country: str
    mechanism: str
    evidence: list[str] = Field(default_factory=list)


class Event(BaseModel):
    """The full record (architecture.md §5). Post-hackathon this backs every page."""

    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    type: EventType
    status: EventStatus
    scoring: Scoring
    transmission: list[Transmission] = Field(default_factory=list)
    period_start: date
    period_end: date | None = None
    sources_disrupted: list[DisruptedSource] = Field(default_factory=list)
    severity_levels: list[SeverityLevel] = Field(default_factory=list)
    affected: list[AffectedCountry] = Field(default_factory=list)
    winners: list[Winner] = Field(default_factory=list)
    citations: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------
# agent boundary models (hackathon.md §4) — one per tool hop
# --------------------------------------------------------------------------


class Signal(BaseModel):
    """Raw inbound message on the Pub/Sub topic."""

    model_config = ConfigDict(extra="forbid")

    headline: str
    body: str = ""
    source: str = "unknown"
    observed_at: datetime

    def key(self) -> str:
        """Idempotency: signal hash = event key, duplicates no-op (hackathon.md §4)."""
        raw = f"{self.headline}|{self.source}|{self.observed_at.isoformat()}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]


class EventDraft(BaseModel):
    """Gemini structured output from classify_event. Rejects non-physical events (D6/D7)."""

    model_config = ConfigDict(extra="forbid")

    in_scope: bool = Field(description="False for financial crises and non-physical events (D7)")
    out_of_scope_reason: str | None = None
    type: EventType | None = None
    route: Route | None = None
    sources_disrupted: list[DisruptedSource] = Field(default_factory=list)
    commodities: list[str] = Field(default_factory=list)
    confidence: Ratio = 0.0


class SourceImpact(BaseModel):
    """What the disrupted exporter loses.

    Every ranking here answers "who cannot buy". A crisis has a second side:
    the country whose exports stop also stops earning, and in a war scenario
    that is usually the most affected party of all. Computed from the same
    flows as the exposure ranking, so it needs no new data — only the question
    asked in the other direction.
    """

    model_config = ConfigDict(extra="forbid")

    country: str
    export_revenue_at_risk_kusd: float
    """Basket exports × the same severity applied to importers."""

    basket_exports_kusd: float
    share_of_total_exports: float
    """How much of everything this country sells abroad rides on these baskets —
    the difference between an inconvenience and an economy."""

    top_destinations: list[str] = Field(default_factory=list)
    """Who was buying it, largest first."""


class Rankings(BaseModel):
    """Engine output. Deterministic — no LLM ever writes this (the architecture thesis)."""

    model_config = ConfigDict(extra="forbid")

    event_key: str
    severity_label: str
    affected: list[AffectedCountry]
    """Ranked by exposure score, i.e. by *intensity* of dependency."""

    baskets: list[str] = Field(default_factory=list)
    """Basket keys this ranking was computed over. Carried so a reader can
    interrogate the same commodity set the score was built from, rather than
    guessing it from the narrative."""

    sources: list[str] = Field(default_factory=list)
    """The disrupted origins, as ISO3 codes."""

    largest_absolute_exposure: str | None = Field(
        default=None,
        description=(
            "Country with the most trade value at risk. Computed here, not left to "
            "the briefing writer: intensity ranking favours small, concentrated "
            "importers, so a narrative built from the top of `affected` alone will "
            "lead with the wrong country. The composer must cite this for magnitude."
        ),
    )
    winners: list[Winner] = Field(default_factory=list)
    sources_impact: list[SourceImpact] = Field(default_factory=list)
    """The other side of the disruption: what the sources themselves lose."""

    methodology_version: str

    def numerals(self) -> set[str]:
        """Every number the briefing is permitted to contain (see tests/golden)."""
        out: set[str] = set()
        for a in self.affected:
            for v in (a.score, a.ddr, a.hhi):
                if v is not None:
                    out.add(f"{v:.1f}")
        return out


class AgentTrail(BaseModel):
    """How the briefing was produced — the routing decision, made visible.

    The coordinator's choice of specialist is the one genuinely autonomous act
    in the system, and it used to exist only in a log line. A reviewer deciding
    whether to approve should be able to see which desk handled the event and
    what it consulted, without leaving the product.
    """

    model_config = ConfigDict(extra="forbid")

    coordinator: str = "crisis_desk"
    specialist: str | None = None
    """None when the coordinator handled it alone — an out-of-scope refusal."""

    route: str | None = None
    tools_used: list[str] = Field(default_factory=list)
    model: str = ""


class BriefingRecord(BaseModel):
    """What lands in the review queue for one-click human approval."""

    model_config = ConfigDict(extra="forbid")

    id: str
    event_key: str
    title: str
    status: BriefingStatus = BriefingStatus.PENDING
    scoring: Scoring = Scoring.COMPUTED
    """D8's two rendering classes. `curated` means no computed score, and the
    briefing must say why — the honest outcome when severity cannot be
    established from observation."""

    narrative: str
    draft: EventDraft
    rankings: Rankings | None = None
    """None on a `curated` briefing. A degraded data feed must produce no score
    rather than a plausible-looking one."""

    review_note: str | None = None
    """What the human reviewer needs to know before approving — most importantly
    any data-quality warning that blocked scoring."""

    trail: AgentTrail | None = None
    """Written after the run completes: the specialist and route are only known
    once the agent has finished choosing them."""

    created_at: datetime
    published_at: datetime | None = None
