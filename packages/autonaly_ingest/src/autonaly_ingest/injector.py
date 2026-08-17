"""Replay injector — publishes a historical signal as though it were breaking.

This is the demo centrepiece. The 2021 Suez signal goes onto the same topic a
live GDELT poll would use, and nothing downstream knows the difference: the agent
classifies it, measures the real transit collapse from PortWatch, computes real
exposure, and files a real briefing.

    make replay-suez
    uv run python -m autonaly_ingest.injector --list
"""

from __future__ import annotations

import argparse
import json
import logging
from datetime import UTC, datetime

from autonaly_core import build_event_bus, get_settings
from autonaly_core.schema import Signal

from .topology import ensure_topology

log = logging.getLogger(__name__)


# Historical signals, written as they would have arrived. Dates are stated in the
# body because that is how a real wire story reads — the agent has to extract
# them, which is part of what is being demonstrated.
REPLAYS: dict[str, Signal] = {
    "suez": Signal(
        headline="Container ship Ever Given runs aground in Suez Canal, blocking all traffic",
        body=(
            "The 20,000-TEU vessel wedged across the waterway on 23 March 2021, halting "
            "transits in both directions. Salvage crews expect the operation to take "
            "several days. Shipping lines are weighing diversions around the Cape of "
            "Good Hope. The blockage ran from 2021-03-23 until the vessel was refloated "
            "on 2021-03-29."
        ),
        source="replay:2021-suez",
        observed_at=datetime(2021, 3, 23, 7, 40, tzinfo=UTC),
    ),
    "rare-earth": Signal(
        headline="China announces export licensing regime for rare-earth magnets",
        body=(
            "Beijing will require export licences for neodymium-iron-boron permanent "
            "magnets and related processed rare-earth products, effective immediately. "
            "Analysts expect licence approvals to be slow for some destinations."
        ),
        source="replay:rare-earth",
        observed_at=datetime(2026, 8, 1, 9, 0, tzinfo=UTC),
    ),
    "hormuz": Signal(
        headline="Naval tensions escalate in the Strait of Hormuz",
        body=(
            "Shipping advisories warn of interference with commercial traffic through "
            "the strait. Operators report navigation difficulties. Window 2026-07-01 "
            "to 2026-07-31."
        ),
        source="replay:hormuz-watchlist",
        observed_at=datetime(2026, 7, 31, 12, 0, tzinfo=UTC),
    ),
    "financial": Signal(
        headline="Regional bank collapse triggers credit crunch across eurozone",
        body=(
            "Two mid-sized lenders failed after a run on deposits; interbank lending "
            "rates spiked and equity markets fell sharply."
        ),
        source="replay:out-of-scope",
        observed_at=datetime(2026, 8, 10, 8, 0, tzinfo=UTC),
    ),
}


def publish(name: str) -> dict:
    """Publish one replay signal onto the live signals topic."""
    if name not in REPLAYS:
        raise KeyError(f"unknown replay {name!r}; known: {sorted(REPLAYS)}")

    settings = get_settings()
    ensure_topology()

    signal = REPLAYS[name]
    payload = signal.model_dump_json().encode()

    bus = build_event_bus()
    message_id = bus.publish(
        settings.signals_topic,
        payload,
        replay=name,
        signal_key=signal.key(),
    )
    return {
        "replay": name,
        "message_id": message_id,
        "signal_key": signal.key(),
        "headline": signal.headline,
        "topic": settings.signals_topic,
    }


def publish_malformed() -> dict:
    """Publish a signal that cannot pass the Pydantic gate.

    Used to demonstrate the failure path on camera: gate rejects it, redelivery
    retries, and after three attempts it lands in the dead-letter queue rather
    than being silently dropped or half-processed.
    """
    settings = get_settings()
    ensure_topology()

    bus = build_event_bus()
    payload = json.dumps({"headline": "missing required fields", "nonsense": True}).encode()
    message_id = bus.publish(settings.signals_topic, payload, replay="malformed")
    return {"replay": "malformed", "message_id": message_id, "topic": settings.signals_topic}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="autonaly-injector")
    parser.add_argument("replay", nargs="?", default="suez")
    parser.add_argument("--list", action="store_true", help="list available replays")
    parser.add_argument(
        "--malformed",
        action="store_true",
        help="publish an invalid signal to exercise the dead-letter path",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="  %(message)s")

    if args.list:
        for name, signal in REPLAYS.items():
            print(f"  {name:12s} {signal.headline}")
        return 0

    result = publish_malformed() if args.malformed else publish(args.replay)
    print()
    for key, value in result.items():
        print(f"  {key:12s} {value}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
