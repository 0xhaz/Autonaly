"""Proactive analyst notes: when the desk files a briefing, every user whose
watchlist it touches gets their personal read generated before they ask.

This is the difference between a report generator and an analyst. The user opens
their dashboard and the note is already there — the agent worked in the
background, which is the entire premise of the track.

Relevance gates the spend: a note is pre-generated only when the user's watched
countries appear in the ranking or their watched baskets overlap the event's.
Everyone else keeps the on-demand button, where "no impact for you" is still a
click away rather than a bill.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from autonaly_core import get_settings
from google.cloud import firestore

log = logging.getLogger(__name__)

PROFILES_COLLECTION = "analyst_profiles"
REPORTS_COLLECTION = "personal_reports"
BRIEFINGS_COLLECTION = "briefings"

# A single briefing fanning out to every user is the demo scale; a real
# deployment would queue this. Cap the synchronous fan-out so a worker cycle
# cannot stall behind an unexpectedly large user base.
MAX_FANOUT = 25


def _relevant(profile: dict, briefing: dict) -> bool:
    rankings = briefing.get("rankings") or {}
    watched_countries = set(profile.get("countries") or [])
    watched_baskets = set(profile.get("baskets") or [])
    ranked_countries = {a.get("country") for a in rankings.get("affected", [])}
    event_baskets = set(rankings.get("baskets") or [])
    return bool(watched_countries & ranked_countries) or bool(watched_baskets & event_baskets)


def notify_analysts(briefing_id: str) -> dict:
    """Pre-generate personal notes for every profile the briefing touches.

    Failures here must never disturb signal processing — the briefing is already
    filed and the human gate unaffected. Every path returns a summary instead of
    raising.
    """
    settings = get_settings()
    db = firestore.Client(project=settings.project_id)

    briefing = db.collection(BRIEFINGS_COLLECTION).document(briefing_id).get().to_dict()
    if not briefing:
        return {"briefing": briefing_id, "error": "briefing not found"}

    generated, skipped, failed = 0, 0, 0
    for doc in db.collection(PROFILES_COLLECTION).limit(MAX_FANOUT).stream():
        profile = doc.to_dict() or {}
        if not _relevant(profile, briefing):
            skipped += 1
            continue
        try:
            from autonaly_agent.personal import personalize

            result = personalize(profile, briefing)
            db.collection(REPORTS_COLLECTION).document(f"{doc.id}__{briefing_id}").set(
                {
                    "narrative": result["narrative"],
                    "briefing_id": briefing_id,
                    "generated_at": datetime.now(UTC).isoformat(),
                    "provenance_verified": bool(result.get("provenance_verified")),
                    "proactive": True,
                }
            )
            generated += 1
        except Exception:  # noqa: BLE001 - fan-out must not break ingestion
            log.exception("proactive note failed for user %s", doc.id)
            failed += 1

    summary = {
        "briefing": briefing_id,
        "generated": generated,
        "skipped": skipped,
        "failed": failed,
    }
    log.info("proactive notes: %s", summary)
    return summary
