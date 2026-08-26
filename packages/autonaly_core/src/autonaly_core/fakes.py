"""In-memory test doubles. Unit tests need neither emulators nor network."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from datetime import UTC, datetime

from .schema import BriefingRecord, BriefingStatus


class InMemoryArtifactStore:
    def __init__(self) -> None:
        self._data: dict[str, bytes] = {}

    def read(self, key: str) -> bytes:
        return self._data[key]

    def write(self, key: str, data: bytes) -> None:
        self._data[key] = data

    def exists(self, key: str) -> bool:
        return key in self._data

    def list(self, prefix: str = "") -> list[str]:
        return sorted(k for k in self._data if k.startswith(prefix))


class InMemoryEventBus:
    """Synchronous: publish invokes registered handlers immediately."""

    def __init__(self) -> None:
        self.published: dict[str, list[tuple[bytes, dict[str, str]]]] = defaultdict(list)
        self._handlers: dict[str, Callable[[bytes, dict[str, str]], None]] = {}
        self._bindings: dict[str, str] = {}

    def bind(self, subscription: str, topic: str) -> None:
        self._bindings[subscription] = topic

    def publish(self, topic: str, payload: bytes, **attributes: str) -> str:
        self.published[topic].append((payload, attributes))
        for sub, bound in self._bindings.items():
            if bound == topic and (handler := self._handlers.get(sub)):
                handler(payload, attributes)
        return f"{topic}-{len(self.published[topic])}"

    def subscribe(
        self, subscription: str, handler: Callable[[bytes, dict[str, str]], None]
    ) -> None:
        self._handlers[subscription] = handler


class InMemoryReviewQueue:
    def __init__(self) -> None:
        self._records: dict[str, BriefingRecord] = {}

    def submit(self, record: BriefingRecord) -> str:
        self._records[record.id] = record
        return record.id

    def get(self, record_id: str) -> BriefingRecord | None:
        return self._records.get(record_id)

    def list(self, status: BriefingStatus | None = None) -> list[BriefingRecord]:
        return [r for r in self._records.values() if status is None or r.status is status]

    def attach_trail(self, record_id: str, trail: dict) -> None:
        record = self._records.get(record_id)
        if record is not None:
            self._records[record_id] = record.model_copy(update={"trail": trail})

    def approve(self, record_id: str) -> None:
        record = self._records[record_id]
        self._records[record_id] = record.model_copy(
            update={"status": BriefingStatus.PUBLISHED, "published_at": datetime.now(UTC)}
        )
