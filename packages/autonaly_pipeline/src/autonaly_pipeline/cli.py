"""Refinery entrypoint.

    make pipeline                       # default: HS22, 2024
    uv run python -m autonaly_pipeline.cli --year 2023

Extracts nothing and loads nothing into a server: DuckDB reads the CSV in place,
the gates run, then artifacts land through the ArtifactStore port — filesystem
locally, GCS after cutover, same code either way.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[4]
load_dotenv(REPO_ROOT / ".env.local")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="autonaly-pipeline")
    parser.add_argument("--year", type=int, default=2024)
    parser.add_argument("--revision", default="HS22")
    parser.add_argument("--version", default="V202601")
    parser.add_argument(
        "--raw-dir", type=Path, default=REPO_ROOT / "data" / "baci",
        help="directory holding the extracted BACI CSVs",
    )
    parser.add_argument("--threads", type=int, default=None)
    parser.add_argument(
        "--skip-gates", action="store_true",
        help="emit artifacts even if DQ gates fail (debugging only)",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="  %(message)s")

    from autonaly_core import build_artifact_store

    from .artifacts import emit
    from .baci import BuildConfig, build
    from .quality import run_gates

    cfg = BuildConfig(
        raw_dir=args.raw_dir,
        revision=args.revision,
        version=args.version,
        year=args.year,
    )

    print(f"\n  Autonaly refinery — {cfg.revision} {cfg.version} year {cfg.year}\n")

    result = build(cfg, threads=args.threads)
    con, summary = result["con"], result["summary"]

    print(
        f"  {summary['raw_rows']:,} raw rows -> {summary['flow_rows']:,} flows "
        f"({summary['importers']} importers x {summary['products']:,} products)\n"
    )

    report = run_gates(con, summary["unresolved_m49"])
    print(report.render())
    print()

    if not args.skip_gates:
        report.raise_if_failed()

    store = build_artifact_store()
    out = emit(
        con,
        store,
        summary,
        quality=[{"name": r.name, "passed": r.passed, "detail": r.detail} for r in report.results],
    )

    total_mb = sum(out["written"].values()) / 1_048_576
    print(f"  wrote {len(out['written'])} artifacts ({total_mb:.1f} MB)")
    for key in out["written"]:
        print(f"    {key}")
    print(f"    {out['manifest_key']}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
