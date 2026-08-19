"""The MCP surface — the engine, agent-queryable (architecture D26.3).

Tools are thin pass-throughs; what the tests pin is that each tool reaches
the engine and returns the deterministic payload an agent needs, using an
in-process ASGI transport so no network engine is required.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[2]
DDR = REPO_ROOT / "artifacts/exposure/V202601/2024/ddr.parquet"

pytestmark = pytest.mark.skipif(not DDR.exists(), reason="artifacts absent")


@pytest.fixture(scope="module", autouse=True)
def wire_engine():
    from autonaly_engine.main import app
    from autonaly_mcp import server

    # TestClient subclasses httpx.Client, so the server's HTTP seam runs
    # in-process — no network engine needed to test the MCP surface.
    server.configure(TestClient(app))


class TestTools:
    def test_baskets(self):
        from autonaly_mcp.server import list_commodity_baskets

        keys = {b["key"] for b in json.loads(list_commodity_baskets())["baskets"]}
        assert {"wheat", "crude_oil", "semiconductors"} <= keys

    def test_country_exposure_carries_history(self):
        from autonaly_mcp.server import get_country_exposure

        profile = json.loads(get_country_exposure("egy"))
        assert profile["country"] == "EGY"
        assert any(e["key"] == "suez-1956" for e in profile["crisis_history"])

    def test_disruption_is_deterministic(self):
        from autonaly_mcp.server import simulate_disruption

        one = json.loads(simulate_disruption(["RUS", "UKR"], ["wheat"]))
        two = json.loads(simulate_disruption(["RUS", "UKR"], ["wheat"]))
        assert one["affected"] == two["affected"]
        assert one["affected"][0]["score"] > 0

    def test_chokepoint_closure(self):
        from autonaly_mcp.server import simulate_chokepoint_closure

        result = json.loads(simulate_chokepoint_closure("hormuz"))
        assert result["largest_absolute_exposure"] == "CHN"

    def test_conflict(self):
        from autonaly_mcp.server import simulate_conflict

        result = json.loads(simulate_conflict(["TWN"]))
        assert result["combined"][0]["country"] == "CHN"

    def test_invalid_input_returns_the_engines_explanation(self):
        from autonaly_mcp.server import simulate_chokepoint_closure

        result = json.loads(simulate_chokepoint_closure("atlantis"))
        assert "error" in result

    def test_analogues(self):
        from autonaly_mcp.server import find_historical_analogues

        rows = json.loads(find_historical_analogues(countries=["RUS", "UKR"], baskets=["wheat"]))
        assert rows["analogues"][0]["key"] == "russia-ukraine-war"


class TestSurface:
    def test_every_tool_is_registered(self):
        import asyncio

        from autonaly_mcp.server import mcp

        tools = {t.name for t in asyncio.run(mcp.list_tools())}
        assert {
            "list_commodity_baskets",
            "get_country_exposure",
            "get_chokepoint_status",
            "simulate_disruption",
            "simulate_chokepoint_closure",
            "simulate_conflict",
            "get_crisis_history",
            "find_historical_analogues",
        } <= tools
