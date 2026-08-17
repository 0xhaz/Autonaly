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
) -> list[tuple]:
    """Per importer: share of basket imports from the disrupted sources, plus HHI.

    HHI is recomputed at basket level rather than read from the per-HS6 artifact,
    because concentration in "wheat" is not the average of concentration in four
    separate wheat codes.
    """
    code_list = ",".join(f"'{c}'" for c in codes)
    source_list = ",".join(f"'{s}'" for s in sources)

    return con.execute(
        f"""
        WITH basket AS (
            SELECT importer, supplier, SUM(value_kusd) AS v
            FROM '{paths.ddr}'
            WHERE hs6 IN ({code_list})
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
