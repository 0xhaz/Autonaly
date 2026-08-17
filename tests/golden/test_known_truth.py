"""Golden-case regression (architecture.md D17).

Known history encoded as assertions. CI fails if a data refresh or a formula
change breaks something we already know to be true. These are the tests that
make the numbers defensible to a judge — and the ones that catch a silent
methodology regression later.

Skipped when artifacts are absent so the suite still runs on a clean clone
without the 287MB BACI download. Run `make data && make pipeline` first.
"""

from __future__ import annotations

from pathlib import Path

import duckdb
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
VERSION, YEAR = "V202601", 2024
DDR = REPO_ROOT / f"artifacts/exposure/{VERSION}/{YEAR}/ddr.parquet"
FLOWS = REPO_ROOT / f"artifacts/baci/{VERSION}/{YEAR}/flows.parquet"
HHI = REPO_ROOT / f"artifacts/exposure/{VERSION}/{YEAR}/hhi.parquet"

pytestmark = pytest.mark.skipif(
    not DDR.exists(), reason="exposure artifacts not built — run `make pipeline`"
)

WHEAT = "hs6 LIKE '1001%'"
BLACK_SEA_CORE = ("RUS", "UKR")
BLACK_SEA_PORTS = ("RUS", "UKR", "ROU", "BGR")


@pytest.fixture(scope="module")
def con():
    return duckdb.connect()


def _dependency(con, importer: str, suppliers: tuple[str, ...], where: str) -> float:
    """Share of `importer`'s imports (in the `where` basket) coming from `suppliers`."""
    supplier_list = ",".join(f"'{s}'" for s in suppliers)
    return con.execute(
        f"""
        SELECT COALESCE(SUM(CASE WHEN supplier IN ({supplier_list}) THEN value_kusd END), 0)
               / SUM(value_kusd)
        FROM '{DDR}' WHERE importer = '{importer}' AND {where}
        """
    ).fetchone()[0]


class TestBlackSeaWheat:
    """D17: 'Black Sea wheat -> Egypt >80'.

    Egypt is 77% dependent on Russia+Ukraine alone, and 91% once Romania and
    Bulgaria — the other two Black Sea grain ports — are included. Both
    definitions are asserted so a future basket change cannot quietly move the
    number without a test noticing.
    """

    def test_egypt_depends_on_russia_and_ukraine(self, con):
        assert _dependency(con, "EGY", BLACK_SEA_CORE, WHEAT) > 0.70

    def test_egypt_exceeds_80pct_on_full_black_sea_basket(self, con):
        assert _dependency(con, "EGY", BLACK_SEA_PORTS, WHEAT) > 0.80

    def test_egypt_is_the_largest_absolute_black_sea_wheat_exposure(self, con):
        # Ranking by ratio alone promotes tiny importers; the briefing has to
        # lead with the country that actually matters at scale.
        top = con.execute(
            f"""
            WITH basket AS (
                SELECT importer, supplier, SUM(value_kusd) v
                FROM '{DDR}' WHERE {WHEAT} GROUP BY 1, 2
            )
            SELECT importer FROM basket
            WHERE supplier IN {BLACK_SEA_CORE}
            GROUP BY importer ORDER BY SUM(v) DESC LIMIT 1
            """
        ).fetchone()[0]
        assert top == "EGY"

    def test_known_crisis_countries_rank_highly(self, con):
        # The countries the 2022 grain crisis actually hit.
        for country in ("EGY", "TUR", "PAK", "KEN"):
            assert _dependency(con, country, BLACK_SEA_CORE, WHEAT) > 0.60


class TestRareEarths:
    """architecture.md §9 item 8 — China rare-earth export restrictions.

    The dominance is in processed magnets, not raw metal: China is ~62% of
    HS850511 but only ~21% of HS280530. Asserting both directions stops anyone
    'fixing' the scenario by swapping to the wrong HS code.
    """

    def test_china_dominates_permanent_magnets(self, con):
        share = con.execute(
            f"""
            SELECT SUM(CASE WHEN exporter = 'CHN' THEN value_kusd END) / SUM(value_kusd)
            FROM '{FLOWS}' WHERE hs6 = '850511'
            """
        ).fetchone()[0]
        assert share > 0.55

    def test_raw_rare_earth_metal_understates_chinese_control(self, con):
        share = con.execute(
            f"""
            SELECT SUM(CASE WHEN exporter = 'CHN' THEN value_kusd END) / SUM(value_kusd)
            FROM '{FLOWS}' WHERE hs6 = '280530'
            """
        ).fetchone()[0]
        assert share < 0.40


class TestTaiwanIsPresent:
    """The 490 -> TWN mapping is load-bearing; silence here means it broke."""

    def test_taiwan_appears_as_a_supplier(self, con):
        total = con.execute(
            f"SELECT SUM(value_kusd) FROM '{FLOWS}' WHERE exporter = 'TWN'"
        ).fetchone()[0]
        assert total and total > 3e8  # >$300bn in thousand-USD units

    def test_taiwan_is_a_top_processor_exporter(self, con):
        rank = con.execute(
            f"""
            SELECT list_position(
                list(exporter ORDER BY total DESC), 'TWN')
            FROM (
                SELECT exporter, SUM(value_kusd) total
                FROM '{FLOWS}' WHERE hs6 = '854231' GROUP BY 1
            )
            """
        ).fetchone()[0]
        assert rank is not None and rank <= 3


class TestMethodologyInvariants:
    """Formula properties that must hold regardless of vintage."""

    def test_ddr_never_exceeds_one(self, con):
        worst = con.execute(f"SELECT MAX(ddr) FROM '{DDR}'").fetchone()[0]
        assert worst <= 1 + 1e-9

    def test_hhi_of_a_diversified_importer_is_low(self, con):
        # Germany's machinery imports are genuinely diversified; an HHI near 1
        # would mean the grouping collapsed.
        hhi = con.execute(
            f"SELECT hhi FROM '{HHI}' WHERE importer = 'DEU' AND hs6 = '847989'"
        ).fetchone()
        assert hhi is not None and hhi[0] < 0.35
