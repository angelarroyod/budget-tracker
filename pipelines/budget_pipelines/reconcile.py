"""
Reconciliation: every tracker expense the ledger should contain, against every ledger posting.

The tracker side is what finance books: actual and accrued spend (not purchase orders still only
committed), not pending or rejected, not next fiscal year, in a month the ledger covers.
Postings are matched to expenses by tracker_ref and summed per expense, so an invoice split
across lines still matches. Outcomes, per expense or per unmatched posting:
  matched          ledger USD = tracker USD
  amount_mismatch  both sides exist, amounts differ
  tracker_only     no posting; linked to the rejected ledger row when that's why
  ledger_only      a posting with no (eligible) tracker expense behind it
"""

import psycopg

DESIRED = """
create temp table recon_desired on commit drop as
with tracker as (
  select e.id, e.team_id, e.fiscal_month, e.amount_usd_cents
  from expenses e
  where e.fiscal_month in (select distinct fiscal_month from ledger_postings)
    and e.status in ('actual', 'accrued')
    and e.approval in ('none', 'approved')
    and not e.next_fy
),
ledger_by_expense as (
  select tracker_ref, sum(amount_usd_cents)::bigint as usd
  from ledger_postings
  where tracker_ref is not null
  group by tracker_ref
),
latest_reject as (
  select distinct on (tracker_ref) tracker_ref, id
  from ledger_rejects
  where tracker_ref is not null
  order by tracker_ref, id desc
),
by_expense as (
  select
    case when l.usd is null then 'tracker_only' when l.usd = t.amount_usd_cents then 'matched'
         else 'amount_mismatch' end::recon_kind as kind,
    t.fiscal_month, t.team_id, t.id as expense_id, null::int as posting_id,
    case when l.usd is null then r.id end as reject_id,
    t.amount_usd_cents as tracker_usd_cents, l.usd as ledger_usd_cents
  from tracker t
  left join ledger_by_expense l on l.tracker_ref = t.id
  left join latest_reject r on r.tracker_ref = t.id::text
)
select kind::text || ':E' || expense_id as item_key, * from by_expense
union all
select 'ledger_only:' || p.journal_id || ':' || p.line_no, 'ledger_only', p.fiscal_month, p.team_id,
  null, p.id, null, null, p.amount_usd_cents
from ledger_postings p
where p.tracker_ref is null or not exists (select 1 from tracker t where t.id = p.tracker_ref)
"""

UPSERT = """
insert into recon_items (item_key, kind, fiscal_month, team_id, expense_id, posting_id, reject_id,
  tracker_usd_cents, ledger_usd_cents, run_id)
select d.*, %(run_id)s from recon_desired d
on conflict (item_key) do update set
  fiscal_month = excluded.fiscal_month, team_id = excluded.team_id, posting_id = excluded.posting_id,
  reject_id = excluded.reject_id, tracker_usd_cents = excluded.tracker_usd_cents,
  ledger_usd_cents = excluded.ledger_usd_cents
where (recon_items.fiscal_month, recon_items.team_id, recon_items.posting_id, recon_items.reject_id,
       recon_items.tracker_usd_cents, recon_items.ledger_usd_cents)
  is distinct from
      (excluded.fiscal_month, excluded.team_id, excluded.posting_id, excluded.reject_id,
       excluded.tracker_usd_cents, excluded.ledger_usd_cents)
"""


def reconcile(conn: psycopg.Connection, run_id: int) -> dict[str, int]:
    """Recomputes recon_items in place and returns the count per outcome."""
    conn.execute("drop table if exists recon_desired")
    conn.execute(DESIRED)
    conn.execute(UPSERT, {"run_id": run_id})
    # An outcome that no longer holds (say, a mismatch the tracker has since corrected) goes away.
    conn.execute("delete from recon_items where item_key not in (select item_key from recon_desired)")
    return dict(conn.execute("select kind::text, count(*) from recon_items group by kind order by kind").fetchall())
