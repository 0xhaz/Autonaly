"""BACI -> DuckDB -> exposure matrices (architecture.md D13, techstacks.md §2).

Two artifacts come out of here, and everything downstream reads them:

  ddr   — per (importer, product, supplier): share of that importer's imports of
          that product coming from that supplier.  D13.1
  hhi   — per (importer, product): Herfindahl index of supplier concentration,
          plus the top supplier and their share.  D13.2

Both are pure SQL over the raw CSVs. DuckDB reads them in place — there is no
load step and no database to keep in sync (D25).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import duckdb

log = logging.getLogger(__name__)

# BACI CSV columns: t=year i=exporter j=importer k=HS6 v=value(k USD) q=qty(tonnes)
BACI_GLOB = "BACI_{revision}_Y{year}_V{version}.csv"


@dataclass(frozen=True)
class BuildConfig:
    raw_dir: Path
    revision: str = "HS22"
    version: str = "V202601"
    year: int = 2024
    min_value_kusd: float = 0.0
    """Optional noise floor. 0 keeps every row; the DQ gates assume no filtering."""

    @property
    def csv_path(self) -> Path:
        return self.raw_dir / BACI_GLOB.format(
            revision=self.revision, year=self.year, version=self.version.lstrip("V")
        )

    @property
    def country_codes_path(self) -> Path:
        return self.raw_dir / f"country_codes_{self.version}.csv"


def connect(threads: int | None = None) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    if threads:
        con.execute(f"SET threads={threads}")
    return con


def load_raw(con: duckdb.DuckDBPyConnection, cfg: BuildConfig) -> int:
    """Register the year's CSV as `raw`, typed and stripped of aggregate codes."""
    if not cfg.csv_path.exists():
        raise FileNotFoundError(
            f"BACI CSV not found: {cfg.csv_path}\n"
            f"Expected the extracted archive in {cfg.raw_dir}"
        )

    # Aggregates are dropped by the inner join in attach_iso3(), not here — one
    # place decides what counts as a country.
    con.execute(
        f"""
        CREATE OR REPLACE TABLE raw AS
        SELECT
            CAST(t AS INTEGER)        AS year,
            CAST(i AS INTEGER)        AS exporter_m49,
            CAST(j AS INTEGER)        AS importer_m49,
            LPAD(CAST(k AS VARCHAR), 6, '0') AS hs6,
            TRY_CAST(v AS DOUBLE)     AS value_kusd,
            TRY_CAST(q AS DOUBLE)     AS qty_tonnes
        FROM read_csv('{cfg.csv_path}', header=true, all_varchar=true)
        WHERE TRY_CAST(v AS DOUBLE) > {cfg.min_value_kusd}
          AND CAST(i AS INTEGER) <> CAST(j AS INTEGER)
        """
    )
    return con.execute("SELECT count(*) FROM raw").fetchone()[0]


def attach_iso3(con: duckdb.DuckDBPyConnection, cfg: BuildConfig) -> list[int]:
    """Join M49 -> ISO3 using BACI's own code table. Returns unresolved codes.

    The inner join is what removes aggregates: a code with no ISO3 simply has no
    row here, so its flows drop out.
    """
    from .countries import load_lookup

    resolved, unresolved = load_lookup(cfg.country_codes_path)

    con.execute("CREATE OR REPLACE TABLE iso3 (m49 INTEGER, iso3 VARCHAR)")
    con.executemany("INSERT INTO iso3 VALUES (?, ?)", list(resolved.items()))

    # Only report unresolved codes that actually carry flows this year.
    present = {
        row[0]
        for row in con.execute(
            "SELECT DISTINCT exporter_m49 FROM raw "
            "UNION SELECT DISTINCT importer_m49 FROM raw"
        ).fetchall()
    }
    unresolved = tuple(c for c in unresolved if c in present)

    con.execute(
        """
        CREATE OR REPLACE TABLE flows AS
        SELECT
            r.year,
            xe.iso3 AS exporter,
            xi.iso3 AS importer,
            r.hs6,
            SUM(r.value_kusd) AS value_kusd,
            SUM(r.qty_tonnes) AS qty_tonnes
        FROM raw r
        JOIN iso3 xe ON xe.m49 = r.exporter_m49
        JOIN iso3 xi ON xi.m49 = r.importer_m49
        WHERE xe.iso3 <> xi.iso3
        GROUP BY 1, 2, 3, 4
        """
    )
    return list(unresolved)


def build_ddr(con: duckdb.DuckDBPyConnection) -> int:
    """Direct dependency ratio (D13.1): share of importer's HS6 imports per supplier."""
    con.execute(
        """
        CREATE OR REPLACE TABLE ddr AS
        WITH totals AS (
            SELECT importer, hs6, SUM(value_kusd) AS total_kusd
            FROM flows GROUP BY 1, 2
        )
        SELECT
            f.importer,
            f.hs6,
            f.exporter               AS supplier,
            f.value_kusd,
            t.total_kusd,
            f.value_kusd / t.total_kusd AS ddr
        FROM flows f
        JOIN totals t USING (importer, hs6)
        WHERE t.total_kusd > 0
        """
    )
    return con.execute("SELECT count(*) FROM ddr").fetchone()[0]


def build_hhi(con: duckdb.DuckDBPyConnection) -> int:
    """Supplier-concentration HHI (D13.2), on 0-1 scale, plus the top supplier.

    Reported alongside the top supplier's share because HHI alone doesn't say
    *who* the dependency is on — and the briefing always needs to name them.
    """
    con.execute(
        """
        CREATE OR REPLACE TABLE hhi AS
        SELECT
            importer,
            hs6,
            SUM(ddr * ddr)         AS hhi,
            COUNT(*)               AS n_suppliers,
            ANY_VALUE(total_kusd)  AS total_kusd,  -- identical across the group
            ARG_MAX(supplier, ddr) AS top_supplier,
            MAX(ddr)               AS top_supplier_share
        FROM ddr
        GROUP BY 1, 2
        """
    )
    return con.execute("SELECT count(*) FROM hhi").fetchone()[0]


def build(cfg: BuildConfig, threads: int | None = None) -> dict[str, object]:
    """Run the full refinery. Returns a summary dict for logging and DQ gates."""
    con = connect(threads)
    rows = load_raw(con, cfg)
    log.info("loaded %s raw rows for %s", f"{rows:,}", cfg.year)

    unresolved = attach_iso3(con, cfg)
    if unresolved:
        log.warning("unresolved M49 codes (add to countries.MANUAL_M49): %s", unresolved)

    n_ddr = build_ddr(con)
    n_hhi = build_hhi(con)

    summary = {
        "year": cfg.year,
        "revision": cfg.revision,
        "version": cfg.version,
        "raw_rows": rows,
        "flow_rows": con.execute("SELECT count(*) FROM flows").fetchone()[0],
        "ddr_rows": n_ddr,
        "hhi_rows": n_hhi,
        "importers": con.execute("SELECT count(DISTINCT importer) FROM flows").fetchone()[0],
        "exporters": con.execute("SELECT count(DISTINCT exporter) FROM flows").fetchone()[0],
        "products": con.execute("SELECT count(DISTINCT hs6) FROM flows").fetchone()[0],
        "unresolved_m49": unresolved,
    }
    return {"con": con, "summary": summary}
