# pipelines

Finance-ledger ingestion and reconciliation. Python orchestrates; the rules are SQL
([ADR 0001](../docs/adr/0001-pipeline-language.md)).

```
budget_pipelines/
  ledger.py      read CSV → ledger_staging → validate → ledger_rejects | upsert ledger_postings
  reconcile.py   ledger_postings vs tracker expenses → recon_items
  generate.py    writes data/ledger_fy2026.csv from the seeded tracker, with six defects
  log.py         one JSON object per log line
tests/           pytest, against a migrated and seeded Postgres (each test rolls back)
data/            the fictional ledger file
```

From the repo root, with `pnpm db:local` running and the database migrated and seeded:

```bash
pnpm test:pipeline       # pytest
pnpm pipeline            # load and reconcile data/ledger_fy2026.csv
pnpm pipeline:generate   # rewrite the CSV after changing the seed
```

## The fictional ledger

Generated from the seeded tracker, then broken on purpose. January–August post cleanly; September,
the month being closed, has six defects, each with its own test in `tests/test_ledger.py`:

| Defect | In the file | Outcome |
|---|---|---|
| Duplicate posting | An IT expense posted again as `JE-2026-09-0066` | Rejected `duplicate_posting`; the expense still matches once |
| Unknown account | `JE-2026-09-0068`, account 6199 | Rejected `unknown_account` |
| Amount mismatch | A Facilities invoice $1,240.00 above the tracker | Exception `amount_mismatch` |
| Missing from the tracker | `JE-2026-09-0067`, expedited freight, no tracker reference | Exception `ledger_only` |
| Missing from the ledger | An accrued Operations expense, never posted | Exception `tracker_only` |
| Wrong FX rate | An EHS peso invoice at 19.91 instead of 19.10 | Rejected `fx_rate_mismatch`; its expense is `tracker_only`, linked to the reject |

## Rules

Row checks run in this order; the first failure is the reason
(`reject_reason` in `src/db/schema.ts`): required fields → formats (date, line number, 2-decimal
amounts, 6-decimal rate, USD/MXN) → posting date in FY2026 and in a month that's no longer open →
cost center is a team → account is a line item's (or 6990, unbudgeted) → rate equals that month's
rate in `fx_rates` → the row's own rate reproduces its USD amount → not a duplicate key → not the
same expense and amount under a second journal.

A wrong header, a row with the wrong number of fields or bad UTF-8 fails the whole run instead:
the file is broken, not a row. Either way the run is recorded in `ingest_runs`.

Reconciliation compares postings with the expenses finance books: actual and accrued, not pending
or rejected, not next fiscal year, in a month the ledger covers. Postings are summed per expense,
so an invoice split over several lines still matches.
