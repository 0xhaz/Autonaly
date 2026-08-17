"""Artifact emission (D25 — versioned artifacts are the single source of truth).

Keys are laid out exactly as they will exist in GCS, so the cutover is a copy
rather than a migration (workplan.md §1):

    baci/{version}/{year}/flows.parquet
    exposure/{version}/{year}/ddr.parquet
    exposure/{version}/{year}/hhi.parquet
    exposure/{version}/{year}/manifest.json
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import duckdb
    from autonaly_core.ports import ArtifactStore

METHODOLOGY_VERSION = "1.0.0"
"""Bumped whenever the DDR/HHI formulas change. Stamped into every artifact so a
briefing can always be traced to the formula that produced it (D14)."""


def _key(kind: str, version: str, year: int, name: str) -> str:
    return f"{kind}/{version}/{year}/{name}"


def _copy_table(
    con: duckdb.DuckDBPyConnection, table: str, store: ArtifactStore, key: str
) -> int:
    """Write a DuckDB table to Parquet and hand the bytes to the store.

    Goes via a temp file because DuckDB's COPY writes to a path, while the store
    port speaks bytes — that indirection is what lets the same code target GCS.
    """
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "out.parquet"
        con.execute(f"COPY {table} TO '{path}' (FORMAT PARQUET, COMPRESSION ZSTD)")
        data = path.read_bytes()
    store.write(key, data)
    return len(data)


def emit(
    con: duckdb.DuckDBPyConnection,
    store: ArtifactStore,
    summary: dict,
    quality: list[dict] | None = None,
) -> dict[str, object]:
    version, year = summary["version"], summary["year"]

    tables = [
        ("flows", "baci", "flows.parquet"),
        ("ddr", "exposure", "ddr.parquet"),
        ("hhi", "exposure", "hhi.parquet"),
    ]
    written: dict[str, int] = {}
    for table, kind, name in tables:
        key = _key(kind, version, year, name)
        written[key] = _copy_table(con, table, store, key)

    manifest = {
        "methodology_version": METHODOLOGY_VERSION,
        "source": "CEPII BACI",
        "attribution": "Data: BACI/CEPII (Etalab 2.0)",
        **summary,
        "artifacts": {k: {"bytes": v} for k, v in written.items()},
        "quality_gates": quality or [],
    }
    manifest_key = _key("exposure", version, year, "manifest.json")
    store.write(manifest_key, json.dumps(manifest, indent=2, default=str).encode())

    return {"manifest_key": manifest_key, "written": written}
