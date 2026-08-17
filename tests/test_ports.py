"""Port contract tests. No emulators, no network — the fakes must behave like
the real adapters or the local|gcp seam is a lie (workplan.md §1).
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from autonaly_core.adapters.artifacts import LocalArtifactStore
from autonaly_core.fakes import InMemoryArtifactStore, InMemoryEventBus, InMemoryReviewQueue
from autonaly_core.schema import (
    BriefingRecord,
    BriefingStatus,
    EventDraft,
    Rankings,
    Signal,
)


def _record(record_id: str = "r1") -> BriefingRecord:
    return BriefingRecord(
        id=record_id,
        event_key=record_id,
        title="Test briefing",
        narrative="Body.",
        draft=EventDraft(in_scope=True, confidence=0.9),
        rankings=Rankings(
            event_key=record_id,
            severity_label="moderate",
            affected=[],
            methodology_version="1.0.0",
        ),
        created_at=datetime.now(UTC),
    )


@pytest.fixture(params=["memory", "local"])
def store(request, tmp_path):
    """Both ArtifactStore implementations must satisfy the same contract."""
    return InMemoryArtifactStore() if request.param == "memory" else LocalArtifactStore(tmp_path)


class TestArtifactStore:
    def test_round_trip(self, store):
        store.write("exposure/V202601/2024/ddr.parquet", b"payload")
        assert store.read("exposure/V202601/2024/ddr.parquet") == b"payload"

    def test_exists_is_false_before_write(self, store):
        assert not store.exists("nope/missing.json")

    def test_list_filters_by_prefix(self, store):
        store.write("exposure/2024/a.json", b"1")
        store.write("exposure/2024/b.json", b"2")
        store.write("baci/2024/c.json", b"3")
        assert store.list("exposure/") == ["exposure/2024/a.json", "exposure/2024/b.json"]

    def test_overwrite_replaces(self, store):
        store.write("k", b"old")
        store.write("k", b"new")
        assert store.read("k") == b"new"


class TestLocalArtifactStoreSafety:
    def test_rejects_key_escaping_root(self, tmp_path):
        store = LocalArtifactStore(tmp_path / "artifacts")
        with pytest.raises(ValueError, match="escapes artifact root"):
            store.write("../../etc/passwd", b"nope")


class TestReviewQueue:
    def test_submit_then_get(self):
        queue = InMemoryReviewQueue()
        queue.submit(_record())
        assert queue.get("r1").title == "Test briefing"

    def test_approve_transitions_status(self):
        queue = InMemoryReviewQueue()
        queue.submit(_record())
        assert queue.get("r1").status is BriefingStatus.PENDING
        queue.approve("r1")
        assert queue.get("r1").status is BriefingStatus.PUBLISHED
        assert queue.get("r1").published_at is not None

    def test_list_filters_by_status(self):
        queue = InMemoryReviewQueue()
        queue.submit(_record("a"))
        queue.submit(_record("b"))
        queue.approve("a")
        assert [r.id for r in queue.list(BriefingStatus.PUBLISHED)] == ["a"]
        assert [r.id for r in queue.list(BriefingStatus.PENDING)] == ["b"]


class TestEventBus:
    def test_publish_reaches_bound_subscriber(self):
        bus = InMemoryEventBus()
        seen: list[bytes] = []
        bus.bind("signals-sub", "signals")
        bus.subscribe("signals-sub", lambda data, attrs: seen.append(data))
        bus.publish("signals", b'{"x":1}')
        assert seen == [b'{"x":1}']

    def test_publish_to_other_topic_is_not_delivered(self):
        bus = InMemoryEventBus()
        seen: list[bytes] = []
        bus.bind("signals-sub", "signals")
        bus.subscribe("signals-sub", lambda data, attrs: seen.append(data))
        bus.publish("signals-dlq", b"dead")
        assert seen == []


class TestSignalIdempotency:
    def test_identical_signals_share_a_key(self):
        ts = datetime(2021, 3, 23, 7, 40, tzinfo=UTC)
        a = Signal(headline="Ever Given aground", source="gdelt", observed_at=ts)
        b = Signal(headline="Ever Given aground", source="gdelt", observed_at=ts)
        assert a.key() == b.key()

    def test_different_signals_differ(self):
        ts = datetime(2021, 3, 23, 7, 40, tzinfo=UTC)
        a = Signal(headline="Ever Given aground", source="gdelt", observed_at=ts)
        b = Signal(headline="Hormuz tensions rise", source="gdelt", observed_at=ts)
        assert a.key() != b.key()
