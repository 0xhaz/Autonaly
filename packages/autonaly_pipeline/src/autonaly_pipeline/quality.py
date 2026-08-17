"""Data-quality gates (techstacks.md §2). Every run, no exceptions.

The invariants are checked in SQL rather than by materialising millions of rows
into a dataframe — DuckDB does it in one pass. Pandera guards the *shape* of the
small artifacts we actually ship.

A failure here is a hard stop. Silently shipping a broken exposure matrix is the
one outcome that would discredit every number in the product (D14/D17).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import duckdb


@dataclass
class GateResult:
    name: str
    passed: bool
    detail: str


@dataclass
class QualityReport:
    results: list[GateResult] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return all(r.passed for r in self.results)

    def add(self, name: str, passed: bool, detail: str) -> None:
        self.results.append(GateResult(name, passed, detail))

    def render(self) -> str:
        width = max((len(r.name) for r in self.results), default=0)
        lines = [
            f"  {'PASS' if r.passed else 'FAIL'}  {r.name.ljust(width)}  {r.detail}"
            for r in self.results
        ]
        return "\n".join(lines)

    def raise_if_failed(self) -> None:
        if not self.passed:
            failed = [r.name for r in self.results if not r.passed]
            raise ValueError(f"data-quality gates failed: {', '.join(failed)}\n{self.render()}")


# Ratio closure tolerance. DDR is a share of a sum computed in the same pass, so
# only floating-point error should appear here.
RATIO_TOLERANCE = 1e-9


def run_gates(con: duckdb.DuckDBPyConnection, unresolved_m49: list[int]) -> QualityReport:
    report = QualityReport()

    # 1. Ratios close to 1 for every (importer, hs6) group.
    worst = con.execute(
        """
        SELECT COALESCE(MAX(ABS(s - 1)), 0)
        FROM (SELECT SUM(ddr) AS s FROM ddr GROUP BY importer, hs6)
        """
    ).fetchone()[0]
    report.add(
        "ddr sums to 1 per (importer, hs6)",
        worst <= RATIO_TOLERANCE,
        f"max deviation {worst:.3e} (tolerance {RATIO_TOLERANCE:.0e})",
    )

    # 2. No negative or null flows.
    bad = con.execute(
        "SELECT count(*) FROM flows WHERE value_kusd IS NULL OR value_kusd <= 0"
    ).fetchone()[0]
    report.add("no non-positive flow values", bad == 0, f"{bad:,} offending rows")

    # 3. Every country code resolved.
    report.add(
        "all M49 codes resolve to ISO3",
        not unresolved_m49,
        "clean" if not unresolved_m49 else f"unresolved: {unresolved_m49}",
    )

    # 4. HHI is a valid concentration index.
    out_of_range = con.execute(
        "SELECT count(*) FROM hhi WHERE hhi < 0 OR hhi > 1 + 1e-9"
    ).fetchone()[0]
    report.add("hhi within [0,1]", out_of_range == 0, f"{out_of_range:,} out of range")

    # 5. Single-supplier groups must have HHI of exactly 1 — catches a whole class
    #    of grouping bug that the aggregate checks above would not notice.
    inconsistent = con.execute(
        "SELECT count(*) FROM hhi WHERE n_suppliers = 1 AND ABS(hhi - 1) > 1e-9"
    ).fetchone()[0]
    report.add(
        "monopoly groups have hhi = 1", inconsistent == 0, f"{inconsistent:,} inconsistent"
    )

    # 6. Coverage sanity: BACI should carry ~200 reporters and thousands of products.
    importers, products = con.execute(
        "SELECT count(DISTINCT importer), count(DISTINCT hs6) FROM flows"
    ).fetchone()
    report.add(
        "coverage plausible",
        importers >= 150 and products >= 4000,
        f"{importers} importers, {products:,} products",
    )

    return report
