import os

import psycopg
import pytest


@pytest.fixture
def conn():
    """
    A connection to the seeded database (`pnpm db:migrate && pnpm db:seed` first) inside one transaction
    that is rolled back afterwards, so tests never see each other's runs and never touch real data.
    The pipeline's own `with conn.transaction()` blocks become savepoints inside it.
    """
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.fail("DATABASE_URL is not set; point it at a migrated, seeded database")
    with psycopg.connect(url, prepare_threshold=None) as c:
        c.execute("truncate recon_items, ledger_postings, ledger_rejects, ledger_staging, ingest_runs restart identity")
        yield c
        c.rollback()
