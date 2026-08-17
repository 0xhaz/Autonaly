"""Snapshot PortWatch observations into tests/fixtures/.

Run once (and after any PortWatch refresh worth capturing). Everything
downstream — tests, the replay demo, rehearsals — reads the fixtures, so no part
of the build or the recording depends on IMF uptime.

    uv run python scripts/snapshot_portwatch.py
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from autonaly_ingest.portwatch import fetch_chokepoint_metadata, observe, snapshot

REPO_ROOT = Path(__file__).resolve().parents[1]
FIXTURES = REPO_ROOT / "tests" / "fixtures" / "portwatch"

# (name, event start, event end, tail days, fixture filename)
# tail_days carries the recovery period into the series for charting; it does not
# affect any statistic.
TARGETS = [
    # The demo centrepiece: Ever Given grounded 23 Mar 2021, refloated 29 Mar.
    ("Suez Canal", date(2021, 3, 23), date(2021, 3, 29), 21, "suez_2021_ever_given.json"),
    # Red Sea diversions — the same canal under a sustained rather than acute shock.
    ("Suez Canal", date(2024, 1, 1), date(2024, 2, 29), 14, "suez_2024_red_sea.json"),
    # Hormuz: capture a recent window so the watchlist path has real data to
    # reason about. Expected to come back flagged — see portwatch.SUSPECT_*.
    ("Strait of Hormuz", date(2026, 7, 1), date(2026, 7, 31), 0, "hormuz_recent.json"),
]


def main() -> int:
    FIXTURES.mkdir(parents=True, exist_ok=True)

    for name, start, end, tail, filename in TARGETS:
        observation = observe(name, start, end, tail_days=tail)
        snapshot(observation, FIXTURES / filename)
        print(f"  {filename}")
        print(f"    {observation.summary()}")

    metadata = fetch_chokepoint_metadata()
    (FIXTURES / "chokepoint_metadata.json").write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )
    print(f"  chokepoint_metadata.json ({len(metadata)} chokepoints)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
