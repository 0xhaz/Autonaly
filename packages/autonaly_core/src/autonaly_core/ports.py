"""The three ports. Adapters live in `adapters/`, test doubles in `fakes.py`.

Deliberately narrow: three protocols, thin adapters, no plugin framework
(workplan.md §7 RK-F).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Protocol, runtime_checkable

from .schema import BriefingRecord, BriefingStatus


@runtime_checkable
class ArtifactStore(Protocol):
    """Versioned Parquet/JSON artifacts. Local filesystem or GCS."""

    def read(self, key: str) -> bytes: ...

    def write(self, key: str, data: bytes) -> None: ...

    def exists(self, key: str) -> bool: ...

    def list(self, prefix: str = "") -> list[str]: ...


@runtime_checkable
class EventBus(Protocol):
    """Signal transport. Pub/Sub in both envs; the emulator differs only by env var."""

    def publish(self, topic: str, payload: bytes, **attributes: str) -> str: ...

    def subscribe(
        self, subscription: str, handler: Callable[[bytes, dict[str, str]], None]
    ) -> None: ...


@runtime_checkable
class ReviewQueue(Protocol):
    """Human-approval gate. Firestore in both envs."""

    def submit(self, record: BriefingRecord) -> str: ...

    def get(self, record_id: str) -> BriefingRecord | None: ...

    def list(self, status: BriefingStatus | None = None) -> list[BriefingRecord]: ...

    def approve(self, record_id: str) -> None: ...

    def attach_trail(self, record_id: str, trail: dict) -> None: ...
