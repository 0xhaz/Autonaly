"""Engine contract tests over the real artifacts, driven through HTTP.

P1 validated the maths in SQL; this validates it through the surface the agent
will actually call. Both flaws found on first run are pinned here so they cannot
return:

  1. Ranking on ratio alone put Armenia ($60m of wheat) top and dropped Egypt
     ($5.2bn) off the page entirely.
  2. Germany appeared as both a top-5 casualty and a winner of the same
     rare-earth restriction.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[2]
DDR = REPO_ROOT / "artifacts/exposure/V202601/2024/ddr.parquet"

pytestmark = pytest.mark.skipif(
    not DDR.exists(), reason="exposure artifacts not built — run `make pipeline`"
)


@pytest.fixture(scope="module")
def client():
    from autonaly_engine.main import app

    return TestClient(app)


def _post(client, **overrides):
    body = {
        "event_key": "test",
        "sources": ["RUS", "UKR"],
        "baskets": ["wheat"],
        "severity": {"label": "severe", "transit_reduction": 1.0, "duration_months": 6},
        "top_n": 20,
    }
    body.update(overrides)
    response = client.post("/exposure", json=body)
    assert response.status_code == 200, response.text
    return response.json()


class TestServiceBasics:
    def test_health(self, client):
        assert client.get("/health").json()["status"] == "ok"

    def test_baskets_are_discoverable(self, client):
        keys = {b["key"] for b in client.get("/baskets").json()["baskets"]}
        assert {"wheat", "crude_oil", "rare_earth_magnets"} <= keys

    def test_unknown_basket_is_rejected(self, client):
        response = client.post(
            "/exposure",
            json={"event_key": "x", "sources": ["RUS"], "baskets": ["unobtainium"]},
        )
        assert response.status_code == 422
        assert "unobtainium" in response.text


class TestMaterialityFloor:
    """Flaw 1: intensity ranking without a floor is topped by rounding errors."""

    def test_egypt_is_present_in_the_ranking(self, client):
        countries = [a["country"] for a in _post(client)["affected"]]
        assert "EGY" in countries

    def test_egypt_carries_the_largest_absolute_exposure(self, client):
        assert _post(client)["largest_absolute_exposure"] == "EGY"

    def test_micro_importers_are_excluded(self, client):
        # Armenia imports ~$60m of wheat at ~100% Black Sea dependency. True, and
        # not a global-supply story (D9).
        countries = [a["country"] for a in _post(client)["affected"]]
        assert "ARM" not in countries

    def test_every_ranked_country_clears_the_floor(self, client):
        for a in _post(client)["affected"]:
            assert a["value_at_risk_kusd"] > 0

    def test_lowering_the_floor_readmits_micro_importers(self, client):
        # The floor is a policy, not an accident of the data.
        countries = [
            a["country"] for a in _post(client, min_import_kusd=1_000)["affected"]
        ]
        assert "ARM" in countries


class TestTraceability:
    """D14: every figure visible, so a briefing can never assert an unbacked number."""

    def test_ratios_accompany_every_score(self, client):
        for a in _post(client)["affected"]:
            assert a["ddr"] is not None and a["hhi"] is not None
            assert a["score"] is not None and a["value_at_risk_kusd"] is not None

    def test_evidence_is_attached(self, client):
        assert all(a["evidence"] for a in _post(client)["affected"])

    def test_methodology_version_is_stamped(self, client):
        assert _post(client)["methodology_version"]


class TestWinners:
    """Flaw 2: a country whose own supply is cut off is not a substitute."""

    def test_winners_exclude_the_disrupted_sources(self, client):
        result = _post(client)
        assert not ({w["country"] for w in result["winners"]} & {"RUS", "UKR"})

    def test_winners_exclude_heavily_dependent_countries(self, client):
        result = _post(
            client, sources=["CHN"], baskets=["rare_earth_magnets"], top_n=5
        )
        affected = {a["country"] for a in result["affected"]}
        winners = {w["country"] for w in result["winners"]}
        assert not (affected & winners)

    def test_wheat_winners_are_the_real_alternative_exporters(self, client):
        winners = {w["country"] for w in _post(client)["winners"]}
        assert {"CAN", "USA", "AUS"} & winners


class TestSeverityLadder:
    """D15: escalation rungs must move the numbers in the right direction."""

    def test_partial_disruption_scores_below_full(self, client):
        full = _post(client)["affected"][0]["score"]
        partial = _post(
            client,
            severity={"label": "partial", "transit_reduction": 0.3, "duration_months": 6},
        )["affected"][0]["score"]
        assert partial < full

    def test_ranking_order_is_stable_across_severity(self, client):
        # Severity scales everything; it must not reshuffle who is most exposed.
        full = [a["country"] for a in _post(client)["affected"][:5]]
        partial = [
            a["country"]
            for a in _post(
                client,
                severity={
                    "label": "partial",
                    "transit_reduction": 0.4,
                    "duration_months": 6,
                },
            )["affected"][:5]
        ]
        assert full == partial


class TestHormuz:
    """The live-watchlist scenario (hackathon.md §3)."""

    HORMUZ = {
        "sources": ["SAU", "ARE", "IRQ", "KWT", "QAT", "IRN"],
        "baskets": ["crude_oil", "lng"],
        "severity": {"label": "closure", "transit_reduction": 1.0, "duration_months": 2},
    }

    def test_china_is_the_largest_absolute_hormuz_exposure(self, client):
        # China buys more Gulf crude than anyone. It ranks low on *intensity*
        # because it is well diversified — which is exactly why magnitude has to
        # be reported separately.
        assert _post(client, **self.HORMUZ)["largest_absolute_exposure"] == "CHN"

    def test_largest_absolute_exposure_is_independent_of_page_size(self, client):
        # It is a fact about the scenario, not about how many rows were asked for.
        small = _post(client, top_n=5, **self.HORMUZ)["largest_absolute_exposure"]
        large = _post(client, top_n=50, **self.HORMUZ)["largest_absolute_exposure"]
        assert small == large == "CHN"

    def test_asian_importers_dominate_the_intensity_ranking(self, client):
        top = {a["country"] for a in _post(client, **self.HORMUZ)["affected"][:10]}
        assert len(top & {"JPN", "KOR", "IND", "PAK", "LKA", "PHL", "THA"}) >= 3
