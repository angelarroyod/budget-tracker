import shutil
import subprocess
from pathlib import Path

from budget_pipelines import connect
from budget_pipelines.ledger import ingest_ledger

ROOT = Path(__file__).parents[2]
LEDGER = ROOT / "pipelines" / "data" / "ledger_fy2026.csv"

# Every table, minus the columns that record *when* something ran rather than *what* it holds.
TABLES = {
    "teams": [], "users": [], "line_items": [], "plans": [], "fx_rates": [], "settings": [],
    "expenses": ["updated_at"], "approval_requests": [], "approval_steps": [],
    "ingest_runs": ["started_at", "finished_at"],
    "ledger_staging": [], "ledger_rejects": [], "ledger_postings": [], "recon_items": [],
}


def nightly() -> dict[str, str]:
    """What the nightly job does (reseed, then load the ledger), then a hash of every table."""
    pnpm = shutil.which("pnpm")
    assert pnpm, "pnpm is needed to run the TypeScript seed"
    subprocess.run([pnpm, "exec", "tsx", "src/db/seed.ts"], cwd=ROOT, check=True, capture_output=True)
    with connect() as conn:
        ingest_ledger(conn, LEDGER)
        return {
            table: conn.execute(
                f"select md5(coalesce(string_agg(x, '|' order by x), '')) from "
                f"(select (to_jsonb(t) - %s::text[])::text as x from {table} t) rows",
                (drop,),
            ).fetchone()[0]
            for table, drop in TABLES.items()
        }


def test_nightly_reset_and_load_are_byte_identical():
    first, second = nightly(), nightly()
    assert first == second
