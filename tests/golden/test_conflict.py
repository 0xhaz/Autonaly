"""Conflict composition over real artifacts — the Russia-Ukraine archetype.

The channels have different mechanics, and the tests pin exactly the
distinctions that make the composition honest rather than a blended blur.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[2]
DDR = REPO_ROOT / "artifacts/exposure/V202601/2024/ddr.parquet"

pytestmark = pytest.mark.skipif(not DDR.exists(), reason="artifacts absent")


@pytest.fixture(scope="module")
def client():
    from autonaly_engine.main import app

    return TestClient(app)


@pytest.fixture(scope="module")
def result(client):
    response = client.post(
        "/conflict",
        json={"conflict": "russia_ukraine", "intensity": 1.0, "duration_months": 6, "top_n": 20},
    )
    assert response.status_code == 200, response.text
    return response.json()


def channel(result, key):
    return next(c for c in result["channels"] if c["key"] == key)


class TestSanctionsAreLegalNotPhysical:
    """The defining property: only the coalition is cut off."""

    def test_non_coalition_buyers_are_absent(self, result):
        countries = {
            a["country"] for a in channel(result, "russia_sanctions")["rankings"]["affected"]
        }
        # China, India and Türkiye kept buying Russian energy. Their absence is
        # the model being right, not incomplete.
        assert not countries & {"CHN", "IND", "TUR"}

    def test_druzhba_dependents_top_the_intensity(self, result):
        top = [a["country"] for a in channel(result, "russia_sanctions")["rankings"]["affected"][:4]]
        # 2024 weights already embed the coalition's rewiring — what remains is
        # the exempted landlocked trio still on Russian pipelines.
        assert {"SVK", "HUN"} <= set(top)


class TestPhysicalCollapseHitsEveryone:
    def test_no_importer_filter(self, result):
        countries = {
            a["country"] for a in channel(result, "ukraine_collapse")["rankings"]["affected"]
        }
        # Buyers on multiple continents — physical disruption has no coalition.
        assert countries & {"LBN", "ESP"}
        assert "UKR" not in countries

    def test_blocked_products_name_the_grain(self, result):
        products = {p["basket"] for p in channel(result, "ukraine_collapse")["blocked_products"]}
        assert {"wheat", "maize", "barley"} <= products


class TestFertilizerSqueeze:
    def test_brazil_is_the_headline_victim(self, result):
        # The world's largest potash importer, fed by Russia and Belarus — but
        # diversified via Canada, so it leads on magnitude, not intensity. The
        # intensity/magnitude split applies inside conflict channels too.
        ch = channel(result, "fertilizer_squeeze")
        assert ch["rankings"]["largest_absolute_exposure"] == "BRA"


class TestCombined:
    def test_sums_across_channels(self, result):
        top = {r["country"] for r in result["combined"][:8]}
        # China (Ukrainian maize + fertilizer) and Brazil (fertilizer) lead on
        # composed dollars even though neither tops any single intensity list.
        assert {"CHN", "BRA"} <= top

    def test_multi_channel_countries_list_their_channels(self, result):
        svk = next(r for r in result["combined"] if r["country"] == "SVK")
        assert len(svk["channels"]) >= 2

    def test_omissions_are_stated(self, result):
        assert "gas" in result["omissions"].lower()


def _custom(client, countries, **overrides):
    body = {
        "conflict": "custom",
        "countries": countries,
        "intensity": 1.0,
        "duration_months": 6,
        "top_n": 20,
    }
    body.update(overrides)
    response = client.post("/conflict", json=body)
    assert response.status_code == 200, response.text
    return response.json()


class TestCustomConflict:
    """Channels derived from the data, for any country the user picks."""

    def test_eligible_countries_are_published(self, client):
        custom = client.get("/conflicts").json()["custom"]
        rows = {c["iso3"]: c for c in custom["countries"]}
        # Major commodity suppliers must be offerable; each with a real name.
        assert {"AUS", "BRA", "USA", "CHL", "TWN"} <= set(rows)
        assert rows["TWN"]["name"] == "Taiwan"
        assert rows["AUS"]["material_baskets"] >= 5

    def test_australia_derives_its_real_export_profile(self, client):
        result = _custom(client, ["AUS"])
        products = {
            p["basket"]: p["source_world_share"]
            for p in result["channels"][0]["blocked_products"]
        }
        # Iron ore is the headline — over half of world trade — with coal and
        # LNG behind it. This is derivation, not curation: nobody typed these in.
        assert products["iron_ore"] > 0.5
        assert {"coal", "lng"} <= set(products)
        combined = [r["country"] for r in result["combined"][:4]]
        assert combined[0] == "CHN"
        assert set(combined) & {"JPN", "KOR"}

    def test_taiwan_crisis_is_a_semiconductor_story(self, client):
        result = _custom(client, ["TWN"])
        baskets = [p["basket"] for p in result["channels"][0]["blocked_products"]]
        assert baskets[0] == "semiconductors"
        assert result["label"] == "Custom crisis: Taiwan"

    def test_immaterial_country_is_skipped_with_a_reason(self, client):
        result = _custom(client, ["AUS", "AND"])
        assert len(result["channels"]) == 1
        assert result["skipped"][0]["country"] == "AND"
        assert "1%" in result["skipped"][0]["reason"]

    def test_all_immaterial_is_a_422_not_an_empty_result(self, client):
        response = client.post(
            "/conflict",
            json={"conflict": "custom", "countries": ["AND"], "intensity": 1.0},
        )
        assert response.status_code == 422

    def test_custom_requires_countries(self, client):
        response = client.post(
            "/conflict", json={"conflict": "custom", "intensity": 1.0}
        )
        assert response.status_code == 422

    def test_sources_are_not_their_own_victims(self, client):
        result = _custom(client, ["AUS"])
        for row in result["combined"]:
            assert row["country"] != "AUS"

    def test_channels_hit_every_buyer(self, client):
        # A derived channel makes no coalition claim — reach must be global.
        result = _custom(client, ["BRA"])
        assert all(not c["coalition_only"] for c in result["channels"])


class TestTheOtherSide:
    """A crisis has two sides. Every ranking answers "who cannot buy"; the
    disrupted exporter also stops earning, and in a war that is usually the
    most affected party of all."""

    def test_ukraine_loses_its_own_export_revenue(self, result):
        impact = channel(result, "ukraine_collapse")["rankings"]["sources_impact"]
        assert impact, "the collapsing exporter must appear on the sell side"
        ukr = next(s for s in impact if s["country"] == "UKR")
        # Grain and iron ore are a large share of everything Ukraine sells.
        assert ukr["share_of_total_exports"] > 0.2
        assert ukr["export_revenue_at_risk_kusd"] > 5_000_000
        assert ukr["top_destinations"], "who was buying it is part of the answer"

    def test_revenue_at_risk_never_exceeds_what_is_sold(self, result):
        for ch in result["channels"]:
            for s in ch["rankings"]["sources_impact"]:
                assert s["export_revenue_at_risk_kusd"] <= s["basket_exports_kusd"] + 1

    def test_sanctions_channel_hits_the_sanctioned_exporter(self, result):
        impact = channel(result, "russia_sanctions")["rankings"]["sources_impact"]
        assert any(s["country"] == "RUS" for s in impact)
