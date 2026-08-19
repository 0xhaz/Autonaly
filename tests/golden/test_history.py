"""The curated century of supply crises — reference data with invariants.

The dataset is qualitative by design; what the tests pin is its integrity
(every reference resolves) and the analogue ranking that feeds briefs.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from autonaly_core.baskets import BY_KEY as BASKETS
from autonaly_core.chokepoints import BY_KEY as CHOKEPOINTS
from autonaly_core.history import CATEGORIES, EVENTS, analogues, for_country


class TestDatasetIntegrity:
    def test_every_basket_reference_resolves(self):
        assert not {b for e in EVENTS for b in e.baskets} - set(BASKETS)

    def test_every_chokepoint_reference_resolves(self):
        assert not {c for e in EVENTS for c in e.chokepoints} - set(CHOKEPOINTS)

    def test_every_category_is_declared(self):
        assert not {e.category for e in EVENTS} - set(CATEGORIES)

    def test_keys_are_unique(self):
        assert len(EVENTS) == len({e.key for e in EVENTS})

    def test_years_are_coherent_and_within_the_century(self):
        for e in EVENTS:
            assert 1914 <= e.year_start <= 2026, e.key
            if e.year_end is not None:
                assert e.year_end >= e.year_start, e.key

    def test_iso3_codes_are_plausible(self):
        for e in EVENTS:
            assert e.countries, e.key
            assert all(len(c) == 3 and c.isupper() for c in e.countries), e.key

    def test_every_event_teaches_something(self):
        # The rhyme is the point of the dataset; an event without one is a
        # trivia entry, not a reference.
        for e in EVENTS:
            assert len(e.rhyme) > 30, e.key
            assert len(e.summary) > 50, e.key


class TestLookups:
    def test_taiwan_has_its_strait_crises(self):
        keys = {e.key for e in for_country("TWN")}
        assert {"taiwan-1958", "taiwan-1996", "pelosi-exercises"} <= keys

    def test_egypt_has_every_suez_closure(self):
        keys = {e.key for e in for_country("EGY")}
        assert {"suez-1956", "suez-1967", "ever-given", "red-sea-crisis"} <= keys

    def test_country_history_is_chronological(self):
        years = [e.year_start for e in for_country("RUS")]
        assert years == sorted(years)


class TestAnalogues:
    def test_taiwan_blockade_finds_the_strait_crises(self):
        keys = [
            e.key
            for e in analogues(
                countries=("TWN", "CHN"),
                baskets=("semiconductors",),
                chokepoints=("taiwan_strait",),
            )
        ]
        assert keys[0] in {"pelosi-exercises", "taiwan-1996"}
        assert "taiwan-1958" in keys

    def test_russia_ukraine_finds_the_grain_and_sanctions_record(self):
        keys = {
            e.key
            for e in analogues(
                countries=("RUS", "UKR", "BLR"),
                baskets=("wheat", "crude_oil", "potash"),
            )
        }
        assert "russia-ukraine-war" in keys
        assert keys & {"crimea", "black-sea-grain-deal", "russia-wheat-ban", "ussr-collapse"}

    def test_recency_breaks_ties(self):
        # Two pure-chokepoint Suez matches: the recent one must outrank 1956.
        rows = analogues(chokepoints=("suez",), limit=10)
        keys = [e.key for e in rows]
        assert keys.index("red-sea-crisis") < keys.index("suez-1956")

    def test_no_match_is_empty_not_noise(self):
        assert analogues(countries=("AND",)) == []


class TestEngineEndpoints:
    @pytest.fixture(scope="class")
    def client(self):
        from autonaly_engine.main import app

        return TestClient(app)

    def test_country_history_route(self, client):
        events = client.get("/history/TWN").json()["events"]
        assert any(e["key"] == "taiwan-1996" for e in events)

    def test_analogues_route(self, client):
        rows = client.get(
            "/history-analogues",
            params={"countries": "rus,ukr", "baskets": "wheat", "chokepoints": "bosporus"},
        ).json()["analogues"]
        assert rows and rows[0]["key"] == "russia-ukraine-war"
