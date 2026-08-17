"""autonaly_core — shared contracts and the local|gcp seam.

Build ports through the factories below; never construct adapters directly in
application code. That is what keeps cutover (workplan.md §3 P6) a config flip.
"""

from __future__ import annotations

from .ports import ArtifactStore, EventBus, ReviewQueue
from .schema import (
    AffectedCountry,
    BriefingRecord,
    BriefingStatus,
    Event,
    EventDraft,
    EventType,
    Rankings,
    Route,
    Signal,
    Winner,
)
from .settings import Env, Settings, get_settings

__all__ = [
    "AffectedCountry",
    "ArtifactStore",
    "BriefingRecord",
    "BriefingStatus",
    "Env",
    "Event",
    "EventBus",
    "EventDraft",
    "EventType",
    "Rankings",
    "ReviewQueue",
    "Route",
    "Settings",
    "Signal",
    "Winner",
    "build_artifact_store",
    "build_event_bus",
    "build_review_queue",
    "get_settings",
]


def build_artifact_store(settings: Settings | None = None) -> ArtifactStore:
    s = settings or get_settings()
    if s.is_local:
        from .adapters.artifacts import LocalArtifactStore

        return LocalArtifactStore(s.artifact_root)

    from .adapters.artifacts import GCSArtifactStore

    return GCSArtifactStore(s.artifact_bucket, project=s.project_id)


def build_event_bus(settings: Settings | None = None) -> EventBus:
    s = settings or get_settings()
    # Checked here rather than in get_settings(): this is the moment a client is
    # created that will silently address production if the environment is wrong.
    s.assert_environment_consistent()
    from .adapters.bus import PubSubEventBus

    return PubSubEventBus(s.project_id)


def build_review_queue(settings: Settings | None = None) -> ReviewQueue:
    s = settings or get_settings()
    s.assert_environment_consistent()
    from .adapters.queue import FirestoreReviewQueue

    return FirestoreReviewQueue(s.project_id, s.briefings_collection)
