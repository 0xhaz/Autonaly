"""Scoring-formula unit tests. Pure functions, no data, no network.

These pin the properties the methodology page will claim (D14). If a formula
changes, these fail before any ranking silently shifts.
"""

from __future__ import annotations

import pytest
from autonaly_engine.scoring import (
    CONCENTRATION_FLOOR,
    Severity,
    concentration_factor,
    exposure_score,
    substitution_capacity,
)

FULL = Severity(label="full", transit_reduction=1.0, duration_months=12)


class TestConcentrationFactor:
    def test_perfectly_diversified_hits_the_floor(self):
        assert concentration_factor(0.0) == CONCENTRATION_FLOOR

    def test_monopoly_supply_hits_one(self):
        assert concentration_factor(1.0) == 1.0

    def test_is_monotonic(self):
        values = [concentration_factor(h / 10) for h in range(11)]
        assert values == sorted(values)

    def test_clamps_out_of_range_input(self):
        assert concentration_factor(-5) == CONCENTRATION_FLOOR
        assert concentration_factor(5) == 1.0


class TestSeverityMultiplier:
    def test_full_long_disruption_is_unity(self):
        assert FULL.multiplier() == 1.0

    def test_partial_transit_reduction_scales_linearly(self):
        half = Severity(label="partial", transit_reduction=0.5, duration_months=12)
        assert half.multiplier() == pytest.approx(0.5)

    def test_short_disruption_still_has_impact(self):
        # A blockage lasting days is not zero-impact; the floor encodes that.
        brief = Severity(label="brief", transit_reduction=1.0, duration_months=0)
        assert brief.multiplier() > 0.3

    def test_duration_saturates(self):
        six = Severity(label="six", transit_reduction=1.0, duration_months=6)
        sixty = Severity(label="sixty", transit_reduction=1.0, duration_months=60)
        assert six.multiplier() == sixty.multiplier()


class TestExposureScore:
    def test_zero_dependency_scores_zero(self):
        assert exposure_score(0.0, 0.9, 1.0, FULL) == 0.0

    def test_total_dependency_on_a_monopoly_staple_maxes_out(self):
        assert exposure_score(1.0, 1.0, 1.0, FULL) == 100.0

    def test_score_is_bounded(self):
        assert 0 <= exposure_score(1.0, 1.0, 1.0, FULL) <= 100

    def test_diversified_supply_scores_below_concentrated(self):
        concentrated = exposure_score(0.8, 0.95, 1.0, FULL)
        diversified = exposure_score(0.8, 0.10, 1.0, FULL)
        assert diversified < concentrated

    def test_essentiality_ranks_food_above_industrial(self):
        staple = exposure_score(0.8, 0.5, 1.0, FULL)
        industrial = exposure_score(0.8, 0.5, 0.6, FULL)
        assert staple > industrial

    def test_monotonic_in_dependency(self):
        scores = [exposure_score(d / 10, 0.5, 1.0, FULL) for d in range(11)]
        assert scores == sorted(scores)


class TestSubstitutionCapacity:
    def test_disrupted_supplier_can_never_win(self):
        assert substitution_capacity(0.9, is_disrupted=True, existing_share=0.0) == 0.0

    def test_incumbent_at_full_share_has_no_headroom(self):
        assert substitution_capacity(0.5, is_disrupted=False, existing_share=1.0) == 0.0

    def test_large_exporter_with_headroom_ranks_highest(self):
        big = substitution_capacity(0.40, False, 0.0)
        small = substitution_capacity(0.05, False, 0.0)
        assert big > small
