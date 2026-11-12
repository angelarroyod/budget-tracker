"""
Writes the fictional finance ledger (data/ledger_fy2026.csv) from the seeded tracker.

Finance's ledger is meant to be an independent record; here it is derived from the tracker and then
deliberately broken, so the pipeline has something real to catch. January–August post cleanly.
September, the month being closed, carries six defects:

  1. duplicate posting     an IT expense posted twice under two journal numbers       → rejected
  2. unknown account       a Facilities sundry charge on account 6199, which doesn't exist → rejected
  3. amount mismatch       a Facilities invoice came in $1,240.00 above the tracker   → exception
  4. ledger only           expedited freight finance posted that nobody entered       → exception
  5. tracker only          an accrued Operations expense finance never posted         → exception
  6. wrong FX rate         an EHS peso invoice converted at 19.91 instead of 19.10    → rejected, and its
                           expense shows as tracker-only, linked to the rejected row

Deterministic: the same seeded database always produces the same bytes. A test fails if the
committed file drifts from what this generates.
"""

import csv
import io
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

from . import CURRENT_MONTH, UNBUDGETED_ACCOUNT
from .ledger import COLUMNS

CLOSING_MONTH = CURRENT_MONTH - 1  # September
WRONG_RATE = "19.910000"
MISMATCH_CENTS = 124_000


def _amount(cents: int) -> str:
    return f"{cents // 100}.{cents % 100:02d}"


def render_ledger(conn: psycopg.Connection) -> str:
    with conn.cursor(row_factory=dict_row) as cur:
        expenses = cur.execute(
            """
            select e.id, e.fiscal_month, (e.created_at at time zone 'UTC')::date as posted, t.key as team,
              t.cost_center, coalesce(li.account_code, %s) as account_code, e.description,
              e.currency::text as currency, e.amount_orig_cents, e.fx_rate::text as fx_rate,
              e.amount_usd_cents, e.status::text as status
            from expenses e
            join teams t on t.id = e.team_id
            left join line_items li on li.id = e.line_item_id
            where e.fiscal_month < %s and e.status in ('actual', 'accrued')
              and e.approval in ('none', 'approved') and not e.next_fy
            order by e.fiscal_month, e.id
            """,
            (UNBUDGETED_ACCOUNT, CURRENT_MONTH),
        ).fetchall()

    def first(team: str, **match) -> int:
        for e in expenses:
            if e["fiscal_month"] == CLOSING_MONTH and e["team"] == team and all(e[k] == v for k, v in match.items()):
                return e["id"]
        raise LookupError(f"seed has no September {team} expense matching {match}")

    missing = first("operations", status="accrued")
    mismatch = first("facilities", currency="USD")
    wrong_fx = first("ehs", currency="MXN")
    duplicate = first("it", currency="USD")

    rows: list[dict] = []
    for e in expenses:
        if e["posted"].month != e["fiscal_month"]:
            raise ValueError(f"expense {e['id']} was entered outside its fiscal month; posting date would be wrong")
        if e["id"] == missing:
            continue
        orig, usd, rate = e["amount_orig_cents"], e["amount_usd_cents"], e["fx_rate"]
        if e["id"] == mismatch:
            orig += MISMATCH_CENTS
            usd += MISMATCH_CENTS
        if e["id"] == wrong_fx:
            rate = WRONG_RATE
            usd = int((Decimal(orig) / Decimal(rate)).quantize(Decimal(1), ROUND_HALF_UP))
        rows.append({
            "month": e["fiscal_month"], "posting_date": e["posted"].isoformat(), "cost_center": e["cost_center"],
            "account_code": e["account_code"], "tracker_ref": str(e["id"]), "description": e["description"],
            "currency": e["currency"], "amount_orig": _amount(orig), "fx_rate": rate, "amount_usd": _amount(usd),
        })

    september_extras = [
        {**next(r for r in rows if r["tracker_ref"] == str(duplicate)), "posting_date": "2026-09-28"},
        {"month": 9, "posting_date": "2026-09-29", "cost_center": "CC-150", "account_code": "6500",
         "tracker_ref": "", "description": "Expedited freight on spare parts", "currency": "USD",
         "amount_orig": "3870.00", "fx_rate": "1.000000", "amount_usd": "3870.00"},
        {"month": 9, "posting_date": "2026-09-30", "cost_center": "CC-110", "account_code": "6199",
         "tracker_ref": "", "description": "Facilities sundry charge", "currency": "USD",
         "amount_orig": "2150.00", "fx_rate": "1.000000", "amount_usd": "2150.00"},
    ]
    rows += september_extras  # already in month order: September is the last month in the file

    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(COLUMNS)
    seq: dict[int, int] = {}
    for r in rows:
        seq[r["month"]] = seq.get(r["month"], 0) + 1
        journal = f"JE-2026-{r['month']:02d}-{seq[r['month']]:04d}"
        writer.writerow([journal, "1", *(r[c] for c in COLUMNS[2:])])
    return out.getvalue()


def write_ledger(conn: psycopg.Connection, path: str | Path) -> None:
    Path(path).write_bytes(render_ledger(conn).encode("utf-8"))
