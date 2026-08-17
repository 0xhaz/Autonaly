"""Chokepoint routing table tests.

The distinction these protect is the one most likely to produce an indefensible
number: a chokepoint with a bypass causes delay, one without causes cutoff.
"""

from __future__ import annotations

import pytest
from autonaly_core.baskets import BY_KEY as BASKET_KEYS
from autonaly_core.chokepoints import CHOKEPOINTS, REROUTE_ATTENUATION, Reroute, get


class TestTableIntegrity:
    def test_every_basket_reference_resolves(self):
        # A typo'd basket key would silently score nothing.
        for cp in CHOKEPOINTS:
            for key in cp.baskets:
                assert key in BASKET_KEYS, f"{cp.key} references unknown basket {key}"

    def test_source_countries_are_iso3(self):
        for cp in CHOKEPOINTS:
            assert all(len(c) == 3 and c.isupper() for c in cp.source_countries)

    def test_importer_filters_are_iso3(self):
        for cp in CHOKEPOINTS:
            if cp.importer_filter:
                assert all(len(c) == 3 and c.isupper() for c in cp.importer_filter)

    def test_unknown_key_raises(self):
        with pytest.raises(KeyError, match="unknown chokepoint"):
            get("bosphorus_typo")


class TestHormuzHasNoBypass:
    """Gulf seaborne exports have one exit — a closure is a supply cutoff."""

    def test_reroute_is_none(self):
        assert get("hormuz").reroute is Reroute.NONE

    def test_attenuation_is_unity(self):
        assert get("hormuz").attenuation() == 1.0

    def test_sources_are_the_gulf_exporters(self):
        assert {"SAU", "ARE", "QAT", "KWT", "IRQ", "IRN"} <= set(
            get("hormuz").source_countries
        )

    def test_exposure_is_global_not_regional(self):
        # Everyone buying Gulf energy is exposed, not just one basin.
        assert get("hormuz").importer_filter is None

    def test_baskets_are_energy(self):
        assert set(get("hormuz").baskets) <= {
            "crude_oil", "lng", "lpg", "refined_products"
        }


class TestSuezHasABypass:
    """The Cape of Good Hope exists, so a closure is a cost and delay shock."""

    def test_reroute_is_a_longer_route(self):
        assert get("suez").reroute is Reroute.LONGER_ROUTE

    def test_attenuation_is_partial(self):
        assert 0 < get("suez").attenuation() < 1

    def test_is_attenuated_relative_to_hormuz(self):
        # The single most important property in this module: an equal transit
        # collapse must not score equally at both chokepoints.
        assert get("suez").attenuation() < get("hormuz").attenuation()

    def test_exposure_is_restricted_to_the_route_it_serves(self):
        # Asia->US crosses the Pacific and must not be counted here.
        europe_med = get("suez").importer_filter
        assert europe_med is not None
        assert {"DEU", "NLD", "ITA", "EGY", "TUR"} <= set(europe_med)
        assert "USA" not in europe_med
        assert "MEX" not in europe_med

    def test_asian_and_gulf_origins_both_transit(self):
        sources = set(get("suez").source_countries)
        assert {"CHN", "IND", "VNM"} <= sources
        assert {"SAU", "ARE"} <= sources


class TestAttenuationTable:
    def test_covers_every_reroute_value(self):
        assert set(REROUTE_ATTENUATION) == set(Reroute)

    def test_all_values_are_fractions(self):
        assert all(0 < v <= 1 for v in REROUTE_ATTENUATION.values())
