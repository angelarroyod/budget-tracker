import os

import psycopg

# Mirrors src/lib/forecast.ts (the demo is frozen at October 2026). tests/test_ledger.py fails if they drift.
FISCAL_YEAR = 2026
CURRENT_MONTH = 10
# Ledger account for spend with no line item (the tracker's "Unbudgeted"); every other code must be a line item's.
UNBUDGETED_ACCOUNT = "6990"


def connect() -> psycopg.Connection:
    # prepare_threshold=None: Neon's pooled endpoint (PgBouncer, transaction mode) can't hold prepared statements.
    return psycopg.connect(os.environ["DATABASE_URL"], autocommit=True, prepare_threshold=None)
