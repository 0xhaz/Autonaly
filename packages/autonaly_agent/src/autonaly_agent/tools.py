"""Agent tools. Each one is a typed boundary with a Pydantic gate.

Two rules hold across every tool here, and they are what make the architecture
claim true rather than aspirational:

1. **No tool invents a figure.** Anything numeric comes from the exposure engine
   or from PortWatch. The two tools that call Gemini (`classify_event`,
   `compose_briefing`) are constrained by response schemas, and the briefing is
   checked against engine output before it can be submitted.

2. **Uncertainty is escalated, not smoothed over.** When PortWatch data is
   flagged, the tool returns that flag rather than substituting a plausible
   severity. The agent is instructed to route such events to human review.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, date, datetime

import httpx
from autonaly_core import get_settings
from autonaly_core.schema import BriefingRecord, BriefingStatus, EventDraft, Rankings

log = logging.getLogger(__name__)

ENGINE_TIMEOUT = 60.0


def _engine(path: str) -> str:
    return f"{get_settings().engine_url.rstrip('/')}{path}"


# --------------------------------------------------------------------------
# 1. classify — Gemini, structured output, out-of-scope guard
# --------------------------------------------------------------------------


CLASSIFY_PROMPT = """You classify supply-chain disruption signals.

IN SCOPE — events where something physical stops moving:
wars, blockades, embargoes and sanctions, export restrictions, pandemics
(supply side), natural disasters, maritime chokepoint disruptions.

OUT OF SCOPE — set in_scope=false and explain:
financial crises (banking, currency, debt, equity), monetary policy, purely
demand-side shocks, corporate earnings, labour disputes without physical
stoppage. These transmit through capital flows and confidence, which customs
data cannot see; scoring them with trade ratios would be visibly wrong.

Choose exactly one route:
- "chokepoint"          a maritime passage is obstructed or threatened
- "export_restriction"  a country restricts outbound supply of a commodity
- "natural_disaster"    a physical event damaged production in a region

Report confidence honestly. A vague or speculative signal deserves low
confidence; do not inflate it to seem useful.

SIGNAL
Headline: {headline}
Body: {body}
"""


def classify_event(headline: str, body: str = "") -> dict:
    """Classify a raw signal into a typed event draft and choose a route.

    Rejects non-physical events such as financial crises, which are out of scope
    because customs data cannot observe their transmission.

    Args:
        headline: The signal headline.
        body: Optional longer text.

    Returns:
        An event draft with in_scope, type, route, commodities and confidence.
    """
    from google import genai

    settings = get_settings()
    client = genai.Client(
        vertexai=True, project=settings.project_id, location=settings.vertex_location
    )

    last_error: Exception | None = None
    for attempt in range(1, settings.max_llm_retries + 1):
        try:
            response = client.models.generate_content(
                model=settings.gemini_model,
                contents=CLASSIFY_PROMPT.format(headline=headline, body=body or "(none)"),
                config={
                    "response_mime_type": "application/json",
                    "response_schema": EventDraft,
                    "temperature": 0.0,
                },
            )
            # The Pydantic gate. Malformed output fails here, retries with the
            # error as context, and after max_llm_retries goes to the DLQ.
            draft = EventDraft.model_validate_json(response.text)
            return draft.model_dump(mode="json")
        except Exception as exc:  # noqa: BLE001 - retried, then surfaced
            last_error = exc
            log.warning("classify_event attempt %d failed: %s", attempt, exc)

    raise ValueError(
        f"classify_event failed after {settings.max_llm_retries} attempts: {last_error}"
    )


# --------------------------------------------------------------------------
# 2. route handlers
# --------------------------------------------------------------------------


def fetch_chokepoint_status(
    chokepoint: str, event_start: str, event_end: str = ""
) -> dict:
    """Measure observed vessel-transit reduction at a chokepoint from IMF PortWatch.

    Returns severity_is_derivable=false when the feed looks degraded. In that
    case do NOT invent a severity — route the event to human review with the
    stated reason.

    Args:
        chokepoint: Routing key, e.g. "suez" or "hormuz".
        event_start: ISO date the disruption began.
        event_end: ISO date it ended; defaults to event_start.

    Returns:
        Observed transit reduction, baseline levels, and any data-quality flag.
    """
    from autonaly_core.chokepoints import get as get_chokepoint
    from autonaly_ingest.portwatch import observe

    spec = get_chokepoint(chokepoint)
    start = date.fromisoformat(event_start)
    end = date.fromisoformat(event_end) if event_end else start

    observation = observe(spec.portwatch_name, start, end)

    return {
        "chokepoint": spec.key,
        "label": spec.label,
        "transit_reduction": observation.transit_reduction,
        "trough_reduction": observation.trough_reduction,
        "baseline_mean_per_day": observation.baseline_mean,
        "event_mean_per_day": observation.event_mean,
        "trough_day": observation.trough_day.isoformat() if observation.trough_day else None,
        "reroute": spec.reroute.value,
        "reroute_note": (
            "Cargo can divert at a cost in days and freight — a delay, not a cutoff."
            if spec.attenuation() < 1.0
            else "No alternative sea route exists — a genuine supply cutoff."
        ),
        "severity_is_derivable": observation.severity_is_derivable,
        "data_quality_warning": observation.suspect_reason,
        "attribution": "Data: UN Global Platform; IMF PortWatch",
    }


def fetch_concentration(basket: str) -> dict:
    """Look up who dominates world exports of a commodity basket.

    Use this on the export_restriction route to identify the disrupted origin and
    confirm the basket where control actually binds. Note that raw-material codes
    often understate control relative to processed goods.

    Args:
        basket: Basket key, e.g. "rare_earth_magnets" or "wheat".

    Returns:
        World trade value, HHI, and the top exporters with world shares.
    """
    with httpx.Client(timeout=ENGINE_TIMEOUT) as client:
        response = client.get(_engine(f"/concentration/{basket}"))
        response.raise_for_status()
        return response.json()


def list_baskets() -> dict:
    """List valid commodity basket keys with labels and essentiality.

    Call this before compute_exposure rather than guessing a basket name.
    """
    with httpx.Client(timeout=ENGINE_TIMEOUT) as client:
        response = client.get(_engine("/baskets"))
        response.raise_for_status()
        return response.json()


def resolve_region_exports(country: str) -> dict:
    """Find which commodity baskets a country is a significant world exporter of.

    Use this on the natural_disaster route: a disaster damages production in a
    place, and this establishes what that place supplies the world.

    Args:
        country: ISO3 code, e.g. "JPN".

    Returns:
        Baskets where the country holds a material world export share.
    """
    from autonaly_core.baskets import BASKETS

    significant: list[dict] = []
    with httpx.Client(timeout=ENGINE_TIMEOUT) as client:
        for spec in BASKETS:
            if spec.parent:
                continue
            response = client.get(_engine(f"/concentration/{spec.key}"), params={"top_n": 25})
            response.raise_for_status()
            payload = response.json()
            for row in payload["top_exporters"]:
                if row["country"] == country and row["world_share"] >= 0.03:
                    significant.append(
                        {
                            "basket": spec.key,
                            "label": spec.label,
                            "world_share": row["world_share"],
                        }
                    )
                    break

    significant.sort(key=lambda r: r["world_share"], reverse=True)
    return {"country": country, "baskets": significant}


# --------------------------------------------------------------------------
# 3. compute — deterministic, the LLM is not involved
# --------------------------------------------------------------------------


def compute_exposure(
    event_key: str,
    sources: list[str],
    baskets: list[str],
    severity_label: str = "severe",
    transit_reduction: float = 1.0,
    duration_months: int = 3,
) -> dict:
    """Compute country exposure rankings. Deterministic — no model involved.

    Args:
        event_key: Stable key for this event.
        sources: ISO3 codes of disrupted supplier countries.
        baskets: Commodity basket keys from list_baskets.
        severity_label: Human label for this ladder rung.
        transit_reduction: Fraction of supply disrupted, 0 to 1.
        duration_months: Expected duration.

    Returns:
        Rankings with scores, dependency ratios, value at risk, and winners.
    """
    with httpx.Client(timeout=ENGINE_TIMEOUT) as client:
        response = client.post(
            _engine("/exposure"),
            json={
                "event_key": event_key,
                "sources": sources,
                "baskets": baskets,
                "severity": {
                    "label": severity_label,
                    "transit_reduction": transit_reduction,
                    "duration_months": duration_months,
                },
            },
        )
        response.raise_for_status()
        return response.json()


def compute_chokepoint_exposure(
    event_key: str,
    chokepoint: str,
    transit_reduction: float,
    duration_months: int = 1,
    severity_label: str = "observed",
) -> dict:
    """Compute exposure for a chokepoint disruption. Deterministic.

    Pass the transit_reduction measured by fetch_chokepoint_status. The engine
    applies the trade geography and bypass attenuation for this chokepoint, so an
    equal transit collapse does not score equally everywhere.

    Args:
        event_key: Stable key for this event.
        chokepoint: Routing key, e.g. "suez".
        transit_reduction: Observed reduction from fetch_chokepoint_status.
        duration_months: Expected duration.
        severity_label: Human label for this ladder rung.

    Returns:
        Rankings with scores, dependency ratios, value at risk, and winners.
    """
    with httpx.Client(timeout=ENGINE_TIMEOUT) as client:
        response = client.post(
            _engine("/chokepoint"),
            json={
                "event_key": event_key,
                "chokepoint": chokepoint,
                "transit_reduction": transit_reduction,
                "duration_months": duration_months,
                "severity_label": severity_label,
            },
        )
        response.raise_for_status()
        return response.json()


# --------------------------------------------------------------------------
# 4. compose — narrative around the numbers, never instead of them
# --------------------------------------------------------------------------


COMPOSE_PROMPT = """Write a supply-chain crisis briefing for an analyst audience.

ABSOLUTE RULE: every number you write must appear in the DATA below. Do not
compute, round differently, estimate, annualise, or infer any figure. If you want
to state something the data does not contain, describe it qualitatively instead.

Lead with magnitude, then intensity. The country with the largest absolute
exposure is named in the data as largest_absolute_exposure — that is the headline.
The ranking is ordered by dependency *intensity*, which favours smaller, more
concentrated importers; do not present the top of that list as though it were the
biggest story.

{severity_guidance}

Structure:
- One-paragraph summary: what happened and who it matters to most.
- Exposure: the largest absolute exposure, then the most intensely dependent.
- Beneficiaries, if any are listed.
- Limitations: state that figures use latest-year trade weights and first-order
  effects only.

Be direct. No hedging filler, no invented causes, no forecasts or advice.

EVENT
{event_summary}

DATA
{data}
"""

SEVERITY_GUIDANCE_ATTENUATED = """
IMPORTANT: cargo can divert around this chokepoint. Describe this as a cost and
delay shock, not a supply cutoff, and say so plainly. Low exposure scores are the
correct result here, not an error — explain that rerouting is why.
"""

SEVERITY_GUIDANCE_CUTOFF = """
This chokepoint has no alternative sea route, so a disruption is a genuine supply
cutoff rather than a delay.
"""

UNSCORED_GUIDANCE = """
NO EXPOSURE SCORES ARE AVAILABLE for this event, because the underlying data could
not support a defensible severity. Do not estimate exposure, name affected
countries, or imply a magnitude. State what was observed, state plainly that the
data quality prevented scoring, quote the reason, and say the event needs analyst
review. A short, honest briefing is the correct output here.
"""

# Numerals that carry no quantitative claim: small counts, calendar years, and
# days of the month. Dates are not figures — an earlier version rejected a
# narrative for writing "2021-03-29", which is the event's own date, and forced a
# pointless retry.
_ALLOWED_FREE_NUMERALS = (
    {str(n) for n in range(0, 32)}
    | {str(y) for y in range(1900, 2101)}
    | {f"{m:02d}" for m in range(1, 13)}
)


def _numerals(text: str) -> set[str]:
    """Extract numerals, treating comma-grouped digits as one number.

    Without this, "$18,500m" splits into "18" and "500" — and "18" falls inside
    the allowed small-integer range, so half of a fabricated figure would pass
    unnoticed.
    """
    return {
        match.replace(",", "")
        for match in re.findall(r"\d[\d,]*(?:\.\d+)?", text)
    }


def unbacked_numerals(
    narrative: str, rankings: dict, event_summary: str = ""
) -> set[str]:
    """Numerals in the narrative that do not appear in the engine output.

    This is the mechanical enforcement of the architecture thesis. If it returns
    anything, the briefing asserted a figure the engine did not produce.

    The event summary counts as backing: it is input data from the signal, so a
    number quoted from it is sourced, not invented.
    """
    import json

    backing = _numerals(json.dumps(rankings)) | _numerals(event_summary)
    # Percentages are the common rendering of a ratio: 0.771 -> 77.1 or 77.
    for value in list(backing):
        try:
            as_float = float(value)
        except ValueError:
            continue
        # JSON renders 4010000.0; prose writes 4,010,000. Same number.
        if as_float.is_integer():
            backing.add(str(int(as_float)))

        if as_float <= 1.0:
            backing.add(f"{as_float * 100:.1f}")
            backing.add(f"{round(as_float * 100)}")
        # Thousand-USD to billions, the unit a briefing actually uses.
        if as_float > 1000:
            backing.add(f"{as_float / 1e6:.2f}")
            backing.add(f"{as_float / 1e6:.1f}")
            backing.add(f"{round(as_float / 1e6)}")

    return {
        n
        for n in _numerals(narrative)
        if n not in backing and n not in _ALLOWED_FREE_NUMERALS
    }


def compose_briefing(
    event_summary: str,
    rankings: dict | None = None,
    observation: dict | None = None,
    reroute: str = "",
) -> dict:
    """Draft the briefing narrative around measured figures.

    The model writes prose; every number must come from the data passed in.
    Output is checked and rejected if it asserts an unbacked figure.

    Pass `observation` alone when exposure could not be computed — the narrative
    is then written around the observed data and its stated limitation.

    Args:
        event_summary: Short description of the event.
        rankings: The exact object returned by a compute_* tool, if available.
        observation: The chokepoint status object, when scoring was not possible.
        reroute: The chokepoint reroute status, if this was a chokepoint event.

    Returns:
        The narrative plus a provenance report.
    """
    import json

    from google import genai

    if not rankings and not observation:
        raise ValueError("compose_briefing needs rankings or observation to draw numbers from")

    data: dict = {}
    if rankings:
        data["rankings"] = rankings
    if observation:
        data["observation"] = observation

    settings = get_settings()
    client = genai.Client(
        vertexai=True, project=settings.project_id, location=settings.vertex_location
    )

    guidance = ""
    if reroute == "longer_route":
        guidance = SEVERITY_GUIDANCE_ATTENUATED
    elif reroute == "none":
        guidance = SEVERITY_GUIDANCE_CUTOFF
    if not rankings:
        guidance += UNSCORED_GUIDANCE

    prompt = COMPOSE_PROMPT.format(
        severity_guidance=guidance,
        event_summary=event_summary,
        data=json.dumps(data, indent=2),
    )

    last_bad: set[str] = set()
    for attempt in range(1, settings.max_llm_retries + 1):
        contents = prompt
        if last_bad:
            contents += (
                f"\n\nPREVIOUS ATTEMPT REJECTED. These numbers do not appear in the "
                f"DATA: {sorted(last_bad)}. Rewrite using only figures present in "
                f"DATA, or describe those points qualitatively."
            )
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
            config={"temperature": 0.2},
        )
        narrative = (response.text or "").strip()
        unbacked = unbacked_numerals(narrative, data, event_summary)
        if not unbacked:
            return {
                "narrative": narrative,
                "provenance_verified": True,
                "attempts": attempt,
            }
        log.warning("compose_briefing attempt %d had unbacked numerals: %s", attempt, unbacked)
        last_bad = unbacked

    raise ValueError(
        f"compose_briefing could not produce a fully traceable narrative after "
        f"{settings.max_llm_retries} attempts; unbacked figures: {sorted(last_bad)}"
    )


# --------------------------------------------------------------------------
# 5. submit — the human gate
# --------------------------------------------------------------------------


def submit_for_review(
    event_key: str,
    title: str,
    narrative: str,
    draft: dict,
    rankings: dict | None = None,
    review_note: str = "",
) -> dict:
    """File the briefing in the review queue for human approval.

    Idempotent: the event key is the document id, so a duplicate signal
    overwrites rather than creating a second briefing.

    Omit rankings when exposure could not be computed — a degraded data feed, for
    instance. The briefing is then filed as `curated`, carrying the narrative and
    the reason but no score. That is a valid outcome, not a failure.

    Args:
        event_key: Stable event key, used as the record id.
        title: Briefing title.
        narrative: The composed narrative.
        draft: The event draft from classify_event.
        rankings: The rankings from a compute_* tool, if exposure was computed.
        review_note: Anything the reviewer must know, such as a data-quality
            warning that prevented a severity being derived.

    Returns:
        The queued record id, status, and scoring class.
    """
    from autonaly_core import build_review_queue
    from autonaly_core.schema import Scoring

    scored = bool(rankings)
    record = BriefingRecord(
        id=event_key,
        event_key=event_key,
        title=title,
        status=BriefingStatus.PENDING,
        scoring=Scoring.COMPUTED if scored else Scoring.CURATED,
        narrative=narrative,
        draft=EventDraft.model_validate(draft),
        rankings=Rankings.model_validate(rankings) if scored else None,
        review_note=review_note or None,
        created_at=datetime.now(UTC),
    )
    queue = build_review_queue()
    record_id = queue.submit(record)
    log.info(
        "queued %s briefing %s for review%s",
        record.scoring.value,
        record_id,
        " (unscored — see review_note)" if not scored else "",
    )
    return {
        "record_id": record_id,
        "status": BriefingStatus.PENDING.value,
        "scoring": record.scoring.value,
        "review_note": review_note,
    }
