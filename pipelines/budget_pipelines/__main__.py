"""
python -m budget_pipelines ingest-ledger data/ledger_fy2026.csv
python -m budget_pipelines generate-ledger data/ledger_fy2026.csv
Reads DATABASE_URL. Exits non-zero on failure, after logging it.
"""

import argparse
import sys

from . import connect
from .generate import write_ledger
from .ledger import ingest_ledger


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="budget_pipelines")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("ingest-ledger", help="validate, load and reconcile a ledger CSV").add_argument("file")
    commands.add_parser("generate-ledger", help="write the fictional ledger from the seeded tracker").add_argument("file")
    args = parser.parse_args(argv)

    with connect() as conn:
        if args.command == "generate-ledger":
            write_ledger(conn, args.file)
            return 0
        try:
            ingest_ledger(conn, args.file)
        except Exception:
            return 1  # already logged as ledger.run_failed and recorded in ingest_runs
    return 0


if __name__ == "__main__":
    sys.exit(main())
