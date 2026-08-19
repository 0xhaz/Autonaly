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
    context: str

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
            context=f"{base}/context/{version}/{year}/countries.json",
        )


@functools.lru_cache(maxsize=1)
def country_context(context_path: str) -> dict[str, dict]:
    """World Bank context, loaded once per process and cached.

    Small enough (218 countries) to hold in memory, and read through the same
    artifact layout as everything else so cutover needs no special case.
    """
    import json
    from pathlib import Path

    if context_path.startswith("gs://"):
        import duckdb as _duckdb

        con = _duckdb.connect()
        con.execute("INSTALL httpfs; LOAD httpfs;")
        raw = con.execute(f"SELECT content FROM read_text('{context_path}')").fetchone()[0]
        return json.loads(raw).get("countries", {})

    path = Path(context_path)
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8")).get("countries", {})


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
    exclude_importers: tuple[str, ...] = (),
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
    # A country behind a chokepoint buying from its co-sources does not route
    # that trade through the strait — Qatar's imports from Saudi Arabia are
    # intra-Gulf and never see Hormuz. Without this, a source state ranks as a
    # victim of its own chokepoint's closure.
    if exclude_importers:
        importer_clause += (
            " AND importer NOT IN ("
            + ",".join(f"'{i}'" for i in exclude_importers)
            + ")"
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


def country_economy(
    con: duckdb.DuckDBPyConnection,
    paths: ArtifactPaths,
    country: str,
    basket_codes: dict[str, tuple[str, ...]],
) -> dict:
    """What a country actually trades, across every basket rather than one event.

    This is the professional lens: a ranking says a country is exposed, but the
    question behind it is usually "how much does this matter to them" — which
    needs total trade and the commodity groups that carry it.
    """
    totals = con.execute(
        f"""
        SELECT
            COALESCE(SUM(CASE WHEN exporter = '{country}' THEN value_kusd END), 0),
            COALESCE(SUM(CASE WHEN importer = '{country}' THEN value_kusd END), 0)
        FROM '{paths.flows}'
        """
    ).fetchone()

    exports_total, imports_total = float(totals[0]), float(totals[1])

    def basket_split(direction: str) -> list[dict]:
        column = "exporter" if direction == "exports" else "importer"
        rows: list[dict] = []
        for key, codes in basket_codes.items():
            code_list = ",".join(f"'{c}'" for c in codes)
            value = con.execute(
                f"""
                SELECT COALESCE(SUM(value_kusd), 0) FROM '{paths.flows}'
                WHERE {column} = '{country}' AND hs6 IN ({code_list})
                """
            ).fetchone()[0]
            if value:
                rows.append({"basket": key, "value_kusd": round(float(value), 1)})
        denominator = exports_total if direction == "exports" else imports_total
        for row in rows:
            row["share_of_trade"] = (
                round(row["value_kusd"] / denominator, 4) if denominator else 0.0
            )
        rows.sort(key=lambda r: r["value_kusd"], reverse=True)
        return rows[:6]

    return {
        "total_exports_kusd": round(exports_total, 1),
        "total_imports_kusd": round(imports_total, 1),
        "top_export_baskets": basket_split("exports"),
        "top_import_baskets": basket_split("imports"),
    }


def source_world_share_matrix(
    con: duckdb.DuckDBPyConnection,
    paths: ArtifactPaths,
    basket_codes: dict[str, tuple[str, ...]],
    min_share: float,
) -> dict[str, dict[str, float]]:
    """exporter -> {basket: share of world trade}, floored at min_share.

    One scan of the flows serves both the custom-conflict builder and the
    eligible-country list; callers cache the result per (version, year).
    """
    mapping_rows = ",".join(
        f"('{code}','{basket}')"
        for basket, codes in basket_codes.items()
        for code in codes
    )
    rows = con.execute(
        f"""
        WITH mapping(hs6, basket) AS (VALUES {mapping_rows}),
        by_source AS (
            SELECT m.basket, f.exporter, SUM(f.value_kusd) AS v
            FROM '{paths.flows}' f JOIN mapping m USING (hs6)
            GROUP BY 1, 2
        )
        SELECT basket, exporter, v / SUM(v) OVER (PARTITION BY basket) AS share
        FROM by_source
        QUALIFY share >= {min_share}
        """
    ).fetchall()
    matrix: dict[str, dict[str, float]] = {}
    for basket, exporter, share in rows:
        matrix.setdefault(exporter, {})[basket] = float(share)
    return matrix
