"""P0 exit gate (workplan.md §3).

Proves the local-first strategy in miniature: every port exercised against its
local substitute, plus the one dependency that has no substitute — Vertex.
Each leg reports independently so a billing block on Vertex doesn't mask the
state of the other three.

    make smoke
"""

from __future__ import annotations

import json
import os
import sys
import traceback
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(REPO_ROOT / ".env.local")

RESULTS: list[tuple[str, bool, str]] = []


def leg(name: str):
    def decorator(fn):
        def wrapped() -> None:
            try:
                detail = fn() or "ok"
                RESULTS.append((name, True, detail))
            except Exception as exc:  # noqa: BLE001 - report, never abort other legs
                first_line = str(exc).strip().splitlines()[0] if str(exc).strip() else repr(exc)
                RESULTS.append((name, False, first_line[:220]))
                if os.environ.get("SMOKE_TRACE"):
                    traceback.print_exc()

        return wrapped

    return decorator


@leg("artifact store (local filesystem)")
def check_artifacts() -> str:
    from autonaly_core import build_artifact_store, get_settings

    store = build_artifact_store()
    key = "_smoke/hello.json"
    store.write(key, json.dumps({"ts": datetime.now(UTC).isoformat()}).encode())
    assert store.exists(key), "write succeeded but exists() is False"
    assert json.loads(store.read(key))["ts"], "round-trip lost the payload"
    assert key in store.list("_smoke/"), "key missing from list()"
    return f"round-trip via {type(store).__name__} at {get_settings().artifact_root}"


@leg("pub/sub (emulator)")
def check_pubsub() -> str:
    from autonaly_core import build_event_bus, get_settings

    host = os.environ.get("PUBSUB_EMULATOR_HOST")
    assert host, "PUBSUB_EMULATOR_HOST unset — would have hit real Pub/Sub"

    s = get_settings()
    bus = build_event_bus()
    bus.ensure_topic(s.signals_topic)
    bus.ensure_topic(s.dlq_topic)
    bus.ensure_subscription(s.signals_subscription, s.signals_topic)
    msg_id = bus.publish(s.signals_topic, b'{"smoke": true}', origin="smoke")
    return f"published {msg_id} to {s.signals_topic} @ {host} (+dlq, +subscription)"


@leg("firestore (emulator)")
def check_firestore() -> str:
    from autonaly_core import build_review_queue, get_settings
    from autonaly_core.schema import (
        BriefingRecord,
        BriefingStatus,
        EventDraft,
        Rankings,
    )

    host = os.environ.get("FIRESTORE_EMULATOR_HOST")
    assert host, "FIRESTORE_EMULATOR_HOST unset — would have hit real Firestore"

    queue = build_review_queue()
    record = BriefingRecord(
        id="_smoke",
        event_key="_smoke",
        title="Smoke test briefing",
        narrative="Placeholder.",
        draft=EventDraft(in_scope=True, confidence=1.0),
        rankings=Rankings(
            event_key="_smoke",
            severity_label="none",
            affected=[],
            methodology_version="0.0.0-smoke",
        ),
        created_at=datetime.now(UTC),
    )
    queue.submit(record)
    assert queue.get("_smoke") is not None, "submitted record not readable"
    queue.approve("_smoke")
    approved = queue.get("_smoke")
    assert approved and approved.status is BriefingStatus.PUBLISHED, "approve() did not stick"
    return f"submit -> get -> approve round-trip @ {host}"


@leg("vertex / gemini (REAL — no emulator exists)")
def check_vertex() -> str:
    from google import genai
    from pydantic import BaseModel

    from autonaly_core import get_settings

    s = get_settings()
    client = genai.Client(vertexai=True, project=s.project_id, location=s.location)

    available = sorted(
        m.name.split("/")[-1]
        for m in client.models.list()
        if "generateContent" in (getattr(m, "supported_actions", None) or ["generateContent"])
    )
    flash = [m for m in available if "flash" in m]

    class Classification(BaseModel):
        in_scope: bool
        commodity: str

    response = client.models.generate_content(
        model=s.gemini_model,
        contents="The Suez Canal is blocked by a grounded container ship. Classify.",
        config={
            "response_mime_type": "application/json",
            "response_schema": Classification,
        },
    )
    parsed = Classification.model_validate_json(response.text)
    return (
        f"model={s.gemini_model} structured-output OK (in_scope={parsed.in_scope}); "
        f"{len(available)} models visible, flash variants: {', '.join(flash[:4]) or 'none'}"
    )


def main() -> int:
    print("\n  Autonaly P0 smoke — local substitutes + real Vertex\n")

    for check in (check_artifacts, check_pubsub, check_firestore, check_vertex):
        check()

    width = max(len(name) for name, _, _ in RESULTS)
    for name, ok, detail in RESULTS:
        print(f"  {'PASS' if ok else 'FAIL'}  {name.ljust(width)}  {detail}")

    failed = [name for name, ok, _ in RESULTS if not ok]
    if failed:
        print(f"\n  {len(failed)} leg(s) failed. Re-run with SMOKE_TRACE=1 for tracebacks.\n")
        return 1

    print("\n  P0 gate green — the local-first seam works end to end.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
