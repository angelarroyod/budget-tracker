import csv
import io
import re
from pathlib import Path

import pytest

from budget_pipelines import CURRENT_MONTH, FISCAL_YEAR
from budget_pipelines.generate import MISMATCH_CENTS, WRONG_RATE, render_ledger
from budget_pipelines.ledger import COLUMNS, ingest_ledger

ROOT = Path(__file__).parents[2]
LEDGER = ROOT / "pipelines" / "data" / "ledger_fy2026.csv"


def one(conn, query, *params):
    rows = conn.execute(query, params).fetchall()
    assert len(rows) == 1, f"expected one row, got {rows}"
    return rows[0]


def fingerprint(conn):
    """A hash of every business row the pipeline writes; the run log (ingest_runs) is left out on purpose."""
    return {
        table: conn.execute(f"select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from {table} t").fetchone()[0]
        for table in ("ledger_postings", "ledger_rejects", "recon_items")
    }


@pytest.fixture
def loaded(conn):
    ingest_ledger(conn, LEDGER)
    return conn


# ── The committed file ─────────────────────────────────────────────────────────────────────────

def test_committed_ledger_is_what_the_generator_produces(conn):
    assert render_ledger(conn) == LEDGER.read_bytes().decode("utf-8"), (
        "data/ledger_fy2026.csv is stale: run `python -m budget_pipelines generate-ledger data/ledger_fy2026.csv`"
    )


def test_constants_match_the_app():
    forecast_ts = (ROOT / "src" / "lib" / "forecast.ts").read_text(encoding="utf-8")
    assert f"FISCAL_YEAR = {FISCAL_YEAR};" in forecast_ts
    assert f"CURRENT_MONTH = {CURRENT_MONTH};" in forecast_ts


# ── Idempotency ────────────────────────────────────────────────────────────────────────────────

def test_rerunning_the_same_file_is_a_no_op(conn):
    first = ingest_ledger(conn, LEDGER)
    before = fingerprint(conn)
    second = ingest_ledger(conn, LEDGER)

    assert fingerprint(conn) == before
    assert (second.inserted, second.updated, second.unchanged) == (0, 0, first.inserted)
    assert second.rejected == first.rejected  # the same rows fail again, but no reject is added twice
    assert second.recon == first.recon
    # The run log is the one thing that grows: two runs, both recorded.
    assert conn.execute("select status::text from ingest_runs order by id").fetchall() == [("succeeded",), ("succeeded",)]


def test_a_corrected_row_updates_in_place(conn, tmp_path):
    ingest_ledger(conn, LEDGER)
    lines = LEDGER.read_text(encoding="utf-8").splitlines(keepends=True)
    # Finance re-sends the file with the first posting re-described: same natural key, new content.
    lines[1] = lines[1].replace("HVAC maintenance contract", "HVAC maintenance contract (January)")
    corrected = tmp_path / "ledger_fy2026_v2.csv"
    corrected.write_text("".join(lines), encoding="utf-8", newline="")

    result = ingest_ledger(conn, corrected)
    assert (result.inserted, result.updated) == (0, 1)
    assert one(conn, "select description, updated_run_id from ledger_postings where journal_id = 'JE-2026-01-0001'") == (
        "HVAC maintenance contract (January)", result.run_id)


def resolve(conn, kind: str, comment: str = "Checked with AP; timing difference."):
    return conn.execute(
        """update recon_items set resolution = %s, resolved_by = (select id from users where role = 'finance'),
             resolved_at = now() where kind = %s returning id""",
        (comment, kind),
    ).fetchone()[0]


def test_a_rerun_keeps_resolutions(conn):
    ingest_ledger(conn, LEDGER)
    item = resolve(conn, "ledger_only")
    ingest_ledger(conn, LEDGER)
    assert one(conn, "select resolution from recon_items where id = %s", item) == ("Checked with AP; timing difference.",)


def test_a_resolution_is_cleared_when_the_amounts_behind_it_change(conn):
    ingest_ledger(conn, LEDGER)
    item = resolve(conn, "amount_mismatch")
    expense_id = one(conn, "select expense_id from recon_items where id = %s", item)[0]
    # The tracker amount is corrected, but not to the ledger's figure: still a mismatch, new facts.
    conn.execute("update expenses set amount_usd_cents = amount_usd_cents + 100 where id = %s", (expense_id,))
    ingest_ledger(conn, LEDGER)
    assert one(conn, "select kind::text, resolution from recon_items where id = %s", item) == ("amount_mismatch", None)


def test_a_resolved_exception_survives_even_after_it_stops_applying(conn):
    ingest_ledger(conn, LEDGER)
    item = resolve(conn, "amount_mismatch", "Tracker understated; champion to correct.")
    expense_id, ledger = one(conn, "select expense_id, ledger_usd_cents from recon_items where id = %s", item)
    conn.execute("update expenses set amount_usd_cents = %s where id = %s", (ledger, expense_id))
    ingest_ledger(conn, LEDGER)
    # The expense now matches, and the explained mismatch stays on record next to it.
    kinds = conn.execute("select kind::text, resolution is not null from recon_items where expense_id = %s order by kind",
                         (expense_id,)).fetchall()
    assert kinds == [("amount_mismatch", True), ("matched", False)]


# ── One test per deliberate defect in the fictional ledger ─────────────────────────────────────

def test_defect_duplicate_posting_is_rejected_and_the_expense_counts_once(loaded):
    reject = one(loaded, "select tracker_ref, detail from ledger_rejects where reason = 'duplicate_posting'")
    assert "already posted" in reject[1]
    assert loaded.execute("select kind::text from recon_items where expense_id = %s", (int(reject[0]),)).fetchall() == [("matched",)]


def test_defect_unknown_account_code_is_rejected(loaded):
    raw, detail = one(loaded, "select raw, detail from ledger_rejects where reason = 'unknown_account'")
    assert raw["account_code"] == "6199"
    assert detail == "account 6199 is not in the chart of accounts"
    assert loaded.execute("select 1 from ledger_postings where account_code = '6199'").fetchall() == []


def test_defect_amount_mismatch_is_an_exception(loaded):
    month, tracker, ledger = one(loaded, "select fiscal_month, tracker_usd_cents, ledger_usd_cents from recon_items where kind = 'amount_mismatch'")
    assert month == 9
    assert ledger - tracker == MISMATCH_CENTS


def test_defect_posting_missing_from_tracker_is_ledger_only(loaded):
    description, ref, usd = one(loaded, """
        select p.description, p.tracker_ref, r.ledger_usd_cents
        from recon_items r join ledger_postings p on p.id = r.posting_id where r.kind = 'ledger_only'""")
    assert (description, ref, usd) == ("Expedited freight on spare parts", None, 387_000)


def test_defect_tracker_expense_missing_from_ledger_is_tracker_only(loaded):
    expense_id, status = one(loaded, """
        select r.expense_id, e.status::text from recon_items r join expenses e on e.id = r.expense_id
        where r.kind = 'tracker_only' and r.reject_id is null""")
    assert status == "accrued"
    assert loaded.execute("select 1 from ledger_rejects where tracker_ref = %s", (str(expense_id),)).fetchall() == []


def test_defect_wrong_fx_rate_is_rejected_and_linked_to_its_expense(loaded):
    reject_id, ref, raw, detail = one(loaded, "select id, tracker_ref, raw, detail from ledger_rejects where reason = 'fx_rate_mismatch'")
    assert raw["currency"] == "MXN" and raw["fx_rate"] == WRONG_RATE
    assert detail == f"rate {WRONG_RATE} differs from the month's rate 19.100000"
    # Not silently dropped: the expense it was for shows up as an exception, pointing at the rejected row.
    assert one(loaded, "select expense_id from recon_items where kind = 'tracker_only' and reject_id = %s", reject_id) == (int(ref),)


def test_only_the_closing_month_has_exceptions(loaded):
    assert loaded.execute("select distinct fiscal_month from recon_items where kind <> 'matched'").fetchall() == [(9,)]
    assert loaded.execute("select count(distinct fiscal_month) from recon_items").fetchone() == (9,)  # Jan–Sep
    assert loaded.execute("select count(*) from ledger_rejects").fetchone() == (3,)


# ── Validation rules on hand-made rows ────────────────────────────────────────────────────────

GOOD = {
    "journal_id": "JE-TEST-0001", "line_no": "1", "posting_date": "2026-03-10", "cost_center": "CC-110",
    "account_code": "6100", "tracker_ref": "", "description": "Test row", "currency": "USD",
    "amount_orig": "100.00", "fx_rate": "1.000000", "amount_usd": "100.00",
}


def write_csv(path: Path, *rows: dict) -> Path:
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    path.write_text(out.getvalue(), encoding="utf-8", newline="")
    return path


@pytest.mark.parametrize(
    ("change", "reason", "detail"),
    [
        ({"currency": ""}, "missing_field", "missing currency"),
        ({"posting_date": "2026-02-30"}, "bad_format", 'posting_date "2026-02-30" is not a YYYY-MM-DD date'),
        ({"amount_orig": "12.345"}, "bad_format", 'amount_orig "12.345" is not a positive amount with up to 2 decimals'),
        ({"amount_usd": "0.00"}, "bad_format", 'amount_usd "0.00" is not a positive amount with up to 2 decimals'),
        ({"line_no": "x"}, "bad_format", 'line_no "x" is not a line number'),
        ({"tracker_ref": "E12"}, "bad_format", 'tracker_ref "E12" is not an expense number'),
        ({"currency": "EUR"}, "bad_format", 'currency "EUR" is not USD or MXN'),
        ({"posting_date": "2025-12-31"}, "month_out_of_range", "posted 2025-12-31, outside FY2026"),
        ({"posting_date": "2026-10-02"}, "month_out_of_range", "posted 2026-10-02, in the current or a future month"),
        ({"cost_center": "CC-999"}, "unknown_cost_center", "cost center CC-999 is not a team"),
        ({"fx_rate": "1.100000"}, "fx_rate_mismatch", "USD row with rate 1.100000"),
        ({"amount_usd": "101.00"}, "fx_amount_mismatch", "100.00 USD at 1.000000 is not 101.00 USD"),
    ],
)
def test_validation_rule(conn, tmp_path, change, reason, detail):
    result = ingest_ledger(conn, write_csv(tmp_path / "one.csv", GOOD | change))
    assert (result.rejected, result.inserted) == (1, 0)
    assert one(conn, "select reason::text, detail from ledger_rejects") == (reason, detail)


def test_a_valid_hand_made_row_loads(conn, tmp_path):
    result = ingest_ledger(conn, write_csv(tmp_path / "one.csv", GOOD))
    assert (result.rejected, result.inserted) == (0, 1)


def test_mxn_amount_must_reproduce_from_its_own_rate(conn, tmp_path):
    row = GOOD | {"currency": "MXN", "fx_rate": "17.400000", "amount_orig": "1740.00", "amount_usd": "100.00"}
    assert ingest_ledger(conn, write_csv(tmp_path / "ok.csv", row)).rejected == 0
    bad = row | {"journal_id": "JE-TEST-0002", "amount_usd": "100.01"}
    assert ingest_ledger(conn, write_csv(tmp_path / "bad.csv", bad)).rejected == 1
    assert one(conn, "select reason::text from ledger_rejects") == ("fx_amount_mismatch",)


def test_same_key_twice_in_one_file_keeps_the_first(conn, tmp_path):
    result = ingest_ledger(conn, write_csv(tmp_path / "dup.csv", GOOD, GOOD | {"description": "Second copy"}))
    assert (result.rejected, result.inserted) == (1, 1)
    assert one(conn, "select reason::text, row_number from ledger_rejects") == ("duplicate_key", 2)
    assert one(conn, "select description from ledger_postings") == ("Test row",)


# ── Structural failures fail the run, visibly ─────────────────────────────────────────────────

@pytest.mark.parametrize(
    ("content", "error"),
    [
        ("journal,amount\nJE-1,10.00\n", "unexpected header"),
        (",".join(COLUMNS) + "\nJE-1,1,2026-03-10\n", "row 1 has 3 fields"),
    ],
)
def test_a_malformed_file_fails_the_run_and_records_why(conn, tmp_path, content, error):
    path = tmp_path / "broken.csv"
    path.write_text(content, encoding="utf-8")
    with pytest.raises(ValueError, match=re.escape(error)):
        ingest_ledger(conn, path)
    status, message = one(conn, "select status::text, error from ingest_runs")
    assert status == "failed" and error in message
    assert conn.execute("select count(*) from ledger_postings").fetchone() == (0,)
