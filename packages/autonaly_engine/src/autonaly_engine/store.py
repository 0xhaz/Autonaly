"""Artifact-backed queries for the engine.

DuckDB reads the Parquet artifacts directly. Locally that is a filesystem path;
after cutover the same query runs against `gs://` via DuckDB's httpfs, so the
engine has no local/cloud branch of its own beyond resolving the base URI.
"""

from __future__ import annotations

import functools
from dataclasses import dataclass

import duckdb
from autonaly_core import Settings, get_settings


@dataclass(frozen=True)
class ArtifactPaths:
    ddr: str
    hhi: str
    flows: str

    @staticmethod
    def build(settings: Settings, version: str, year: int) -> ArtifactPaths:
        base = (
            str(settings.artifact_root)
            if settings.is_local
            else f"gs://{settings.artifact_bucket}"
        )
        return ArtifactPaths(
            ddr=f"{base}/exposure/{version}/{year}/ddr.parquet",
            hhi=f"{base}/exposure/{version}/{year}/hhi.parquet",
            flows=f"{base}/baci/{version}/{year}/flows.parquet",
        )


@functools.lru_cache(maxsize=1)
def connect(version: str, year: int) -> tuple[duckdb.DuckDBPyConnection, ArtifactPaths]:
    """One connection per process. Cloud Run instances are single-tenant."""
    settings = get_settings()
    con = duckdb.connect()
    if not settings.is_local:
        con.execute("INSTALL httpfs; LOAD httpfs;")
    return con, ArtifactPaths.build(settings, version, year)


def dependency_rows(
    con: duckdb.DuckDBPyConnection,
    paths: ArtifactPaths,
    codes: tuple[str, ...],
    sources: tuple[str, ...],
    min_import_kusd: float,
    importers: tuple[str, ...] | None = None,
) -> list[tuple]:
    """Per importer: share of basket imports from the disrupted sources, plus HHI.

    HHI is recomputed at basket level rather than read from the per-HS6 artifact,
    because concentration in "wheat" is not the average of concentration in four
    separate wheat codes.
    """
    code_list = ",".join(f"'{c}'" for c in codes)
    source_list = ",".join(f"'{s}'" for s in sources)

    # Restrict to the importer side a route actually serves. Without this, a Suez
    # disruption would score US imports from Asia, which cross the Pacific and
    # never approach the canal.
    importer_clause = (
        "AND importer IN (" + ",".join(f"'{i}'" for i in importers) + ")"
        if importers
        else ""
    )

    return con.execute(
        f"""
        WITH basket AS (
            SELECT importer, supplier, SUM(value_kusd) AS v
            FROM '{paths.ddr}'
            WHERE hs6 IN ({code_list})
            {importer_clause}
            GROUP BY 1, 2
        ),
        totals AS (
            SELECT importer, SUM(v) AS total FROM basket GROUP BY 1
        ),
        shares AS (
            SELECT b.importer, b.supplier, b.v, t.total, b.v / t.total AS share
            FROM basket b JOIN totals t USING (importer)
            WHERE t.total >= {min_import_kusd}
        )
        SELECT
            importer,
            SUM(CASE WHEN supplier IN ({source_list}) THEN share ELSE 0 END) AS ddr,
            SUM(share * share)                                              AS hhi,
            ANY_VALUE(total)                                                AS total_kusd,
            COUNT(*)                                                        AS n_suppliers
        FROM shares
        GROUP BY importer
        HAVING ddr > 0
        ORDER BY ddr DESC
        """
    ).fetchall()


def world_basket_total(
    con: duckdb.DuckDBPyConnection, paths: ArtifactPaths, codes: tuple[str, ...]
) -> float:
    """Total world trade in the basket, for scaling the materiality floor."""
    code_list = ",".join(f"'{c}'" for c in codes)
    total = con.execute(
        f"SELECT SUM(value_kusd) FROM '{paths.flows}' WHERE hs6 IN ({code_list})"
    ).fetchone()[0]
    return float(total or 0.0)


def supplier_shares(
    con: duckdb.DuckDBPyConnection, paths: ArtifactPaths, codes: tuple[str, ...]
) -> dict[str, float]:
    """Each exporter's share of world exports in the basket — substitution capacity."""
    code_list = ",".join(f"'{c}'" for c in codes)
    rows = con.execute(
        f"""
        SELECT exporter, SUM(value_kusd) / SUM(SUM(value_kusd)) OVER () AS share
        FROM '{paths.flows}'
        WHERE hs6 IN ({code_list})
        GROUP BY exporter
        ORDER BY share DESC
        """
    ).fetchall()
    return {exporter: share for exporter, share in rows}


def country_import_sources(
    con: duckdb.DuckDBPyConnection,
    paths: ArtifactPaths,
    codes: tuple[str, ...],
    importer: str,
    limit: int,
) -> list[tuple]:
    """Where a country buys the basket from, largest share first."""
    code_list = ",".join(f"'{c}'" for c in codes)
    return con.execute(
        f"""
        WITH basket AS (
            SELECT supplier, SUM(value_kusd) AS v
            FROM '{paths.ddr}'
            WHERE hs6 IN ({code_list}) AND importer = '{importer}'
            GROUP BY 1
        )
        SELECT supplier, v, v / SUM(v) OVER () AS share
        FROM basket ORDER BY v DESC LIMIT {limit}
        """
    ).fetchall()


def country_export_destinations(
    con: duckdb.DuckDBPyConnection,
    paths: ArtifactPaths,
    codes: tuple[str, ...],
    exporter: str,
    limit: int,
) -> list[tuple]:
    """Where a country sells the basket, largest share first.

    The other half of the dependency picture: a country can be exposed as a buyer
    and simultaneously matter to the world as a seller.
    """
    code_list = ",".join(f"'{c}'" for c in codes)
    return con.execute(
        f"""
        WITH basket AS (
            SELECT importer AS destination, SUM(value_kusd) AS v
            FROM '{paths.flows}'
            WHERE hs6 IN ({code_list}) AND exporter = '{exporter}'
            GROUP BY 1
        )
        SELECT destination, v, v / SUM(v) OVER () AS share
        FROM basket ORDER BY v DESC LIMIT {limit}
        """
    ).fetchall()


def country_totals(
    con: duckdb.DuckDBPyConnection,
    paths: ArtifactPaths,
    codes: tuple[str, ...],
    country: str,
) -> tuple[float, float, float]:
    """(imports, exports, world export share) for the basket, in kUSD."""
    code_list = ",".join(f"'{c}'" for c in codes)
    row = con.execute(
        f"""
        SELECT
            COALESCE(SUM(CASE WHEN importer = '{country}' THEN value_kusd END), 0),
            COALESCE(SUM(CASE WHEN exporter = '{country}' THEN value_kusd END), 0),
            COALESCE(SUM(value_kusd), 0)
        FROM '{paths.flows}' WHERE hs6 IN ({code_list})
        """
    ).fetchone()
    imports, exports, world = row
    return float(imports), float(exports), (float(exports) / world if world else 0.0)


def importer_supplier_share(
    con: duckdb.DuckDBPyConnection,
    paths: ArtifactPaths,
    codes: tuple[str, ...],
    importers: tuple[str, ...],
) -> dict[tuple[str, str], float]:
    """(importer, supplier) -> existing share, for winner headroom."""
    if not importers:
        return {}
    code_list = ",".join(f"'{c}'" for c in codes)
    importer_list = ",".join(f"'{i}'" for i in importers)
    rows = con.execute(
        f"""
        WITH basket AS (
            SELECT importer, supplier, SUM(value_kusd) AS v
            FROM '{paths.ddr}'
            WHERE hs6 IN ({code_list}) AND importer IN ({importer_list})
            GROUP BY 1, 2
        )
        SELECT importer, supplier, v / SUM(v) OVER (PARTITION BY importer)
        FROM basket
        """
    ).fetchall()
    return {(imp, sup): share for imp, sup, share in rows}
