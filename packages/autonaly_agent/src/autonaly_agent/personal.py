"""Personalized impact notes: one event, read through one user's analyst profile.

The desk files one briefing per event. But "is this bad?" depends on who is
asking — a user watching semiconductors and Vietnam needs a different answer
than one watching wheat and Egypt. This module writes that answer: a short note
grounded in the rows of the ranking that intersect the user's profile, under the
same numeral-provenance guard as every other narrative.

Lives in the agent package deliberately: the engine's no-LLM invariant is
enforced by tests, and this calls Gemini.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from autonaly_core import get_settings

from .tools import unbacked_numerals

log = logging.getLogger(__name__)

PERSONAL_PROMPT = """You are {analyst_name}, a personal supply-chain risk analyst.
Your user watches these commodities: {baskets}. These countries: {countries}.
These chokepoints: {chokepoints}.

An event briefing has been published. Write the user a short personal impact
note — what THIS event means for THEIR watchlist, not a restatement of the
general briefing.

ABSOLUTE RULE: every number you write must appear in the DATA below. No
computing, no estimating, no annualising.

Structure — three short sections, nothing else:

**Relevance** — one or two sentences: does this event touch their watchlist at
all, and through which of their interests? If it genuinely does not, say so
plainly; a "no impact for you" is a valuable answer.

**Your exposure** — only the countries and commodities THEY watch, with the
figures from DATA. If a watched country is absent from the ranking, say it was
not materially exposed. At most three figures, always in human units —
$4.56bn, 89.7% — never raw storage units like "thousand USD" or field names.

**Watch next** — one concrete, data-grounded thing to monitor (a chokepoint
status, a supplier concentration), phrased as observation, never advice to
trade or forecast.

Tone: direct, first person as their analyst ("your Vietnam exposure..."). No
hedging filler, no advice, no forecasts.

EVENT BRIEFING TITLE: {title}

DATA
{data}
"""


def personalize(profile: dict[str, Any], briefing: dict[str, Any]) -> dict[str, Any]:
    """Write the personal note. Returns narrative + provenance verdict."""
    from google import genai

    settings = get_settings()
    client = genai.Client(
        vertexai=True, project=settings.project_id, location=settings.vertex_location
    )

    rankings = briefing.get("rankings") or {}
    watched_countries = set(profile.get("countries") or [])
    watched_baskets = set(profile.get("baskets") or [])

    # Ground the note in exactly the rows the user cares about, plus the event
    # headline facts. Smaller backing = tighter guard and shorter prompt.
    relevant_rows = [
        a for a in rankings.get("affected", []) if a.get("country") in watched_countries
    ]
    data = {
        "event": {
            "title": briefing.get("title"),
            "severity": rankings.get("severity_label"),
            "baskets": rankings.get("baskets"),
            "sources": rankings.get("sources"),
            "largest_absolute_exposure": rankings.get("largest_absolute_exposure"),
        },
        "your_watched_countries_in_ranking": relevant_rows,
        "watched_countries_not_in_ranking": sorted(
            watched_countries - {a.get("country") for a in rankings.get("affected", [])}
        ),
        "basket_overlap": sorted(watched_baskets & set(rankings.get("baskets") or [])),
        "review_note": briefing.get("review_note"),
    }

    prompt = PERSONAL_PROMPT.format(
        analyst_name=profile.get("analyst_name") or "your analyst",
        baskets=", ".join(profile.get("baskets") or []) or "(none set)",
        countries=", ".join(profile.get("countries") or []) or "(none set)",
        chokepoints=", ".join(profile.get("chokepoints") or []) or "(none set)",
        title=briefing.get("title"),
        data=json.dumps(data, indent=2),
    )

    last_bad: set[str] = set()
    for attempt in range(1, settings.max_llm_retries + 1):
        contents = prompt
        if last_bad:
            contents += (
                f"\n\nPREVIOUS ATTEMPT REJECTED — these numbers are not in DATA: "
                f"{sorted(last_bad)}. Use only figures present in DATA."
            )
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
            config={"temperature": 0.2},
        )
        narrative = (response.text or "").strip()
        bad = unbacked_numerals(narrative, data)
        if not bad:
            return {
                "narrative": narrative,
                "provenance_verified": True,
                "attempts": attempt,
                "relevant_rows": len(relevant_rows),
            }
        log.warning("personalize attempt %d unbacked: %s", attempt, bad)
        last_bad = bad

    raise ValueError(f"personal note failed provenance after retries: {sorted(last_bad)}")
