"""Chokepoint route over real artifacts and real PortWatch observations.

This is the path the demo takes: a signal names a chokepoint, PortWatch supplies
the observed transit collapse, the routing table supplies the geography, and the
engine computes. Nothing here is assumed severity.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[2]
DDR = REPO_ROOT / "artifacts/exposure/V202601/2024/ddr.parquet"
SUEZ_FIXTURE = REPO_ROOT / "tests/fixtures/portwatch/suez_2021_ever_given.json"

pytestmark = pytest.mark.skipif(
    not (DDR.exists() and SUEZ_FIXTURE.exists()),
    reason="artifacts or portwatch fixtures absent",
)


@pytest.fixture(scope="module")
def client():
    from autonaly_engine.main import app

    return TestClient(app)


@pytest.fixture(scope="module")
def observed_suez_reduction():
    from autonaly_ingest.portwatch import load_snapshot

    return load_snapshot(SUEZ_FIXTURE).transit_reduction


def _chokepoint(client, **overrides):
    body = {
        "event_key": "test",
        "chokepoint": "suez",
        "transit_reduction": 0.71,
        "duration_months": 1,
        "top_n": 20,
    }
    body.update(overrides)
    response = client.post("/chokepoint", json=body)
    assert response.status_code == 200, response.text
    return response.json()


class TestDiscovery:
    def test_chokepoints_are_discoverable(self, client):
        keys = {c["key"] for c in client.get("/chokepoints").json()["chokepoints"]}
        assert {"suez", "hormuz"} <= keys

    def test_reroute_status_is_published(self, client):
        rows = {c["key"]: c for c in client.get("/chokepoints").json()["chokepoints"]}
        assert rows["hormuz"]["reroute"] == "none"
        assert rows["suez"]["reroute"] == "longer_route"
        assert rows["hormuz"]["attenuation"] > rows["suez"]["attenuation"]

    def test_unknown_chokepoint_is_rejected(self, client):
        response = client.post(
            "/chokepoint",
            json={"event_key": "x", "chokepoint": "atlantis", "transit_reduction": 0.5},
        )
        assert response.status_code == 422


class TestBypassChangesEverything:
    """The single most important property: a route you can sail around scores less."""

    def test_hormuz_outscores_suez_at_identical_transit_collapse(self, client):
        suez = _chokepoint(client, chokepoint="suez")["affected"][0]["score"]
        hormuz = _chokepoint(client, chokepoint="hormuz")["affected"][0]["score"]
        assert hormuz > suez * 3

    def test_suez_2021_is_a_delay_not_a_supply_shock(self, client, observed_suez_reduction):
        # A defensible, data-grounded claim: the Ever Given caused costly delay,
        # not shortage. Low scores here are the correct answer, not a bug.
        result = _chokepoint(client, transit_reduction=observed_suez_reduction)
        assert result["affected"][0]["score"] < 10

    def test_dependency_ratios_stay_substantial_even_when_scores_are_low(
        self, client, observed_suez_reduction
    ):
        # The exposure is real; the attenuated severity is what keeps the score
        # low. A briefing must be able to show both.
        result = _chokepoint(client, transit_reduction=observed_suez_reduction)
        assert result["affected"][0]["ddr"] > 0.3


class TestSuezGeography:
    """Only the importer side the canal serves may be scored."""

    def test_ranking_is_european_and_mediterranean(self, client):
        countries = {a["country"] for a in _chokepoint(client)["affected"]}
        assert countries & {"EGY", "GRC", "ITA", "POL", "FRA", "NLD"}

    def test_pacific_routed_importers_are_excluded(self, client):
        # US and Mexican imports from Asia cross the Pacific.
        countries = {a["country"] for a in _chokepoint(client, top_n=200)["affected"]}
        assert "USA" not in countries
        assert "MEX" not in countries


class TestHormuzGeography:
    """No bypass and no regional filter — Gulf energy reaches everyone."""

    def test_exposure_reaches_beyond_the_suez_catchment(self, client):
        from autonaly_core.chokepoints import get

        countries = {
            a["country"] for a in _chokepoint(client, chokepoint="hormuz", top_n=40)["affected"]
        }
        assert countries & {"JPN", "KOR", "IND", "PAK"}
        # The decisive check: Hormuz is unfiltered, so it must rank importers that
        # the Europe/Mediterranean-only Suez route could never surface.
        assert countries - set(get("suez").importer_filter or ())

    def test_china_carries_the_largest_absolute_exposure(self, client):
        result = _chokepoint(
            client, chokepoint="hormuz", transit_reduction=1.0, duration_months=6
        )
        assert result["largest_absolute_exposure"] == "CHN"

    def test_asian_energy_importers_dominate(self, client):
        result = _chokepoint(
            client, chokepoint="hormuz", transit_reduction=1.0, duration_months=6, top_n=10
        )
        top = {a["country"] for a in result["affected"]}
        assert len(top & {"JPN", "KOR", "IND", "PAK", "THA"}) >= 3


class TestSourcesAreNotTheirOwnVictims:
    """Found in a user's simulator run: Qatar ranked as a casualty of the Hormuz
    closure it sits behind. Its 'exposure' was imports from Saudi Arabia and the
    UAE — intra-Gulf trade that never transits the strait."""

    def test_no_gulf_state_in_the_hormuz_ranking(self, client):
        result = _chokepoint(
            client, chokepoint="hormuz", transit_reduction=1.0, duration_months=6, top_n=200
        )
        countries = {a["country"] for a in result["affected"]}
        assert not countries & {"QAT", "SAU", "ARE", "IRQ", "KWT", "IRN", "BHR"}

    def test_no_source_in_the_suez_ranking(self, client):
        result = _chokepoint(client, top_n=200)
        countries = {a["country"] for a in result["affected"]}
        # Egypt is a Suez *destination*, not a source — it must stay.
        assert "EGY" in countries
        assert not countries & {"CHN", "IND", "SAU", "ARE"}


class TestRelativeMaterialityFloor:
    """A flat floor cannot serve baskets spanning three orders of magnitude."""

    def test_micro_importers_drop_out_of_a_large_basket(self, client):
        # Seychelles imports ~$0.3bn of Gulf energy at 98% dependency. True, and
        # not a global-supply story against a $1.5tn market.
        result = _chokepoint(
            client, chokepoint="hormuz", transit_reduction=1.0, duration_months=6, top_n=50
        )
        assert "SYC" not in {a["country"] for a in result["affected"]}

    def test_small_basket_keeps_its_meaningful_importers(self, client):
        # The same floor must not empty out rare earths, where $0.2bn is a major
        # position.
        response = client.post(
            "/exposure",
            json={
                "event_key": "re",
                "sources": ["CHN"],
                "baskets": ["rare_earth_magnets"],
                "severity": {
                    "label": "s",
                    "transit_reduction": 0.8,
                    "duration_months": 6,
                },
                "top_n": 5,
            },
        )
        countries = {a["country"] for a in response.json()["affected"]}
        assert len(countries) >= 4
        assert countries & {"DEU", "KOR", "VNM", "IND"}
