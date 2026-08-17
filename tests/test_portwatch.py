"""PortWatch observation tests — offline, against snapshotted fixtures.

The fixtures exist so neither CI nor a demo rehearsal depends on IMF uptime.
The Hormuz case is the important one: it pins the behaviour that stops the system
publishing a severity it cannot justify.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest
from autonaly_ingest.portwatch import load_snapshot

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "portwatch"

pytestmark = pytest.mark.skipif(
    not (FIXTURES / "suez_2021_ever_given.json").exists(),
    reason="portwatch fixtures absent — run scripts/snapshot_portwatch.py",
)


@pytest.fixture(scope="module")
def suez_2021():
    return load_snapshot(FIXTURES / "suez_2021_ever_given.json")


@pytest.fixture(scope="module")
def suez_2024():
    return load_snapshot(FIXTURES / "suez_2024_red_sea.json")


@pytest.fixture(scope="module")
def hormuz():
    return load_snapshot(FIXTURES / "hormuz_recent.json")


class TestEverGiven:
    """The demo centrepiece — severity measured, not assumed (hackathon.md §4)."""

    def test_blockage_is_visible_in_the_data(self, suez_2021):
        assert suez_2021.transit_reduction > 0.6

    def test_trough_is_the_grounding_week(self, suez_2021):
        assert suez_2021.trough_day == date(2021, 3, 25)
        assert suez_2021.trough_count <= 5

    def test_trough_reduction_is_near_total(self, suez_2021):
        assert suez_2021.trough_reduction > 0.9

    def test_baseline_is_a_normal_operating_level(self, suez_2021):
        assert 40 < suez_2021.baseline_mean < 80

    def test_observation_is_trusted(self, suez_2021):
        assert suez_2021.severity_is_derivable
        assert suez_2021.suspect_reason is None

    def test_recovery_exceeds_baseline_as_backlog_clears(self, suez_2021):
        after = [d.n_total for d in suez_2021.series if d.day > date(2021, 3, 29)]
        assert after and max(after) > suez_2021.baseline_mean


class TestRedSeaDiversions:
    """A sustained shock rather than an acute one — a different ladder rung."""

    def test_reduction_is_material_but_partial(self, suez_2024):
        assert 0.2 < suez_2024.transit_reduction < 0.6

    def test_is_milder_than_the_grounding(self, suez_2024, suez_2021):
        assert suez_2024.transit_reduction < suez_2021.transit_reduction

    def test_observation_is_trusted(self, suez_2024):
        assert suez_2024.severity_is_derivable


class TestHormuzAisDegradation:
    """RK2, materialised.

    Hormuz reported 8.4 transits/day in July 2026 against 83.5 (2023) and 85.5
    (2025), with near-zero capacity, while every other chokepoint was normal.
    That is either the largest energy shock on record or a degraded AIS feed, and
    the data cannot say which. The system must decline to publish a severity.
    """

    def test_observation_is_flagged_suspect(self, hormuz):
        assert hormuz.is_suspect

    def test_severity_is_not_derivable(self, hormuz):
        assert not hormuz.severity_is_derivable

    def test_reason_names_the_long_run_comparison(self, hormuz):
        assert hormuz.reference_mean and hormuz.reference_mean > 50
        assert "long-run" in hormuz.suspect_reason

    def test_reason_demands_human_review(self, hormuz):
        # The queue is the designed destination for exactly this case.
        assert "human review" in hormuz.suspect_reason.lower()

    def test_summary_carries_the_warning(self, hormuz):
        # A caller printing the summary must not see a clean-looking number.
        assert "SUSPECT" in hormuz.summary()

    def test_the_naive_reading_would_have_understated_the_anomaly(self, hormuz):
        # Measured against its own degraded baseline the drop looks routine (~25%).
        # Measured against the long-run level it is ~90%. Neither is publishable,
        # and the mild-looking figure is the more dangerous of the two.
        assert hormuz.transit_reduction < 0.4
        assert hormuz.baseline_mean / hormuz.reference_mean < 0.25


class TestSnapshotRoundTrip:
    def test_series_survives_serialisation(self, suez_2021):
        assert len(suez_2021.series) > 28
        assert all(d.n_total >= 0 for d in suez_2021.series)

    def test_windows_are_dates(self, suez_2021):
        assert isinstance(suez_2021.event_window[0], date)
        assert suez_2021.baseline_window[1] < suez_2021.event_window[0]
