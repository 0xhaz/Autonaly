"""Analyst commentary on a hypothetical scenario the user built themselves.

The simulator produces numbers with no model in the loop; this adds the desk's
reading of them — on demand, clearly labelled, and under the same numeral
guard as every other narrative. Two rules matter more here than anywhere else:

1. It must be impossible to mistake for an event record. Nothing happened.
2. No probabilities. The desk does not publish likelihoods (that is a product
   line, not a style choice) — it reads consequences, given the premise.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from autonaly_core import get_settings

from .tools import unbacked_numerals

log = logging.getLogger(__name__)

SCENARIO_PROMPT = """You are the crisis desk's analyst. A user has run a
HYPOTHETICAL scenario in the simulator. Nothing has happened. You are reading
the consequences of a premise, not reporting an event.

ABSOLUTE RULES:
- Every number you write must appear in DATA. No computing, estimating or
  annualising. At most four figures, in human units ($14.10bn, 81.2%) — write
  the transit reduction as a percentage ("100%"), never a fraction ("1.0").
- Open with the word "Hypothetical" and restate the premise in one sentence.
- NEVER assess how likely the scenario is. The desk publishes exposure, not
  probability. If tempted, describe sensitivity instead ("a shorter disruption
  scales these figures down proportionally").
- Do not write a citable line. A quotable sentence about a hypothetical invites
  misquotation as fact.
- Write country names in full (China, Yemen), never as ISO codes (CHN, YEM).

Write exactly these sections:

**The premise** — one sentence: what is disrupted (a strait, a port, or a
multi-channel conflict), the effective reduction, the duration, and what can
divert. For a conflict: name the channels and their distinct mechanics —
physical collapse hits every buyer, sanctions hit only the coalition imposing
them. If a bypass or
diversion exists, say the scores are attenuated for it and why that matters.
For a port: the reduction is the port's share of the country's maritime
exports times the share of the port lost — say so.

**Who is hit, and how** — magnitude first, then intensity, naming at most two
countries. Explain in one sentence why the two orderings differ here.

**What the model omits** — the honest limits, specific to this scenario:
latest-year trade weights, first-order effects only, no inventories or
substitution, and anything notable about this chokepoint's data.

SCENARIO
{scenario}

DATA
{data}
"""


def scenario_brief(scenario: dict[str, Any], rankings: dict[str, Any]) -> dict[str, Any]:
    from google import genai

    settings = get_settings()
    client = genai.Client(
        vertexai=True, project=settings.project_id, location=settings.vertex_location
    )

    data = {"scenario": scenario, "rankings": rankings}
    prompt = SCENARIO_PROMPT.format(
        scenario=json.dumps(scenario, indent=2),
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
            }
        log.warning("scenario brief attempt %d unbacked: %s", attempt, bad)
        last_bad = bad

    raise ValueError(f"scenario brief failed provenance: {sorted(last_bad)}")
