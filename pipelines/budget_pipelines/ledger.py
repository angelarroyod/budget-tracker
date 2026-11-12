"""
Finance-ledger ingestion: CSV → ledger_staging → validation → ledger_rejects | ledger_postings → reconciliation.

The set logic is SQL; Python reads the file, runs the steps in order and records the run.
- Structural problems (missing file, wrong header, ragged row, bad encoding) fail the whole run.
- Row problems reject that row with a reason; the rest of the file still loads.
- Loading is an upsert on the natural key (journal_id, line_no) that only writes rows whose values
  changed, and rejects are keyed by (file hash, row), so re-running the same file changes nothing.
"""

import csv
import hashlib
import io
from dataclasses import dataclass
from pathlib import Path

import psycopg

from . import CURRENT_MONTH, FISCAL_YEAR, UNBUDGETED_ACCOUNT
from .log import log
from .reconcile import reconcile

COLUMNS = (
    "journal_id", "line_no", "posting_date", "cost_center", "account_code", "tracker_ref",
    "description", "currency", "amount_orig", "fx_rate", "amount_usd",
)


@dataclass(frozen=True)
class RunResult:
    run_id: int
    rows_read: int
    rejected: int
    inserted: int
    updated: int
    unchanged: int
    recon: dict[str, int]


def read_rows(data: bytes) -> list[tuple[str | None, ...]]:
    reader = csv.reader(io.StringIO(data.decode("utf-8"), newline=""))
    header = tuple(next(reader, ()))
    if header != COLUMNS:
        raise ValueError(f"unexpected header {list(header)}; expected {list(COLUMNS)}")
    rows = []
    for n, row in enumerate(reader, start=1):
        if len(row) != len(COLUMNS):
            raise ValueError(f"row {n} has {len(row)} fields; expected {len(COLUMNS)}")
        rows.append(tuple(v.strip() or None for v in row))  # blank = missing
    return rows


# Every check is one WHEN, in order, and CASE stops at the first match, so a cast only runs on
# values the earlier branches already proved castable. Result: "reason|human-readable detail".
CHECK_ROWS = """
create temp table ledger_checked on commit drop as
with checked as (
  select s.row_number, s.journal_id, s.line_no, s.tracker_ref, s.currency, s.amount_orig,
    case
      when num_nulls(s.journal_id, s.line_no, s.posting_date, s.cost_center, s.account_code,
                     s.currency, s.amount_orig, s.fx_rate, s.amount_usd) > 0
        then 'missing_field|missing ' || concat_ws(', ',
          case when s.journal_id is null then 'journal_id' end, case when s.line_no is null then 'line_no' end,
          case when s.posting_date is null then 'posting_date' end, case when s.cost_center is null then 'cost_center' end,
          case when s.account_code is null then 'account_code' end, case when s.currency is null then 'currency' end,
          case when s.amount_orig is null then 'amount_orig' end, case when s.fx_rate is null then 'fx_rate' end,
          case when s.amount_usd is null then 'amount_usd' end)
      when s.line_no !~ '^[1-9][0-9]{0,3}$'
        then 'bad_format|line_no "' || s.line_no || '" is not a line number'
      when s.posting_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not pg_input_is_valid(s.posting_date, 'date')
        then 'bad_format|posting_date "' || s.posting_date || '" is not a YYYY-MM-DD date'
      when s.currency not in ('USD', 'MXN')
        then 'bad_format|currency "' || s.currency || '" is not USD or MXN'
      when s.amount_orig !~ '^[0-9]+(\\.[0-9]{1,2})?$' or s.amount_orig ~ '^[0.]+$'
        then 'bad_format|amount_orig "' || s.amount_orig || '" is not a positive amount with up to 2 decimals'
      when s.amount_usd !~ '^[0-9]+(\\.[0-9]{1,2})?$' or s.amount_usd ~ '^[0.]+$'
        then 'bad_format|amount_usd "' || s.amount_usd || '" is not a positive amount with up to 2 decimals'
      when s.fx_rate !~ '^[0-9]{1,6}(\\.[0-9]{1,6})?$' or s.fx_rate ~ '^[0.]+$'
        then 'bad_format|fx_rate "' || s.fx_rate || '" is not a positive rate with up to 6 decimals'
      when s.tracker_ref is not null and s.tracker_ref !~ '^[1-9][0-9]{0,8}$'
        then 'bad_format|tracker_ref "' || s.tracker_ref || '" is not an expense number'
      when extract(year from s.posting_date::date) <> %(fiscal_year)s
        then 'month_out_of_range|posted ' || s.posting_date || ', outside FY' || %(fiscal_year)s
      when extract(month from s.posting_date::date) >= %(current_month)s
        then 'month_out_of_range|posted ' || s.posting_date || ', in a month that is still open'
      when not exists (select 1 from teams t where t.cost_center = s.cost_center)
        then 'unknown_cost_center|cost center ' || s.cost_center || ' is not a team'
      when s.account_code <> %(unbudgeted)s
           and not exists (select 1 from line_items li where li.account_code = s.account_code)
        then 'unknown_account|account ' || s.account_code || ' is not in the chart of accounts'
      when s.currency = 'USD' and s.fx_rate::numeric <> 1
        then 'fx_rate_mismatch|USD row with rate ' || s.fx_rate
      when s.currency = 'MXN' and s.fx_rate::numeric <> coalesce(
             (select f.usd_mxn from fx_rates f where f.month = extract(month from s.posting_date::date)), -1)
        then 'fx_rate_mismatch|rate ' || s.fx_rate || ' differs from the month''s rate '
             || coalesce((select f.usd_mxn::text from fx_rates f where f.month = extract(month from s.posting_date::date)), 'none')
      -- Same rounding as src/lib/fx.ts: USD cents = round(original cents / stored rate).
      when round(s.amount_orig::numeric * 100 / s.fx_rate::numeric) <> s.amount_usd::numeric * 100
        then 'fx_amount_mismatch|' || s.amount_orig || ' ' || s.currency || ' at ' || s.fx_rate
             || ' is not ' || s.amount_usd || ' USD'
    end as problem
  from ledger_staging s
  where s.run_id = %(run_id)s
),
ok as (
  select c.*, (c.amount_orig::numeric * 100)::bigint as orig_cents,
    row_number() over (partition by c.journal_id, c.line_no order by c.row_number) as key_seq,
    row_number() over (partition by c.tracker_ref, c.currency, c.amount_orig::numeric order by c.row_number) as posting_seq
  from checked c
  where c.problem is null
),
-- Duplicates are judged only among rows that passed every other check.
duplicates as (
  select o.row_number,
    case
      when o.key_seq > 1
        then 'duplicate_key|journal ' || o.journal_id || ' line ' || o.line_no || ' appears earlier in the file'
      when o.tracker_ref is not null and (
        o.posting_seq > 1 -- an earlier row in this file posts the same expense for the same amount
        or exists (select 1 from ledger_postings p
                   where p.tracker_ref = o.tracker_ref::int and p.currency::text = o.currency
                     and p.amount_orig_cents = o.orig_cents
                     and (p.journal_id, p.line_no) <> (o.journal_id, o.line_no::smallint)))
        then 'duplicate_posting|expense ' || o.tracker_ref || ' is already posted for ' || o.amount_orig || ' ' || o.currency
    end as problem
  from ok o
)
select c.row_number,
  split_part(coalesce(c.problem, d.problem), '|', 1)::reject_reason as reason,
  split_part(coalesce(c.problem, d.problem), '|', 2) as detail
from checked c
left join duplicates d using (row_number)
"""

INSERT_REJECTS = """
insert into ledger_rejects (source_sha256, row_number, run_id, reason, detail, tracker_ref, raw)
select %(sha)s, s.row_number, %(run_id)s, k.reason, k.detail, s.tracker_ref,
  to_jsonb(s) - 'run_id' - 'row_number'
from ledger_checked k
join ledger_staging s on s.run_id = %(run_id)s and s.row_number = k.row_number
where k.reason is not null
on conflict (source_sha256, row_number) do nothing
"""

# `where … is distinct from …` makes an unchanged row a no-op (not even a dead tuple), and
# `xmax = 0` is Postgres' tell for "this row was inserted, not updated".
UPSERT_POSTINGS = """
insert into ledger_postings (journal_id, line_no, posting_date, fiscal_month, team_id, account_code,
  tracker_ref, description, currency, amount_orig_cents, fx_rate, amount_usd_cents, loaded_run_id)
select s.journal_id, s.line_no::smallint, s.posting_date::date, extract(month from s.posting_date::date),
  t.id, s.account_code, s.tracker_ref::int, coalesce(s.description, ''), s.currency::currency,
  (s.amount_orig::numeric * 100)::bigint, s.fx_rate::numeric, (s.amount_usd::numeric * 100)::bigint,
  %(run_id)s
from ledger_checked k
join ledger_staging s on s.run_id = %(run_id)s and s.row_number = k.row_number
join teams t on t.cost_center = s.cost_center
where k.reason is null
on conflict (journal_id, line_no) do update set
  posting_date = excluded.posting_date, fiscal_month = excluded.fiscal_month, team_id = excluded.team_id,
  account_code = excluded.account_code, tracker_ref = excluded.tracker_ref,
  description = excluded.description, currency = excluded.currency,
  amount_orig_cents = excluded.amount_orig_cents, fx_rate = excluded.fx_rate,
  amount_usd_cents = excluded.amount_usd_cents, updated_run_id = excluded.loaded_run_id
where (ledger_postings.posting_date, ledger_postings.team_id, ledger_postings.account_code,
       ledger_postings.tracker_ref, ledger_postings.description, ledger_postings.currency,
       ledger_postings.amount_orig_cents, ledger_postings.fx_rate, ledger_postings.amount_usd_cents)
  is distinct from
      (excluded.posting_date, excluded.team_id, excluded.account_code, excluded.tracker_ref,
       excluded.description, excluded.currency, excluded.amount_orig_cents, excluded.fx_rate,
       excluded.amount_usd_cents)
returning (xmax = 0) as inserted
"""


def ingest_ledger(conn: psycopg.Connection, path: str | Path) -> RunResult:
    """Loads one ledger file and reconciles. Records the run, including failures, in ingest_runs."""
    path = Path(path)
    data = path.read_bytes()
    sha = hashlib.sha256(data).hexdigest()

    # The run row is written on its own so a failed load still leaves a trace.
    with conn.transaction():
        run_id = conn.execute(
            "insert into ingest_runs (source_file, source_sha256) values (%s, %s) returning id", (path.name, sha)
        ).fetchone()[0]
    log("ledger.run_started", run_id=run_id, file=path.name, sha256=sha)

    try:
        with conn.transaction():
            # One load at a time: two concurrent runs would race on the duplicate checks.
            conn.execute("select pg_advisory_xact_lock(hashtext('ledger_ingest'))")
            result = _load(conn, run_id, sha, read_rows(data))
    except Exception as err:
        with conn.transaction():
            conn.execute(
                "update ingest_runs set status = 'failed', finished_at = now(), error = %s where id = %s",
                (str(err)[:2000], run_id),
            )
        log("ledger.run_failed", level="error", run_id=run_id, error=str(err))
        raise

    log("ledger.run_succeeded", run_id=run_id, rows_read=result.rows_read, rejected=result.rejected,
        inserted=result.inserted, updated=result.updated, unchanged=result.unchanged, recon=result.recon)
    return result


def _load(conn: psycopg.Connection, run_id: int, sha: str, rows: list[tuple]) -> RunResult:
    params = {"run_id": run_id, "sha": sha, "fiscal_year": FISCAL_YEAR, "current_month": CURRENT_MONTH,
              "unbudgeted": UNBUDGETED_ACCOUNT}

    # ponytail: staging keeps only the latest file; executemany is fine for a few thousand rows, COPY beyond that.
    conn.execute("delete from ledger_staging")
    with conn.cursor() as cur:
        cur.executemany(
            f"insert into ledger_staging (run_id, row_number, {', '.join(COLUMNS)}) "
            f"values (%s, %s, {', '.join(['%s'] * len(COLUMNS))})",
            [(run_id, n, *row) for n, row in enumerate(rows, start=1)],
        )

    conn.execute("drop table if exists ledger_checked")
    conn.execute(CHECK_ROWS, params)
    rejected = conn.execute("select count(*) from ledger_checked where reason is not null").fetchone()[0]
    conn.execute(INSERT_REJECTS, params)

    written = conn.execute(UPSERT_POSTINGS, params).fetchall()
    inserted = sum(1 for (was_insert,) in written if was_insert)
    updated = len(written) - inserted
    unchanged = len(rows) - rejected - len(written)

    recon = reconcile(conn, run_id)
    conn.execute(
        """update ingest_runs set status = 'succeeded', finished_at = now(), rows_read = %s, rows_rejected = %s,
             rows_inserted = %s, rows_updated = %s, rows_unchanged = %s where id = %s""",
        (len(rows), rejected, inserted, updated, unchanged, run_id),
    )
    return RunResult(run_id, len(rows), rejected, inserted, updated, unchanged, recon)
