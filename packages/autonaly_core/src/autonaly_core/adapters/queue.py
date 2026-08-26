"""ReviewQueue adapter — one implementation for both environments.

Firestore's client routes to the emulator via FIRESTORE_EMULATOR_HOST, so as
with the bus there is no local/cloud fork in the code.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime

from ..schema import BriefingRecord, BriefingStatus


class FirestoreReviewQueue:
    def __init__(self, project: str, collection: str) -> None:
        from google.cloud import firestore

        self._db = firestore.Client(project=project)
        self._collection = collection

    @property
    def using_emulator(self) -> bool:
        return bool(os.environ.get("FIRESTORE_EMULATOR_HOST"))

    def submit(self, record: BriefingRecord) -> str:
        # Idempotent by construction: doc id is the signal-derived event key.
        payload = record.model_dump(mode="json")
        self._db.collection(self._collection).document(record.id).set(payload)
        return record.id

    def attach_trail(self, record_id: str, trail: dict) -> None:
        """Record how the briefing was produced. Separate from submit() because
        the specialist and route are only known once the run has finished."""
        self._db.collection(self._collection).document(record_id).update({"trail": trail})

    def get(self, record_id: str) -> BriefingRecord | None:
        snap = self._db.collection(self._collection).document(record_id).get()
        return BriefingRecord.model_validate(snap.to_dict()) if snap.exists else None

    def list(self, status: BriefingStatus | None = None) -> list[BriefingRecord]:
        col = self._db.collection(self._collection)
        query = col.where("status", "==", status.value) if status else col
        return [BriefingRecord.model_validate(d.to_dict()) for d in query.stream()]

    def approve(self, record_id: str) -> None:
        self._db.collection(self._collection).document(record_id).update(
            {
                "status": BriefingStatus.PUBLISHED.value,
                "published_at": datetime.now(UTC).isoformat(),
            }
        )
