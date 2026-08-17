"""Numeral-provenance guard tests.

This is the mechanical enforcement of "the model never generates a number".
No LLM is called here — the guard is a pure function over text and data, which
is exactly why it can be trusted as a gate.
"""

from __future__ import annotations

from autonaly_agent.tools import unbacked_numerals

RANKINGS = {
    "event_key": "test",
    "severity_label": "severe",
    "largest_absolute_exposure": "EGY",
    "methodology_version": "1.0.0",
    "affected": [
        {
            "country": "EGY",
            "score": 53.7,
            "ddr": 0.771,
            "hhi": 0.393,
            "value_at_risk_kusd": 4010000.0,
            "channel": "import dependency on RUS+UKR",
            "evidence": ["$4.01bn at risk"],
        }
    ],
    "winners": [{"country": "CAN", "mechanism": "substitute", "evidence": []}],
}


class TestBackedFiguresPass:
    def test_score_quoted_verbatim(self):
        assert not unbacked_numerals("Egypt scores 53.7 on exposure.", RANKINGS)

    def test_ratio_rendered_as_percentage(self):
        # 0.771 -> "77.1%" is the normal way a briefing states a ratio.
        assert not unbacked_numerals("Egypt is 77.1% dependent.", RANKINGS)

    def test_ratio_rendered_as_rounded_percentage(self):
        assert not unbacked_numerals("Egypt is 77% dependent.", RANKINGS)

    def test_thousand_usd_rendered_as_billions(self):
        assert not unbacked_numerals("$4.01bn of imports are at risk.", RANKINGS)

    def test_methodology_version(self):
        assert not unbacked_numerals("Methodology version 1.0.0 applies.", RANKINGS)


class TestInventedFiguresAreCaught:
    def test_fabricated_percentage_is_rejected(self):
        assert unbacked_numerals("Egypt is 92.4% dependent.", RANKINGS) == {"92.4"}

    def test_fabricated_dollar_figure_is_rejected(self):
        assert "8.75" in unbacked_numerals("Some $8.75bn is at risk.", RANKINGS)

    def test_plausible_but_underived_arithmetic_is_rejected(self):
        # The dangerous case: the model annualises or sums correctly, but the
        # engine never published that figure so nothing traces it.
        assert unbacked_numerals("Annualised, that is $48.12bn.", RANKINGS) == {"48.12"}

    def test_multiple_inventions_all_reported(self):
        found = unbacked_numerals("Scores of 88.1 and 64.3 were observed.", RANKINGS)
        assert found == {"88.1", "64.3"}


class TestDatesAreNotFigures:
    """An earlier version rejected the event's own date and forced a retry."""

    def test_iso_date_is_allowed(self):
        assert not unbacked_numerals("The blockage ran 2021-03-23 to 2021-03-29.", RANKINGS)

    def test_year_alone_is_allowed(self):
        assert not unbacked_numerals("Trade weights are from 2024.", RANKINGS)

    def test_small_counts_are_allowed(self):
        assert not unbacked_numerals("Three of 28 suppliers were affected.", RANKINGS)

    def test_a_large_year_like_number_is_still_checked(self):
        # 9999 is not a plausible year and is not in the data.
        assert unbacked_numerals("A figure of 9999 appeared.", RANKINGS) == {"9999"}


class TestEventSummaryCountsAsBacking:
    """Numbers quoted from the signal are sourced, not invented."""

    def test_figure_from_the_signal_is_accepted(self):
        summary = "The 20,000-TEU Ever Given wedged across the canal."
        assert not unbacked_numerals("The 20,000-TEU vessel blocked traffic.", RANKINGS, summary)

    def test_figure_absent_from_both_is_still_rejected(self):
        summary = "The Ever Given wedged across the canal."
        assert unbacked_numerals("Some 18,500 containers were delayed.", RANKINGS, summary) == {
            "18500"
        }


class TestCommaGroupedNumbersAreNotSplit:
    """Splitting "18,500" into "18" and "500" would let the small-integer
    allowance hide half of a fabricated figure."""

    def test_grouped_number_is_treated_as_one(self):
        assert unbacked_numerals("A total of 1,234,567 units.", RANKINGS) == {"1234567"}

    def test_grouped_backed_figure_still_passes(self):
        data = {"total": 4010000.0}
        assert not unbacked_numerals("The figure was 4,010,000.", data)


class TestObservationBacking:
    """The unscored path draws its numbers from the PortWatch observation."""

    def test_observation_figures_are_backed(self):
        data = {
            "observation": {
                "baseline_mean_per_day": 11.21,
                "event_mean_per_day": 8.42,
                "severity_is_derivable": False,
            }
        }
        assert not unbacked_numerals(
            "Transits ran 8.42/day against a baseline of 11.21.", data
        )

    def test_invented_severity_is_caught_on_the_unscored_path(self):
        # The exact failure the escalation path exists to prevent.
        data = {"observation": {"baseline_mean_per_day": 11.21, "event_mean_per_day": 8.42}}
        assert unbacked_numerals("Severity is approximately 90.5%.", data) == {"90.5"}
