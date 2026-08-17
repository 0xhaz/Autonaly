"""Country reconciliation — the quiet source of wrong rankings.

A mismapped code doesn't crash anything; it just removes a country from an
exposure ranking, which is exactly the kind of error a judge would catch and we
wouldn't. These tests run against a fixture table, not the 287MB download, so
they stay fast and CI-safe.
"""

from __future__ import annotations

import textwrap

import pytest
from autonaly_pipeline.countries import DROP, OVERRIDES, load_lookup

FIXTURE = textwrap.dedent(
    """\
    country_code,country_name,country_iso2,country_iso3
    4,Afghanistan,AF,AFG
    156,China,CN,CHN
    392,Japan,JP,JPN
    528,Netherlands,NL,NLD
    818,Egypt,EG,EGY
    840,USA,US,USA
    490,"Other Asia, nes",,S19
    697,"Europe EFTA, nes",,R20
    711,"Southern African Customs Union (...1999)",,ZA1
    999,Newly invented place,,
    """
)


@pytest.fixture
def codes_csv(tmp_path):
    path = tmp_path / "country_codes_V202601.csv"
    path.write_text(FIXTURE, encoding="utf-8")
    return path


class TestOrdinaryCodes:
    def test_common_countries_resolve(self, codes_csv):
        resolved, _ = load_lookup(codes_csv)
        assert resolved[156] == "CHN"
        assert resolved[840] == "USA"
        assert resolved[818] == "EGY"  # Suez host — load-bearing for the demo

    def test_japan_and_netherlands_resolve(self, codes_csv):
        # The 1973 golden case ranks these top (D17).
        resolved, _ = load_lookup(codes_csv)
        assert resolved[392] == "JPN"
        assert resolved[528] == "NLD"


class TestTaiwan:
    def test_other_asia_nes_maps_to_taiwan(self, codes_csv):
        # $526bn of 2024 exports. Unmapped, Taiwan — and semiconductors with it —
        # disappears from every ranking (architecture.md D19).
        resolved, _ = load_lookup(codes_csv)
        assert resolved[490] == "TWN"

    def test_taiwan_is_not_left_unresolved(self, codes_csv):
        _, unresolved = load_lookup(codes_csv)
        assert 490 not in unresolved


class TestAggregates:
    def test_empty_aggregates_are_dropped_silently(self, codes_csv):
        resolved, unresolved = load_lookup(codes_csv)
        for code in DROP:
            assert code not in resolved
            # Intentional drops must not be reported as data problems, or we
            # learn to ignore the warning that matters.
            assert code not in unresolved

    def test_baci_placeholder_iso3_is_never_accepted(self, codes_csv):
        resolved, _ = load_lookup(codes_csv)
        assert "S19" not in resolved.values()
        assert "R20" not in resolved.values()
        assert "ZA1" not in resolved.values()


class TestUnknownCodes:
    def test_new_unmappable_code_is_surfaced(self, codes_csv):
        # A future BACI release adding a code must fail loudly, not vanish.
        _, unresolved = load_lookup(codes_csv)
        assert 999 in unresolved


class TestOverrideTable:
    def test_overrides_are_documented_and_minimal(self):
        # If this grows, each addition needs a justification in the module docstring.
        assert OVERRIDES == {490: "TWN"}
