# ADR 0002: Ledger rows are keyed by journal_id + line_no; re-running a file changes nothing

**Status:** accepted · 2026-11

## Context

The same ledger file will be loaded more than once: the nightly job runs every night, an operator
re-runs after a failure, finance re-sends a corrected file. Each load must leave the data as if it
had run once, and a corrected file must update rows instead of duplicating them.

## Decision

- **Natural key = `(journal_id, line_no)`**, unique in `ledger_postings`. It is the identity finance
  itself uses for a ledger line, so it is stable across re-sends. Loading is
  `INSERT … ON CONFLICT (journal_id, line_no) DO UPDATE … WHERE (columns) IS DISTINCT FROM (excluded)`:
  an unchanged row is not written at all, a changed one is updated and stamped with `updated_run_id`.
- **Rejects are keyed by `(file sha256, row number)`**, inserted with `ON CONFLICT DO NOTHING`, so the
  same bad row in the same file is recorded once.
- **Reconciliation items are keyed by outcome and subject** (`matched:E42`,
  `ledger_only:JE-2026-09-0067:1`), recomputed and upserted the same way. An outcome that no longer
  holds is deleted.
- **The run log is the exception.** `ingest_runs` gets one row per run, success or failure, because
  "this ran at 03:04 and changed nothing" is information.

pytest checks it: loading the committed file twice gives identical table fingerprints and
`inserted = updated = 0` on the second run.

## Alternatives considered

- **Skip files whose hash was already loaded.** Simpler, but a corrected re-send with a new hash
  would duplicate every unchanged line. It also hides whether the rules still agree with the data.
- **A surrogate key from the file (row number).** Breaks as soon as finance re-sorts the file.
- **Truncate and reload.** Idempotent, but loses `loaded_run_id` history and briefly empties the
  table for readers.

## Consequences

- A posting finance *deletes* from a later file stays loaded; there is no "this file is the full
  ledger" mode. Reversals would arrive as new lines, which the pipeline doesn't accept yet (amounts
  must be positive).
- Business duplicates (the same expense posted under a second journal) aren't caught by the key and
  have their own rule: `duplicate_posting`.
