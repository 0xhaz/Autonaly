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
def result():
    from autonaly_engine.main import app

    client = TestClient(app)
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
